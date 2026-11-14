use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use nssdca_scraper::http::*;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tokio::time::{Instant, sleep};
use url::Url;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

const PAGE: &str = "/planetary/lunar/lunartimeline.html";
const OTHER: &str = "/planetary/chronology_mars.html";
const HTML: &str = "<html><body>ok</body></html>";

fn secs(s: u64) -> Duration {
    Duration::from_secs(s)
}

fn fast_policy(max_attempts: u32) -> RetryPolicy {
    RetryPolicy {
        max_attempts,
        base_backoff: Duration::from_millis(1),
        max_backoff: Duration::from_millis(4),
        jitter: Jitter::Fixed(Duration::ZERO),
    }
}

fn fetcher(server: &MockServer, attempts: u32) -> (Fetcher, Url) {
    let origin = Url::parse(&server.uri()).unwrap();
    let f = Fetcher::new(UrlPolicy::new(origin.clone()), Scheduler::new(4, Duration::ZERO), fast_policy(attempts)).unwrap();
    (f, origin)
}

fn html() -> ResponseTemplate {
    ResponseTemplate::new(200).set_body_raw(HTML.as_bytes().to_vec(), "text/html; charset=utf-8")
}

async fn hits(server: &MockServer) -> usize {
    server.received_requests().await.unwrap().len()
}

#[test]
fn backoff_doubles_then_caps_and_adds_jitter() {
    let p = RetryPolicy { jitter: Jitter::Fixed(Duration::from_millis(100)), ..RetryPolicy::default() };
    let j = Duration::from_millis(100);
    let got: Vec<_> = (0..4).map(|n| retry_delay(&p, n, None, j)).collect();
    assert_eq!(got, [1100, 2100, 4100, 8100].map(Duration::from_millis));
    assert_eq!(retry_delay(&p, 10, None, j), Duration::from_millis(60_100), "local cap is 60 s");
}

#[test]
fn server_directed_delay_is_greater_of_header_and_backoff_and_never_capped() {
    let p = RetryPolicy::default();
    let z = Duration::ZERO;
    assert_eq!(retry_delay(&p, 0, Some(secs(30)), z), secs(30));
    assert_eq!(retry_delay(&p, 3, Some(secs(2)), z), secs(8), "backoff wins when larger");
    assert_eq!(retry_delay(&p, 0, Some(secs(3600)), z), secs(3600), "no cap on valid server delay");
}

#[test]
fn retry_after_forms() {
    let now = UNIX_EPOCH + secs(1_000_000);
    assert_eq!(parse_retry_after("120", now), Some(secs(120)));
    assert_eq!(parse_retry_after(" 7 ", now), Some(secs(7)));
    assert_eq!(parse_retry_after(&httpdate::fmt_http_date(now + secs(90)), now), Some(secs(90)));
    assert_eq!(parse_retry_after(&httpdate::fmt_http_date(now - secs(90)), now), Some(Duration::ZERO));
    assert_eq!(parse_retry_after("soon", now), None);
    assert_eq!(parse_retry_after("-5", now), None);
    assert_eq!(parse_retry_after("", now), None);
    let _ = SystemTime::now();
}

#[test]
fn charset_handling() {
    assert_eq!(decode_body(&[0xE9], Some("text/html; charset=iso-8859-1"), false).unwrap(), "é");
    assert_eq!(decode_body(b"<meta charset=\"windows-1252\">\x93", None, false).unwrap().chars().last(), Some('\u{201c}'));
    assert!(decode_body(&[0xE9], Some("text/html"), false).is_err(), "invalid UTF-8 is rejected");
    assert!(decode_body(b"<foo/>", Some("text/xml"), true).is_err());
    assert!(decode_body(b"<HTML><body/></HTML>", Some("text/xml"), true).is_ok());
}

#[tokio::test(start_paused = true)]
async fn scheduler_spaces_starts_and_honours_cooldown_set_while_waiting() {
    let sched = Scheduler::new(8, secs(1));
    let t0 = Instant::now();
    let starts = Arc::new(Mutex::new(Vec::new()));
    let mut tasks = Vec::new();
    for _ in 0..4 {
        let (s, st) = (sched.clone(), starts.clone());
        tasks.push(tokio::spawn(async move {
            let _p = s.admit().await;
            st.lock().await.push(Instant::now() - t0);
        }));
    }
    sleep(Duration::from_millis(500)).await;
    sched.cooldown(secs(10)); // until t = 10.5 s while three tasks are waiting
    for t in tasks {
        t.await.unwrap();
    }
    let v = starts.lock().await.clone();
    assert_eq!(v.len(), 4);
    assert_eq!(v[0], Duration::ZERO);
    for w in &v[1..] {
        assert!(*w >= Duration::from_millis(10_500), "started during cooldown: {v:?}");
    }
    for pair in v.windows(2) {
        assert!(pair[1] - pair[0] >= secs(1), "start spacing violated: {v:?}");
    }
}

#[tokio::test(start_paused = true)]
async fn scheduler_never_exceeds_concurrency() {
    let sched = Scheduler::new(2, Duration::ZERO);
    let (cur, max) = (Arc::new(AtomicUsize::new(0)), Arc::new(AtomicUsize::new(0)));
    let tasks: Vec<_> = (0..8)
        .map(|_| {
            let (s, c, m) = (sched.clone(), cur.clone(), max.clone());
            tokio::spawn(async move {
                let _p = s.admit().await;
                let n = c.fetch_add(1, Ordering::SeqCst) + 1;
                m.fetch_max(n, Ordering::SeqCst);
                sleep(Duration::from_millis(10)).await;
                c.fetch_sub(1, Ordering::SeqCst);
            })
        })
        .collect();
    for t in tasks {
        t.await.unwrap();
    }
    assert_eq!(max.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn retries_429_then_503_then_succeeds_in_three_attempts() {
    let server = MockServer::start().await;
    Mock::given(method("GET")).and(path(PAGE))
        .respond_with(ResponseTemplate::new(429).insert_header("retry-after", "0"))
        .up_to_n_times(1).mount(&server).await;
    Mock::given(method("GET")).and(path(PAGE)).respond_with(ResponseTemplate::new(503)).up_to_n_times(1).mount(&server).await;
    Mock::given(method("GET")).and(path(PAGE)).respond_with(html()).mount(&server).await;
    let (f, origin) = fetcher(&server, 5);
    let page = f.get(&origin.join(PAGE).unwrap()).await.unwrap();
    assert!(page.html.contains("ok"));
    assert_eq!(hits(&server).await, 3);
}

#[tokio::test]
async fn permanent_statuses_are_not_retried() {
    let server = MockServer::start().await;
    Mock::given(method("GET")).and(path(PAGE)).respond_with(ResponseTemplate::new(404)).mount(&server).await;
    let (f, origin) = fetcher(&server, 5);
    let e = f.get(&origin.join(PAGE).unwrap()).await.unwrap_err();
    assert_eq!((e.status, e.attempts), (Some(404), 1));
    assert!(e.to_string().contains(PAGE));
    assert_eq!(hits(&server).await, 1);
}

#[tokio::test]
async fn persistent_503_stops_after_five_attempts() {
    let server = MockServer::start().await;
    Mock::given(method("GET")).and(path(PAGE)).respond_with(ResponseTemplate::new(503)).mount(&server).await;
    let (f, origin) = fetcher(&server, 5);
    let e = f.get(&origin.join(PAGE).unwrap()).await.unwrap_err();
    assert_eq!((e.status, e.attempts), (Some(503), 5));
    assert_eq!(hits(&server).await, 5);
}

#[tokio::test]
async fn non_html_content_is_rejected_without_retry() {
    let server = MockServer::start().await;
    Mock::given(method("GET")).and(path(PAGE))
        .respond_with(ResponseTemplate::new(200).set_body_raw(b"{}".to_vec(), "application/json"))
        .mount(&server).await;
    let (f, origin) = fetcher(&server, 5);
    let e = f.get(&origin.join(PAGE).unwrap()).await.unwrap_err();
    assert!(e.message.contains("non-HTML"), "{e}");
    assert_eq!(hits(&server).await, 1);
}

#[tokio::test]
async fn manual_redirect_is_followed_through_the_allow_list() {
    let server = MockServer::start().await;
    Mock::given(method("GET")).and(path(PAGE)).respond_with(ResponseTemplate::new(302).insert_header("location", OTHER)).mount(&server).await;
    Mock::given(method("GET")).and(path(OTHER)).respond_with(html()).mount(&server).await;
    let (f, origin) = fetcher(&server, 5);
    let page = f.get(&origin.join(PAGE).unwrap()).await.unwrap();
    assert_eq!(page.url.path(), OTHER);
    assert_eq!(hits(&server).await, 2);
}

#[tokio::test]
async fn redirect_loops_and_external_targets_are_rejected() {
    let server = MockServer::start().await;
    Mock::given(method("GET")).and(path(PAGE)).respond_with(ResponseTemplate::new(302).insert_header("location", OTHER)).mount(&server).await;
    Mock::given(method("GET")).and(path(OTHER)).respond_with(ResponseTemplate::new(302).insert_header("location", PAGE)).mount(&server).await;
    let (f, origin) = fetcher(&server, 5);
    let e = f.get(&origin.join(PAGE).unwrap()).await.unwrap_err();
    assert!(e.message.contains("loop"), "{e}");

    let server = MockServer::start().await;
    Mock::given(method("GET")).and(path(PAGE))
        .respond_with(ResponseTemplate::new(302).insert_header("location", "http://example.org/evil.html"))
        .mount(&server).await;
    let (f, origin) = fetcher(&server, 5);
    let e = f.get(&origin.join(PAGE).unwrap()).await.unwrap_err();
    assert!(e.message.contains("disallowed origin"), "{e}");
    assert_eq!(hits(&server).await, 1);
}

#[tokio::test]
async fn urls_outside_the_allow_list_are_never_requested() {
    let server = MockServer::start().await;
    let (f, origin) = fetcher(&server, 5);
    for p in ["/nmc/spacecraft/query?name=x", "/nmc/spacecraft/display.action?id=A&ex=1", "/nmc/spacecraft/display.action", "/nmc/personnel/display.action?id=1"] {
        assert!(f.get(&origin.join(p).unwrap()).await.is_err(), "{p}");
    }
    assert_eq!(hits(&server).await, 0);
}

#[tokio::test]
async fn chunked_body_over_the_limit_is_rejected_without_trusting_content_length() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        let (mut s, _) = listener.accept().await.unwrap();
        let mut buf = [0u8; 4096];
        let _ = s.read(&mut buf).await;
        let _ = s.write_all(b"HTTP/1.1 200 OK\r\ncontent-type: text/html\r\ntransfer-encoding: chunked\r\n\r\n").await;
        let chunk = vec![b'a'; 1 << 20];
        for _ in 0..6 {
            if s.write_all(b"100000\r\n").await.is_err() || s.write_all(&chunk).await.is_err() || s.write_all(b"\r\n").await.is_err() {
                return;
            }
        }
        let _ = s.write_all(b"0\r\n\r\n").await;
    });
    let origin = Url::parse(&format!("http://{addr}")).unwrap();
    let f = Fetcher::new(UrlPolicy::new(origin.clone()), Scheduler::new(1, Duration::ZERO), fast_policy(5)).unwrap();
    let e = f.get(&origin.join(PAGE).unwrap()).await.unwrap_err();
    assert!(e.message.contains("exceeds"), "{e}");
    assert_eq!(e.attempts, 1);
}

#[test]
fn production_url_policy_upgrades_http_and_drops_fragments() {
    let p = UrlPolicy::new(Url::parse("https://nssdc.gsfc.nasa.gov").unwrap());
    let base = Url::parse("https://nssdc.gsfc.nasa.gov/planetary/chronology_mars.html").unwrap();
    let u = p.resolve(&base, " http://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=MARINH#x  ").unwrap();
    assert_eq!(u.as_str(), "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=MARINH");
    assert!(p.fetchable(&u));
    assert!(p.resolve(&base, "mailto:a@b.c").is_none());
    assert!(p.resolve(&base, "javascript:void(0)").is_none());
    assert!(p.resolve(&base, "#top").is_none());
    let ext = p.resolve(&base, "http://pds.example.org/data").unwrap();
    assert_eq!(ext.scheme(), "http");
    assert!(!p.fetchable(&ext));
    // Injected loopback origins keep their scheme.
    let lp = UrlPolicy::new(Url::parse("http://127.0.0.1:9999").unwrap());
    let lb = Url::parse("http://127.0.0.1:9999/planetary/x.html").unwrap();
    assert_eq!(lp.resolve(&lb, "/planetary/viking.html").unwrap().scheme(), "http");
}
