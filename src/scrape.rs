//! Orchestration: required discovery, bounded detail fetches, deterministic
//! merge, and atomic JSON publication.

use std::collections::{BTreeSet, HashMap, HashSet};
use std::io::{self, BufWriter, Write};
use std::path::Path;
use std::sync::LazyLock;
use std::time::Duration;

use anyhow::{Context, Result, bail};
use chrono::{Datelike, NaiveDate, Utc};
use futures_util::StreamExt;
use futures_util::future::try_join4;
use futures_util::stream;
use regex::Regex;
use url::Url;

use crate::http::{Fetcher, Jitter, RetryPolicy, Scheduler, UrlPolicy};
use crate::model::*;
use crate::parse::{
    CraftSeed, MissionSeed, OverviewKind, ParsedCraft, TableRecord, collapse, map_status_label, nmc_id_from_url,
    overview_kind, parse_full_date, parse_overview, parse_spacecraft, parse_tables, parse_timeline, slug,
};

pub const NASA_ORIGIN: &str = "https://nssdc.gsfc.nasa.gov";

#[derive(Debug, Clone)]
pub struct ScrapeConfig {
    pub origin: Url,
    pub concurrency: usize,
    pub request_interval: Duration,
    pub retry: RetryPolicy,
    /// Reference date for "future launch" decisions; `None` means today (UTC).
    pub today: Option<NaiveDate>,
}

impl ScrapeConfig {
    pub fn production(concurrency: usize, request_interval: Duration) -> Self {
        Self {
            origin: Url::parse(NASA_ORIGIN).expect("static origin"),
            concurrency,
            request_interval,
            retry: RetryPolicy::default(),
            today: None,
        }
    }

    /// Loopback configuration for isolated tests: no pacing, tiny backoff.
    pub fn loopback(origin: Url) -> Self {
        Self {
            origin,
            concurrency: 4,
            request_interval: Duration::ZERO,
            retry: RetryPolicy {
                max_attempts: 5,
                base_backoff: Duration::from_millis(1),
                max_backoff: Duration::from_millis(5),
                jitter: Jitter::Fixed(Duration::ZERO),
            },
            today: Some(NaiveDate::from_ymd_opt(2026, 1, 1).expect("valid date")),
        }
    }
}

struct Craft {
    seed: CraftSeed,
    body: CelestialBody,
    launch_raw: String,
    description: String,
    timeline_url: Url,
    detail_url: Option<Url>,
    overview_url: Option<Url>,
    apollo_row: Option<TableRecord>,
    errors: Vec<SourceError>,
}

struct ArtifactFacts {
    coordinates: Option<(Coordinates, String)>,
    conflict: Option<String>,
}

static RE_ORBITERISH: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)\b(?:orbiter|orbiting|flyby)\b").unwrap());
static RE_SURFACEISH: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\b(?:landers?|rovers?|penetrators?|impactors?)\b").unwrap());
static RE_DESC_FAIL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(?:attempted|aborted|launch failure|contact lost|crash(?:ed)?|failed|failure)\b").unwrap()
});
static RE_DESC_NO_LANDING: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)\b(?:aborted|launch failure)\b").unwrap());
static RE_STAGE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)booster|centaur|s-?ivb|siv-?b|\bstage\b").unwrap());
static RE_YEAR: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\b(\d{4})\b").unwrap());

fn artifact_facts(rows: &[TableRecord]) -> HashMap<String, ArtifactFacts> {
    let mut by_id: HashMap<String, Vec<&TableRecord>> = HashMap::new();
    for r in rows {
        if let Some(id) = &r.nmc_id
            && !RE_STAGE.is_match(&r.name)
        {
            by_id.entry(id.clone()).or_default().push(r);
        }
    }
    by_id
        .into_iter()
        .map(|(id, rs)| {
            let found: Vec<(Coordinates, String)> =
                rs.iter().filter_map(|r| Some((r.coordinates?, r.coordinates_raw.clone()?))).collect();
            let disagree = found.iter().any(|(c, _)| {
                (c.latitude_deg - found[0].0.latitude_deg).abs() > 1e-6
                    || (c.longitude_deg - found[0].0.longitude_deg).abs() > 1e-6
            });
            let facts = if disagree {
                ArtifactFacts {
                    coordinates: None,
                    conflict: Some(format!(
                        "field conflict: artifact table lists differing coordinates for {id}; none used"
                    )),
                }
            } else {
                ArtifactFacts { coordinates: found.into_iter().next(), conflict: None }
            };
            (id, facts)
        })
        .collect()
}

fn describe(e: &crate::http::FetchError) -> String {
    match e.status {
        Some(s) => format!("{} (HTTP {s}) after {} attempt(s)", e.message, e.attempts),
        None => format!("{} after {} attempt(s)", e.message, e.attempts),
    }
}

fn is_mixed(description: &str) -> bool {
    RE_ORBITERISH.is_match(description) && RE_SURFACEISH.is_match(description)
}

fn fallback_id(overview: &Url, name: &str) -> String {
    format!("{overview}#{}", slug(name))
}

pub async fn scrape(config: ScrapeConfig) -> Result<Vec<MissionRecord>> {
    let policy = UrlPolicy::new(config.origin.clone());
    let sched = Scheduler::new(config.concurrency, config.request_interval);
    let fetcher = Fetcher::new(policy.clone(), sched, config.retry)?;
    let today = config.today.unwrap_or_else(|| Utc::now().date_naive());
    let concurrency = config.concurrency.max(1);

    // 1. Required entry pages. Any failure aborts publication.
    let entry = |i: usize| config.origin.join(crate::http::ENTRY_PAGES[i]).context("origin join");
    let required = |u: Url| {
        let f = &fetcher;
        async move { f.get(&u).await.map_err(|e| anyhow::anyhow!("required source failed: {e}")) }
    };
    let (moon_page, mars_page, apollo_page, artifact_page) =
        try_join4(required(entry(0)?), required(entry(1)?), required(entry(2)?), required(entry(3)?)).await?;

    let mut seeds: Vec<MissionSeed> = parse_timeline(&moon_page.html, &moon_page.url, CelestialBody::Moon)
        .with_context(|| format!("required source {}", moon_page.url))?;
    seeds.extend(
        parse_timeline(&mars_page.html, &mars_page.url, CelestialBody::Mars)
            .with_context(|| format!("required source {}", mars_page.url))?,
    );
    let apollo_rows = parse_tables(&apollo_page.html, &apollo_page.url)
        .with_context(|| format!("required source {}", apollo_page.url))?;
    if apollo_rows.is_empty() {
        bail!("required source {} contained no table rows", apollo_page.url);
    }
    let artifact_rows = parse_tables(&artifact_page.html, &artifact_page.url)
        .with_context(|| format!("required source {}", artifact_page.url))?;
    if artifact_rows.is_empty() {
        bail!("required source {} contained no table rows", artifact_page.url);
    }
    let artifacts = artifact_facts(&artifact_rows);
    let apollo_by_mission: HashMap<u32, &TableRecord> = apollo_rows
        .iter()
        .filter(|r| r.nmc_id.is_some())
        .filter_map(|r| Some((r.name.trim().parse::<u32>().ok()?, r)))
        .collect();

    // 2. Classify seeds; fetch each needed overview exactly once.
    let links: Vec<Url> = seeds.iter().map(|s| policy.normalize(s.link.clone())).collect();
    let mut overview_urls: Vec<Url> = Vec::new();
    for link in &links {
        if policy.same_origin(link)
            && let Some(kind) = overview_kind(link)
        {
            let covered = matches!(kind, OverviewKind::Apollo(n) if apollo_by_mission.contains_key(&n));
            if !covered && !overview_urls.contains(link) {
                overview_urls.push(link.clone());
            }
        }
    }
    let overview_pages: HashMap<Url, Result<String, String>> = stream::iter(overview_urls)
        .map(|u| {
            let f = &fetcher;
            async move {
                let r = match f.get(&u).await {
                    Ok(p) => Ok(p.html),
                    Err(e) => Err(describe(&e)),
                };
                (u, r)
            }
        })
        .buffer_unordered(concurrency)
        .collect()
        .await;

    // 3. Build crafts (one per source-listed surface craft), deduplicated by id.
    let mut crafts: Vec<Craft> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    for (seed, link) in seeds.iter().zip(&links) {
        let base = |id: String, name: String, mixed: bool| Craft {
            seed: CraftSeed { id, name, mixed_role: mixed },
            body: seed.body,
            launch_raw: seed.launch_raw.clone(),
            description: seed.description.clone(),
            timeline_url: seed.source_url.clone(),
            detail_url: None,
            overview_url: None,
            apollo_row: None,
            errors: Vec::new(),
        };
        let mut push = |c: Craft| {
            if seen.insert(c.seed.id.clone()) {
                crafts.push(c);
            }
        };
        if let Some(id) = nmc_id_from_url(link) {
            let mut c = base(id, seed.name.clone(), is_mixed(&seed.description));
            c.detail_url = Some(link.clone());
            push(c);
            continue;
        }
        let kind = policy.same_origin(link).then(|| overview_kind(link)).flatten();
        let fail = |msg: String| {
            let mut c = base(fallback_id(link, &seed.name), seed.name.clone(), false);
            c.overview_url = Some(link.clone());
            c.errors.push(SourceError { url: link.to_string(), message: msg });
            c
        };
        match kind {
            None => push(fail("unsupported overview layout; not fetched".into())),
            Some(OverviewKind::Apollo(n)) if apollo_by_mission.contains_key(&n) => {
                let row = apollo_by_mission[&n];
                let link_url = policy.normalize(row.link.clone().expect("row has nmc id"));
                let mut c = base(row.nmc_id.clone().expect("row has nmc id"), format!("{} Lunar Module", seed.name), false);
                c.detail_url = Some(link_url);
                c.apollo_row = Some(row.clone());
                push(c);
            }
            Some(kind) => match overview_pages.get(link) {
                Some(Ok(html)) => match parse_overview(html, link, kind, &seed.name) {
                    Ok(comps) => {
                        for comp in comps {
                            let role = comp.role.unwrap_or("Lander");
                            let mut c = base(comp.id, format!("{} {role}", seed.name), false);
                            c.detail_url = Some(policy.normalize(comp.url));
                            c.overview_url = Some(link.clone());
                            push(c);
                        }
                    }
                    Err(e) => push(fail(format!("unsupported overview: {e}"))),
                },
                Some(Err(msg)) => push(fail(format!("overview unavailable: {msg}"))),
                None => push(fail("overview was not fetched".into())),
            },
        }
    }

    // 4. Bounded detail requests.
    let todo: Vec<(usize, Url, CraftSeed)> = crafts
        .iter()
        .enumerate()
        .filter_map(|(i, c)| Some((i, c.detail_url.clone()?, c.seed.clone())))
        .collect();
    let outcomes: Vec<(usize, Url, Result<ParsedCraft, String>)> = stream::iter(todo)
        .map(|(i, url, cseed)| {
            let f = &fetcher;
            async move {
                let res = match f.get(&url).await {
                    Ok(page) => parse_spacecraft(&page.html, &page.url, &cseed).map_err(|e| format!("parse failed: {e}")),
                    Err(e) => Err(describe(&e)),
                };
                (i, url, res)
            }
        })
        .buffer_unordered(concurrency)
        .collect()
        .await;
    let mut details: HashMap<usize, Result<ParsedCraft, SourceError>> = HashMap::new();
    for (i, url, res) in outcomes {
        if let Err(msg) = &res {
            eprintln!("warning: {} ({}): {msg}", crafts[i].seed.name, url);
        }
        details.insert(i, res.map_err(|message| SourceError { url: url.to_string(), message }));
    }

    // 5. Deterministic merge.
    let mut records: Vec<MissionRecord> = crafts
        .iter()
        .enumerate()
        .map(|(i, c)| {
            let art = artifacts.get(&c.seed.id);
            build_record(&policy, c, details.remove(&i), art, &artifact_page.url, &apollo_page.url, today)
        })
        .collect();
    records.sort_by(|a, b| (a.celestial_body, &a.craft_name, &a.id).cmp(&(b.celestial_body, &b.craft_name, &b.id)));
    if records.is_empty() {
        bail!("scrape produced no records");
    }
    Ok(records)
}

fn launch_is_future(raw: &str, today: NaiveDate) -> bool {
    if let Some(d) = parse_full_date(raw) {
        return d > today;
    }
    RE_YEAR.captures(raw).and_then(|c| c[1].parse::<i32>().ok()).is_some_and(|y| y > today.year())
}

fn build_record(
    policy: &UrlPolicy,
    craft: &Craft,
    detail: Option<Result<ParsedCraft, SourceError>>,
    artifact: Option<&ArtifactFacts>,
    artifact_url: &Url,
    apollo_url: &Url,
    today: NaiveDate,
) -> MissionRecord {
    let mut errors: Vec<SourceError> = craft.errors.clone();
    let mut urls: BTreeSet<String> = BTreeSet::new();
    urls.insert(craft.timeline_url.to_string());
    if let Some(u) = &craft.overview_url {
        urls.insert(u.to_string());
    }
    if let Some(u) = &craft.detail_url {
        urls.insert(u.to_string());
    }
    let parsed = match detail {
        Some(Ok(p)) => Some(p),
        Some(Err(e)) => {
            errors.push(e);
            None
        }
        None => None,
    };
    let row = craft.apollo_row.as_ref();
    if row.is_some() {
        urls.insert(apollo_url.to_string());
    }
    let suppress_landing = RE_DESC_NO_LANDING.is_match(&craft.description);

    // Launch: table, NMC labeled fact, timeline.
    let mut launch_sources: Vec<Option<String>> = Vec::new();
    launch_sources.push(row.and_then(|r| r.launch_raw.clone()));
    launch_sources.push(parsed.as_ref().and_then(|p| p.launch_raw.clone()));
    launch_sources.push(Some(craft.launch_raw.clone()).filter(|s| !s.is_empty()));
    let launch_date_hit = launch_sources.iter().flatten().find_map(|raw| Some((parse_full_date(raw)?, raw.clone())));
    let (launch_date, launch_date_raw) = match launch_date_hit {
        Some((d, raw)) => (Some(d), Some(raw)),
        None => (None, launch_sources.into_iter().flatten().next()),
    };

    // Landing: Apollo table, artifact table, NMC narrative.
    let mut landing_site = row.and_then(|r| r.landing_site.clone());
    let mut coords: Option<(Coordinates, String)> = row.and_then(|r| Some((r.coordinates?, r.coordinates_raw.clone()?)));
    if let Some(a) = artifact {
        if let Some(msg) = &a.conflict {
            errors.push(SourceError { url: artifact_url.to_string(), message: msg.clone() });
            urls.insert(artifact_url.to_string());
        } else if coords.is_none()
            && let Some(c) = &a.coordinates
        {
            coords = Some(c.clone());
            urls.insert(artifact_url.to_string());
        }
    }
    if let Some(p) = &parsed
        && !suppress_landing
    {
        if landing_site.is_none() {
            landing_site = p.landing_site.clone();
        }
        if coords.is_none()
            && let (Some(c), Some(raw)) = (p.coordinates, &p.coordinates_raw)
        {
            coords = Some((c, raw.clone()));
        }
    }

    // End of mission: table label, then narrative; mission_end beats last_contact,
    // then the latest date of that kind.
    let mut table_end = row.and_then(|r| Some((r.end_date?, r.end_raw.clone()?)));
    let narrative_end = parsed.as_ref().and_then(|p| {
        let pick = |basis: EndBasis| p.ends.iter().filter(|e| e.basis == basis).max_by_key(|e| e.date);
        pick(EndBasis::MissionEnd).or_else(|| pick(EndBasis::LastContact)).cloned()
    });
    let (end_date, end_basis, end_evidence) = match (table_end.take(), narrative_end) {
        (Some((d, raw)), _) => (Some(d), Some(EndBasis::MissionEnd), Some(raw)),
        (None, Some(e)) => (Some(e.date), Some(e.basis), Some(e.evidence)),
        (None, None) => (None, None, None),
    };

    // Status: explicit table label, else failed > ended > active > planned.
    let mut status = OperationalStatus::Unknown;
    let mut status_evidence: Option<String> = None;
    let mut unmapped_raw: Option<String> = None;
    if let Some(raw) = row.and_then(|r| r.status_raw.clone()) {
        match map_status_label(&raw) {
            Some(s) => {
                status = s;
                status_evidence = Some(raw);
            }
            None => unmapped_raw = Some(raw),
        }
    }
    if status == OperationalStatus::Unknown {
        let narrative = |want: OperationalStatus| {
            parsed.as_ref().and_then(|p| p.statuses.iter().find(|s| s.status == want)).map(|s| s.evidence.clone())
        };
        let desc_fail = RE_DESC_FAIL.is_match(&craft.description).then(|| collapse(&craft.description));
        if let Some(ev) = narrative(OperationalStatus::Failed).or(desc_fail) {
            status = OperationalStatus::Failed;
            status_evidence = Some(ev);
        } else if end_date.is_some() {
            status = OperationalStatus::Ended;
            status_evidence = end_evidence.clone();
        } else if let Some(ev) = narrative(OperationalStatus::Active) {
            status = OperationalStatus::Active;
            status_evidence = Some(ev);
        } else if launch_is_future(&craft.launch_raw, today) {
            status = OperationalStatus::Planned;
            status_evidence = Some(craft.launch_raw.clone());
        } else {
            status_evidence = unmapped_raw;
        }
    }

    let data_links = parsed
        .as_ref()
        .map(|p| {
            p.links
                .iter()
                .map(|l| DataLink {
                    url: Url::parse(&l.url).map(|u| policy.normalize(u).to_string()).unwrap_or_else(|_| l.url.clone()),
                    label: l.label.clone(),
                    kind: l.kind,
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let mut data_links = data_links;
    data_links.sort_by(|a, b| a.url.cmp(&b.url));
    data_links.dedup_by(|a, b| a.url == b.url);

    errors.sort();
    errors.dedup();
    let (landing_coordinates, landing_coordinates_raw) = match coords {
        Some((c, raw)) => (Some(c), Some(raw)),
        None => (None, None),
    };
    MissionRecord {
        id: craft.seed.id.clone(),
        craft_name: parsed.as_ref().map(|p| p.name.clone()).unwrap_or_else(|| craft.seed.name.clone()),
        celestial_body: craft.body,
        landing_site,
        landing_coordinates,
        landing_coordinates_raw,
        launch_date,
        launch_date_raw,
        end_of_mission_date: end_date,
        end_of_mission_date_basis: end_basis,
        end_of_mission_evidence: end_evidence,
        operational_status: status,
        operational_status_evidence: status_evidence,
        data_links,
        source_urls: urls.into_iter().collect(),
        extraction_status: if errors.is_empty() { ExtractionStatus::Complete } else { ExtractionStatus::Partial },
        source_errors: errors,
    }
}

// ---------------------------------------------------------------------------
// Publication
// ---------------------------------------------------------------------------

/// Serialize the top-level array, newline-terminated, straight into `w`.
pub fn write_records<W: Write>(records: &[MissionRecord], mut w: W) -> io::Result<()> {
    serde_json::to_writer_pretty(&mut w, records).map_err(io::Error::other)?;
    w.write_all(b"\n")?;
    w.flush()
}

/// Write via `fill` into a buffered temp file next to `path`, sync it, then
/// atomically rename over the destination. Any failure leaves the previous
/// file untouched and the temp file is removed on drop.
pub fn publish_with(path: &Path, fill: impl FnOnce(&mut dyn Write) -> io::Result<()>) -> Result<()> {
    let dir = match path.parent() {
        Some(p) if !p.as_os_str().is_empty() => p,
        _ => Path::new("."),
    };
    std::fs::create_dir_all(dir).with_context(|| format!("creating {}", dir.display()))?;
    let tmp = tempfile::NamedTempFile::new_in(dir).with_context(|| format!("creating temp file in {}", dir.display()))?;
    {
        let mut w = BufWriter::new(tmp.as_file());
        fill(&mut w).context("writing JSON")?;
        w.flush().context("flushing JSON")?;
    }
    tmp.as_file().sync_all().context("syncing JSON")?;
    tmp.persist(path).map_err(|e| e.error).with_context(|| format!("replacing {}", path.display()))?;
    Ok(())
}

pub fn publish(path: &Path, records: &[MissionRecord]) -> Result<()> {
    publish_with(path, |w| write_records(records, w))
}

/// Scrape then publish; the single path used by the CLI. Nothing is written
/// unless every required source succeeded.
pub async fn run(config: ScrapeConfig, output: &Path) -> Result<Vec<MissionRecord>> {
    let records = scrape(config).await?;
    publish(output, &records)?;
    Ok(records)
}
