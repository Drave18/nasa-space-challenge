//! Polite, bounded transport: one pooled client, one shared start scheduler,
//! manual redirects, explicit retry policy, bounded decoded body size.

use std::collections::HashSet;
use std::fmt;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, SystemTime};

use regex::Regex;
use reqwest::header::{CONTENT_TYPE, LOCATION, RETRY_AFTER};
use reqwest::{Client, StatusCode, redirect};
use tokio::sync::Semaphore;
use tokio::time::{Instant, sleep, sleep_until};
use url::Url;

pub const MAX_BODY_BYTES: usize = 4 * 1024 * 1024;
pub const MAX_REDIRECTS: usize = 5;

/// Random jitter in production; fixed value for deterministic tests.
#[derive(Debug, Clone, Copy)]
pub enum Jitter {
    UpTo(Duration),
    Fixed(Duration),
}

impl Jitter {
    fn sample(self) -> Duration {
        match self {
            Jitter::Fixed(d) => d,
            Jitter::UpTo(max) => Duration::from_millis(fastrand::u64(0..=max.as_millis() as u64)),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct RetryPolicy {
    /// Total attempts, including the first.
    pub max_attempts: u32,
    pub base_backoff: Duration,
    pub max_backoff: Duration,
    pub jitter: Jitter,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max_attempts: 5,
            base_backoff: Duration::from_millis(1000),
            max_backoff: Duration::from_millis(60_000),
            jitter: Jitter::UpTo(Duration::from_millis(250)),
        }
    }
}

/// Delay after failed attempt index `n` (0-based). A valid server-directed
/// `Retry-After` is never capped by the local backoff cap.
pub fn retry_delay(policy: &RetryPolicy, n: u32, retry_after: Option<Duration>, jitter: Duration) -> Duration {
    let factor = 1u32.checked_shl(n).unwrap_or(u32::MAX);
    let backoff = policy
        .base_backoff
        .saturating_mul(factor)
        .min(policy.max_backoff)
        + jitter;
    match retry_after {
        Some(ra) => ra.max(backoff),
        None => backoff,
    }
}

/// `Retry-After` as delta-seconds or HTTP-date. Past dates are zero; malformed
/// values are `None`.
pub fn parse_retry_after(value: &str, now: SystemTime) -> Option<Duration> {
    let v = value.trim();
    if v.is_empty() {
        return None;
    }
    if v.bytes().all(|b| b.is_ascii_digit()) {
        return v.parse::<u64>().ok().map(Duration::from_secs);
    }
    let when = httpdate::parse_http_date(v).ok()?;
    Some(when.duration_since(now).unwrap_or(Duration::ZERO))
}

/// Single shared start scheduler for the archive host.
pub struct Scheduler {
    interval: Duration,
    permits: Semaphore,
    state: Mutex<SchedState>,
}

#[derive(Default)]
struct SchedState {
    next_start: Option<Instant>,
    cooldown_until: Option<Instant>,
}

impl Scheduler {
    pub fn new(concurrency: usize, interval: Duration) -> Arc<Self> {
        Arc::new(Self {
            interval,
            permits: Semaphore::new(concurrency.max(1)),
            state: Mutex::new(SchedState::default()),
        })
    }

    /// Wait for an in-flight slot and the next permitted start time. The
    /// deadline is re-checked after every wake-up, so a cooldown registered
    /// while waiting is always honoured. Nothing is held across the sleep
    /// except the concurrency permit.
    pub async fn admit(&self) -> tokio::sync::SemaphorePermit<'_> {
        let permit = self.permits.acquire().await.expect("semaphore never closed");
        loop {
            let wait_until = {
                let mut st = self.state.lock().expect("scheduler lock");
                let now = Instant::now();
                let earliest = [st.next_start, st.cooldown_until].into_iter().flatten().max();
                match earliest {
                    Some(t) if t > now => Some(t),
                    _ => {
                        st.next_start = Some(now + self.interval);
                        None
                    }
                }
            };
            match wait_until {
                Some(t) => sleep_until(t).await,
                None => return permit,
            }
        }
    }

    /// Host-wide cooldown: no request starts before `now + delay`.
    pub fn cooldown(&self, delay: Duration) {
        let until = Instant::now() + delay;
        let mut st = self.state.lock().expect("scheduler lock");
        st.cooldown_until = Some(st.cooldown_until.map_or(until, |c| c.max(until)));
    }
}

/// URL canonicalisation and fetch allow-listing for one archive origin.
#[derive(Debug, Clone)]
pub struct UrlPolicy {
    origin: Url,
}

static RE_APOLLO_PATH: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^/planetary/lunar/apollo\d+info\.html$").unwrap());

pub const ENTRY_PAGES: [&str; 4] = [
    "/planetary/lunar/lunartimeline.html",
    "/planetary/chronology_mars.html",
    "/planetary/lunar/apolloland.html",
    "/planetary/lunar/lunar_artifact_impacts.html",
];

impl UrlPolicy {
    pub fn new(origin: Url) -> Self {
        Self { origin }
    }

    pub fn origin(&self) -> &Url {
        &self.origin
    }

    /// Trim, resolve, require HTTP(S), drop the fragment, and upgrade legacy
    /// HTTP archive links when the configured origin is HTTPS.
    pub fn resolve(&self, base: &Url, href: &str) -> Option<Url> {
        let href = href.trim();
        if href.is_empty() || href.starts_with('#') {
            return None;
        }
        let mut u = base.join(href).ok()?;
        if !matches!(u.scheme(), "http" | "https") {
            return None;
        }
        u.set_fragment(None);
        Some(self.normalize(u))
    }

    pub fn normalize(&self, mut u: Url) -> Url {
        u.set_fragment(None);
        if self.origin.scheme() == "https"
            && u.scheme() == "http"
            && u.host_str() == self.origin.host_str()
            && u.port().is_none()
        {
            let _ = u.set_scheme("https");
        }
        u
    }

    pub fn same_origin(&self, u: &Url) -> bool {
        u.scheme() == self.origin.scheme()
            && u.host_str() == self.origin.host_str()
            && u.port_or_known_default() == self.origin.port_or_known_default()
    }

    /// Only the entry pages, the supported overviews and NMC detail pages with
    /// a lone `id` parameter may ever be requested.
    pub fn fetchable(&self, u: &Url) -> bool {
        if !self.same_origin(u) {
            return false;
        }
        let p = u.path();
        if ENTRY_PAGES.contains(&p)
            || p == "/planetary/viking.html"
            || p == "/planetary/mesur.html"
            || RE_APOLLO_PATH.is_match(p)
        {
            return true;
        }
        if p == "/nmc/spacecraft/display.action" {
            let keys: Vec<_> = u.query_pairs().map(|(k, _)| k.into_owned()).collect();
            return keys == ["id"] && u.query_pairs().next().is_some_and(|(_, v)| !v.trim().is_empty());
        }
        false
    }
}

#[derive(Debug, Clone)]
pub struct FetchError {
    pub url: String,
    pub status: Option<u16>,
    pub attempts: u32,
    pub message: String,
}

impl fmt::Display for FetchError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.url, self.message)?;
        if let Some(s) = self.status {
            write!(f, " (HTTP {s})")?;
        }
        write!(f, " after {} attempt(s)", self.attempts)
    }
}

impl std::error::Error for FetchError {}

#[derive(Debug)]
pub struct Page {
    pub url: Url,
    pub html: String,
}

enum Hop {
    Body(String),
    Redirect(String),
}

enum Attempt {
    Done(Hop),
    Fatal { message: String, status: Option<u16> },
    Retry { message: String, status: Option<u16>, retry_after: Option<Duration>, cooldown: bool },
}

pub struct Fetcher {
    client: Client,
    sched: Arc<Scheduler>,
    retry: RetryPolicy,
    policy: UrlPolicy,
}

impl Fetcher {
    pub fn new(policy: UrlPolicy, sched: Arc<Scheduler>, retry: RetryPolicy) -> anyhow::Result<Self> {
        let client = Client::builder()
            .user_agent(concat!("nssdca-scraper/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30))
            .redirect(redirect::Policy::none())
            .retry(reqwest::retry::never())
            .build()?;
        Ok(Self { client, sched, retry, policy })
    }

    pub fn policy(&self) -> &UrlPolicy {
        &self.policy
    }

    pub async fn get(&self, url: &Url) -> Result<Page, FetchError> {
        let mut current = url.clone();
        let mut visited: HashSet<Url> = HashSet::new();
        let mut attempts = 0u32;
        for _ in 0..=MAX_REDIRECTS {
            if !self.policy.fetchable(&current) {
                return Err(err(&current, None, attempts, "URL is not an allowed archive source"));
            }
            if !visited.insert(current.clone()) {
                return Err(err(&current, None, attempts, "redirect loop"));
            }
            match self.hop(&current, &mut attempts).await? {
                Hop::Body(html) => return Ok(Page { url: current, html }),
                Hop::Redirect(loc) => {
                    let Some(next) = self.policy.resolve(&current, &loc) else {
                        return Err(err(&current, None, attempts, &format!("unusable redirect target {loc:?}")));
                    };
                    if !self.policy.same_origin(&next) {
                        return Err(err(&current, None, attempts, &format!("redirect to disallowed origin {next}")));
                    }
                    current = next;
                }
            }
        }
        Err(err(url, None, attempts, "too many redirects"))
    }

    async fn hop(&self, url: &Url, attempts: &mut u32) -> Result<Hop, FetchError> {
        let mut last = (String::new(), None);
        for n in 0..self.retry.max_attempts {
            *attempts += 1;
            match self.attempt(url).await {
                Attempt::Done(h) => return Ok(h),
                Attempt::Fatal { message, status } => return Err(err(url, status, *attempts, &message)),
                Attempt::Retry { message, status, retry_after, cooldown } => {
                    last = (message, status);
                    if n + 1 == self.retry.max_attempts {
                        break;
                    }
                    let delay = retry_delay(&self.retry, n, retry_after, self.retry.jitter.sample());
                    if cooldown {
                        self.sched.cooldown(delay);
                    }
                    sleep(delay).await;
                }
            }
        }
        Err(err(url, last.1, *attempts, &format!("retries exhausted: {}", last.0)))
    }

    async fn attempt(&self, url: &Url) -> Attempt {
        let _permit = self.sched.admit().await;
        let mut resp = match self.client.get(url.clone()).send().await {
            Ok(r) => r,
            Err(e) => {
                let retryable = e.is_timeout() || e.is_connect() || e.is_request() || e.is_body();
                let message = e.without_url().to_string();
                return if retryable {
                    Attempt::Retry { message, status: None, retry_after: None, cooldown: false }
                } else {
                    Attempt::Fatal { message, status: None }
                };
            }
        };
        let status = resp.status();
        let code = Some(status.as_u16());
        if status.is_redirection() {
            return match resp.headers().get(LOCATION).and_then(|v| v.to_str().ok()) {
                Some(loc) => Attempt::Done(Hop::Redirect(loc.to_owned())),
                None => Attempt::Fatal { message: "redirect without Location".into(), status: code },
            };
        }
        if !status.is_success() {
            let message = format!("unexpected HTTP status {status}");
            let retryable = matches!(
                status,
                StatusCode::REQUEST_TIMEOUT
                    | StatusCode::TOO_MANY_REQUESTS
                    | StatusCode::INTERNAL_SERVER_ERROR
                    | StatusCode::BAD_GATEWAY
                    | StatusCode::SERVICE_UNAVAILABLE
                    | StatusCode::GATEWAY_TIMEOUT
            );
            if !retryable {
                return Attempt::Fatal { message, status: code };
            }
            let retry_after = if matches!(status, StatusCode::TOO_MANY_REQUESTS | StatusCode::SERVICE_UNAVAILABLE) {
                resp.headers()
                    .get(RETRY_AFTER)
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| parse_retry_after(v, SystemTime::now()))
            } else {
                None
            };
            return Attempt::Retry {
                message,
                status: code,
                retry_after,
                cooldown: status == StatusCode::TOO_MANY_REQUESTS,
            };
        }

        let content_type = resp
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        let mime = content_type
            .as_deref()
            .map(|c| c.split(';').next().unwrap_or("").trim().to_ascii_lowercase());
        let xml_needs_sniff = match mime.as_deref() {
            None | Some("") | Some("text/html") | Some("application/xhtml+xml") => false,
            Some("text/xml") => true,
            Some(other) => {
                return Attempt::Fatal { message: format!("non-HTML content type {other}"), status: code };
            }
        };

        let mut body: Vec<u8> = Vec::new();
        loop {
            match resp.chunk().await {
                Ok(Some(chunk)) => {
                    if body.len() + chunk.len() > MAX_BODY_BYTES {
                        return Attempt::Fatal {
                            message: format!("response body exceeds {MAX_BODY_BYTES} bytes"),
                            status: code,
                        };
                    }
                    body.extend_from_slice(&chunk);
                }
                Ok(None) => break,
                Err(e) => {
                    return Attempt::Retry {
                        message: format!("body read failed: {}", e.without_url()),
                        status: code,
                        retry_after: None,
                        cooldown: false,
                    };
                }
            }
        }
        match decode_body(&body, content_type.as_deref(), xml_needs_sniff) {
            Ok(s) => Attempt::Done(Hop::Body(s)),
            Err(message) => Attempt::Fatal { message, status: code },
        }
    }
}

fn err(url: &Url, status: Option<u16>, attempts: u32, message: &str) -> FetchError {
    FetchError { url: url.to_string(), status, attempts, message: message.to_owned() }
}

static RE_CT_CHARSET: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?i)charset\s*=\s*"?([A-Za-z0-9_\-:.]+)"#).unwrap());
static RE_META_CHARSET: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?i)<meta[^>]+charset\s*=\s*["']?([A-Za-z0-9_\-:.]+)"#).unwrap());

/// Decode once with the declared charset (header, then `<meta>`, default
/// UTF-8). Decoding errors and oversized decoded text are rejected.
pub fn decode_body(bytes: &[u8], content_type: Option<&str>, require_html_marker: bool) -> Result<String, String> {
    let label = content_type
        .and_then(|c| RE_CT_CHARSET.captures(c))
        .map(|c| c[1].to_owned())
        .or_else(|| {
            let head = String::from_utf8_lossy(&bytes[..bytes.len().min(2048)]);
            RE_META_CHARSET.captures(&head).map(|c| c[1].to_owned())
        });
    let enc = match label {
        Some(l) => encoding_rs::Encoding::for_label(l.as_bytes()).ok_or_else(|| format!("unknown charset {l}"))?,
        None => encoding_rs::UTF_8,
    };
    let text = enc
        .decode_without_bom_handling_and_without_replacement(bytes)
        .ok_or_else(|| format!("body is not valid {}", enc.name()))?;
    if text.len() > MAX_BODY_BYTES {
        return Err(format!("decoded body exceeds {MAX_BODY_BYTES} bytes"));
    }
    if require_html_marker {
        let head: String = text.chars().take(4096).collect::<String>().to_ascii_lowercase();
        if !head.contains("<html") && !head.contains("<!doctype html") {
            return Err("text/xml body is not recognizable HTML/XHTML".into());
        }
    }
    Ok(text.into_owned())
}
