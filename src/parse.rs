//! HTML parsing: timeline rows, tables, overviews and NMC spacecraft pages.
//!
//! Every function takes a `&str`, builds a `select` DOM internally and returns
//! owned data, so no DOM ever lives across an `.await`.

use std::sync::LazyLock;

use anyhow::{Result, anyhow, bail};
use chrono::NaiveDate;
use regex::Regex;
use select::document::Document;
use select::node::Node;
use select::predicate::{Attr, Class, Name, Predicate};
use url::Url;

use crate::model::{CelestialBody, Coordinates, DataLink, EndBasis, LinkKind, OperationalStatus};

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/// Collapse all Unicode whitespace (including NBSP) to single spaces.
pub fn collapse(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

const BLOCKS: [&str; 14] = [
    "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "ul", "ol", "table", "tr", "pre",
];
const PARA_MARK: char = '\u{1}';

fn push_text(node: Node, out: &mut String, block: bool) {
    if let Some(t) = node.as_text() {
        out.push_str(t);
        return;
    }
    match node.name() {
        Some("script") | Some("style") => {}
        Some("br") => out.push(' '),
        Some(n) if block && BLOCKS.contains(&n) => {
            out.push(PARA_MARK);
            for c in node.children() {
                push_text(c, out, block);
            }
            out.push(PARA_MARK);
        }
        _ => {
            for c in node.children() {
                push_text(c, out, block);
            }
        }
    }
}

/// Flattened, whitespace-collapsed text; `<br>` becomes a separator.
pub fn node_text(node: Node) -> String {
    let mut s = String::new();
    push_text(node, &mut s, false);
    collapse(&s)
}

fn paragraphs(node: Node) -> Vec<String> {
    let mut s = String::new();
    push_text(node, &mut s, true);
    s.split(PARA_MARK).map(collapse).filter(|p| !p.is_empty()).collect()
}

/// Text of the following siblings of `node` until a sibling element named in
/// `stops`.
fn trailing_text(node: Node, stops: &[&str]) -> String {
    let mut out = String::new();
    let mut cur = node.next();
    while let Some(n) = cur {
        match n.name() {
            Some(name) if stops.contains(&name) => break,
            Some(_) => push_text(n, &mut out, false),
            None => {
                if let Some(t) = n.as_text() {
                    out.push_str(t);
                }
            }
        }
        cur = n.next();
    }
    collapse(&out)
}

fn norm(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        if ch.is_alphanumeric() {
            out.extend(ch.to_lowercase());
        } else {
            out.push(' ');
        }
    }
    collapse(&out)
}

/// Lowercase ASCII alphanumerics joined by single hyphens.
pub fn slug(s: &str) -> String {
    let mut out = String::new();
    let mut pending = false;
    for ch in s.chars() {
        if ch.is_ascii_alphanumeric() {
            if pending && !out.is_empty() {
                out.push('-');
            }
            pending = false;
            out.push(ch.to_ascii_lowercase());
        } else {
            pending = true;
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

static RE_DMY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b").unwrap());
static RE_MDY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b").unwrap());
static RE_ISO: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\b(\d{4})-(\d{2})-(\d{2})(?:T|\b)").unwrap());
static RE_TIME_TAIL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)^(?:T|at\s+|UTC?\s*|GMT\s*|,\s*)?(?:\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:\s*(?:UTC?|GMT|Z|[ap]\.?m\.?))?|UTC?|GMT|Z)(?:\s*\(.*\))?$",
    )
    .unwrap()
});

const MONTHS: [&str; 12] = [
    "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november",
    "december",
];

fn month_num(word: &str) -> Option<u32> {
    let l = word.to_ascii_lowercase();
    if l == "sept" {
        return Some(9);
    }
    if l.len() < 3 {
        return None;
    }
    MONTHS.iter().position(|m| m.starts_with(&l)).map(|i| i as u32 + 1)
}

/// First complete date inside `s`: `(start, end, date)` byte span.
pub fn find_date(s: &str) -> Option<(usize, usize, NaiveDate)> {
    let mut best: Option<(usize, usize, NaiveDate)> = None;
    let mut consider = |start: usize, end: usize, d: Option<NaiveDate>| {
        if let Some(d) = d
            && best.is_none_or(|b| start < b.0)
        {
            best = Some((start, end, d));
        }
    };
    for c in RE_DMY.captures_iter(s) {
        let m = c.get(0).unwrap();
        let d = month_num(&c[2]).and_then(|mo| NaiveDate::from_ymd_opt(c[3].parse().ok()?, mo, c[1].parse().ok()?));
        consider(m.start(), m.end(), d);
    }
    for c in RE_MDY.captures_iter(s) {
        let m = c.get(0).unwrap();
        let d = month_num(&c[1]).and_then(|mo| NaiveDate::from_ymd_opt(c[3].parse().ok()?, mo, c[2].parse().ok()?));
        consider(m.start(), m.end(), d);
    }
    for c in RE_ISO.captures_iter(s) {
        let m = c.get(0).unwrap();
        let d = NaiveDate::from_ymd_opt(c[1].parse().ok()?, c[2].parse().ok()?, c[3].parse().ok()?);
        consider(m.start(), m.end(), d);
    }
    best
}

/// A complete date, optionally followed by an explicit time/timezone. Partial,
/// seasonal, yearless or invalid text yields `None`.
pub fn parse_full_date(s: &str) -> Option<NaiveDate> {
    let s = collapse(s);
    let (start, end, d) = find_date(&s)?;
    if start != 0 {
        return None;
    }
    let tail = s[end..].trim();
    (tail.is_empty() || RE_TIME_TAIL.is_match(tail)).then_some(d)
}

// ---------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------

static RE_DIR_PAIR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(\d+(?:\.\d*)?)\s*(?:°|deg(?:rees?)?\.?)?\s*(?:latitude\s*)?([NS])\b(?:\s*(?:latitude|longitude|and|,))*\s*(\d+(?:\.\d*)?)\s*(?:°|deg(?:rees?)?\.?)?\s*(?:longitude\s*)?([EW])\b",
    )
    .unwrap()
});
static RE_NUM_PAIR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(-?\d+(?:\.\d*)?)\s*,\s*(-?\d+(?:\.\d*)?)\s*$").unwrap());
static RE_LAT_CELL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*(\d+(?:\.\d*)?)\s*°?\s*([NS])\s*$").unwrap());
static RE_LON_CELL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*(\d+(?:\.\d*)?)\s*°?\s*([EW])\s*$").unwrap());
static RE_RANGE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\d\s*(?:°|deg\w*)?\s*[NSEW]?\s*(?:to|–|—)\s*\d|\d-\d").unwrap());

fn coords_rejected(s: &str) -> bool {
    s.to_ascii_lowercase().contains("unknown") || s.contains('?') || RE_RANGE.is_match(s)
}

fn make_coords(lat: f64, lon: f64) -> Option<Coordinates> {
    if !lat.is_finite() || !lon.is_finite() || !(-90.0..=90.0).contains(&lat) {
        return None;
    }
    let wrapped = if (-180.0..180.0).contains(&lon) { lon } else { (lon + 180.0).rem_euclid(360.0) - 180.0 };
    let round = |v: f64| (v * 1e9).round() / 1e9;
    Some(Coordinates { latitude_deg: round(lat), longitude_deg: round(wrapped) })
}

fn directional(lat: &str, ns: &str, lon: &str, ew: &str) -> Option<Coordinates> {
    let mut la: f64 = lat.parse().ok()?;
    let mut lo: f64 = lon.parse().ok()?;
    if ns == "S" {
        la = -la;
    }
    if ew == "W" {
        lo = -lo;
    }
    make_coords(la, lo)
}

/// Directional pair anywhere in prose (`19.33 N, 33.55 W`).
pub fn find_directional_pair(s: &str) -> Option<(Coordinates, String)> {
    if coords_rejected(s) {
        return None;
    }
    let c = RE_DIR_PAIR.captures(s)?;
    let coords = directional(&c[1], &c[2], &c[3], &c[4])?;
    Some((coords, collapse(c.get(0)?.as_str())))
}

/// One table cell holding a pair: directional, or signed east-positive 0–360.
fn parse_pair_cell(s: &str) -> Option<Coordinates> {
    if coords_rejected(s) {
        return None;
    }
    if let Some((c, _)) = find_directional_pair(s) {
        return Some(c);
    }
    let c = RE_NUM_PAIR.captures(s)?;
    make_coords(c[1].parse().ok()?, c[2].parse().ok()?)
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

/// NMC identity from a `display.action?id=` URL.
pub fn nmc_id_from_url(u: &Url) -> Option<String> {
    if u.path() != "/nmc/spacecraft/display.action" {
        return None;
    }
    u.query_pairs()
        .find(|(k, _)| k == "id")
        .map(|(_, v)| v.trim().to_owned())
        .filter(|v| !v.is_empty())
}

fn only_id_param(u: &Url) -> bool {
    u.query_pairs().all(|(k, _)| k == "id")
}

fn join(page: &Url, href: &str) -> Option<Url> {
    let href = href.trim();
    if href.is_empty() || href.starts_with('#') {
        return None;
    }
    let mut u = page.join(href).ok()?;
    matches!(u.scheme(), "http" | "https").then(|| {
        u.set_fragment(None);
        u
    })
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct MissionSeed {
    pub name: String,
    pub body: CelestialBody,
    /// Resolved (not origin-normalised) link target from the timeline anchor.
    pub link: Url,
    pub nmc_id: Option<String>,
    pub launch_raw: String,
    pub description: String,
    pub source_url: Url,
}

static RE_MOON_SURFACE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(?:landers?|landings?|rovers?|sample returns?|impactors?|impacts?)\b").unwrap()
});
static RE_MARS_SURFACE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\b(?:landers?|rovers?|penetrators?)\b").unwrap());
static RE_MOONS_OF_MARS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)\b(?:phobos|deimos)\b").unwrap());
const SEED_STOPS: [&str; 14] =
    ["br", "a", "img", "p", "hr", "table", "form", "h1", "h2", "h3", "h4", "ul", "ol", "li"];

pub fn is_eligible(name: &str, description: &str, body: CelestialBody) -> bool {
    match body {
        CelestialBody::Moon => RE_MOON_SURFACE.is_match(description),
        CelestialBody::Mars => {
            RE_MARS_SURFACE.is_match(description)
                && !RE_MOONS_OF_MARS.is_match(description)
                && !RE_MOONS_OF_MARS.is_match(name)
        }
    }
}

/// Mission rows are an anchor followed (up to the next `<br>`) by
/// `- <launch> - <description>`; footer/navigation anchors do not match.
pub fn parse_timeline(html: &str, page_url: &Url, body: CelestialBody) -> Result<Vec<MissionSeed>> {
    let doc = Document::from(html);
    let mut recognized = 0usize;
    let mut seeds = Vec::new();
    for a in doc.find(Name("a")) {
        let Some(href) = a.attr("href") else { continue };
        let Some(link) = join(page_url, href) else { continue };
        let name = node_text(a);
        if name.is_empty() {
            continue;
        }
        let after = trailing_text(a, &SEED_STOPS);
        let Some(rest) = after.strip_prefix('-') else { continue };
        let Some((launch, desc)) = rest.trim().split_once(" - ") else { continue };
        let (launch, desc) = (collapse(launch), collapse(desc));
        if launch.is_empty() || desc.is_empty() {
            continue;
        }
        recognized += 1;
        if !is_eligible(&name, &desc, body) {
            continue;
        }
        seeds.push(MissionSeed {
            nmc_id: nmc_id_from_url(&link),
            name,
            body,
            link,
            launch_raw: launch,
            description: desc,
            source_url: page_url.clone(),
        });
    }
    if recognized == 0 {
        bail!("no mission timeline rows recognized in {page_url}");
    }
    if seeds.is_empty() {
        bail!("no surface-mission rows among {recognized} timeline rows in {page_url}");
    }
    Ok(seeds)
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct Cell {
    text: String,
    links: Vec<(String, String)>,
    header_like: bool,
}

struct Table {
    headers: Vec<String>,
    rows: Vec<Vec<Cell>>,
}

fn closest_table_index(mut n: Node) -> Option<usize> {
    while let Some(p) = n.parent() {
        if p.is(Name("table")) {
            return Some(p.index());
        }
        n = p;
    }
    None
}

fn read_cell(c: Node) -> Cell {
    let text = node_text(c);
    let links = c
        .find(Name("a"))
        .filter_map(|a| a.attr("href").map(|h| (h.to_owned(), node_text(a))))
        .collect();
    let bold_text = c
        .find(Name("b").or(Name("strong")))
        .map(node_text)
        .collect::<Vec<_>>()
        .join(" ");
    let header_like = c.is(Name("th")) || (!text.is_empty() && collapse(&bold_text) == text);
    Cell { text, links, header_like }
}

/// Reads only rows that directly belong to each table (never nested tables),
/// accepting `<th>` and all-bold `<td>` header rows.
fn read_tables(doc: &Document) -> Vec<Table> {
    let mut out = Vec::new();
    for t in doc.find(Name("table")) {
        let mut headers: Option<Vec<String>> = None;
        let mut rows = Vec::new();
        for tr in t.descendants().filter(|n| n.is(Name("tr")) && closest_table_index(*n) == Some(t.index())) {
            let cells: Vec<Cell> = tr
                .children()
                .filter(|c| c.is(Name("td")) || c.is(Name("th")))
                .map(read_cell)
                .collect();
            if cells.is_empty() {
                continue;
            }
            if cells.len() >= 2 && cells.iter().all(|c| c.header_like) {
                if headers.is_none() {
                    headers = Some(cells.iter().map(|c| c.text.to_lowercase().trim_end_matches(':').trim().to_owned()).collect());
                }
                continue;
            }
            if headers.is_some() {
                rows.push(cells);
            }
        }
        if let Some(headers) = headers {
            out.push(Table { headers, rows });
        }
    }
    out
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Col {
    Name,
    Launch,
    Site,
    End,
    Status,
    LandingType,
    Lat,
    Lon,
    LatLon { numeric: bool },
}

fn classify_header(h: &str) -> Option<Col> {
    Some(match h {
        "spacecraft" | "craft name" | "craft" | "apollo mission" => Col::Name,
        "launch date" => Col::Launch,
        "landing site" => Col::Site,
        "end of mission date" | "end date" => Col::End,
        "status" | "operational status" => Col::Status,
        "landing type" => Col::LandingType,
        "latitude" => Col::Lat,
        "longitude" => Col::Lon,
        h if h.starts_with("latitude, longitude") || h.starts_with("latitude/longitude") => {
            Col::LatLon { numeric: h.contains("positive") }
        }
        _ => return None,
    })
}

#[derive(Debug, Clone)]
pub struct TableRecord {
    pub name: String,
    pub link: Option<Url>,
    pub nmc_id: Option<String>,
    pub launch_raw: Option<String>,
    pub landing_site: Option<String>,
    pub landing_type: Option<String>,
    pub coordinates: Option<Coordinates>,
    pub coordinates_raw: Option<String>,
    pub end_date: Option<NaiveDate>,
    pub end_raw: Option<String>,
    pub status_raw: Option<String>,
    pub source_url: Url,
}

pub fn parse_tables(html: &str, page_url: &Url) -> Result<Vec<TableRecord>> {
    let doc = Document::from(html);
    let tables = read_tables(&doc);
    let mut records = Vec::new();
    let mut recognized_table = false;
    for t in tables {
        let cols: Vec<Option<Col>> = t.headers.iter().map(|h| classify_header(h)).collect();
        let Some(name_col) = cols.iter().position(|c| *c == Some(Col::Name)) else { continue };
        recognized_table = true;
        let first = |want: Col| cols.iter().position(|c| *c == Some(want));
        let get = |row: &[Cell], i: Option<usize>| -> Option<String> {
            i.and_then(|i| row.get(i)).map(|c| c.text.clone()).filter(|t| !t.is_empty())
        };
        let mut latlon_cols: Vec<(usize, bool)> = cols
            .iter()
            .enumerate()
            .filter_map(|(i, c)| match c {
                Some(Col::LatLon { numeric }) => Some((i, *numeric)),
                _ => None,
            })
            .collect();
        latlon_cols.sort_by_key(|(i, numeric)| (!*numeric, *i));

        for row in &t.rows {
            let Some(name_cell) = row.get(name_col) else { continue };
            if name_cell.text.is_empty() {
                continue;
            }
            let link = name_cell.links.iter().find_map(|(h, _)| {
                let u = join(page_url, h)?;
                nmc_id_from_url(&u).map(|_| u)
            });
            let mut coordinates = None;
            let mut coordinates_raw = None;
            for (i, _) in &latlon_cols {
                if let Some(cell) = row.get(*i)
                    && let Some(c) = parse_pair_cell(&cell.text)
                {
                    coordinates = Some(c);
                    coordinates_raw = Some(cell.text.clone());
                    break;
                }
            }
            if coordinates.is_none()
                && let (Some(la), Some(lo)) = (get(row, first(Col::Lat)), get(row, first(Col::Lon)))
                && !coords_rejected(&la)
                && !coords_rejected(&lo)
                && let (Some(lc), Some(oc)) = (RE_LAT_CELL.captures(&la), RE_LON_CELL.captures(&lo))
            {
                coordinates = directional(&lc[1], &lc[2], &oc[1], &oc[2]);
                if coordinates.is_some() {
                    coordinates_raw = Some(format!("{la}, {lo}"));
                }
            }
            let end_raw = get(row, first(Col::End));
            records.push(TableRecord {
                name: name_cell.text.clone(),
                nmc_id: link.as_ref().and_then(nmc_id_from_url),
                link,
                launch_raw: get(row, first(Col::Launch)),
                landing_site: get(row, first(Col::Site)),
                landing_type: get(row, first(Col::LandingType)),
                coordinates,
                coordinates_raw,
                end_date: end_raw.as_deref().and_then(parse_full_date),
                end_raw,
                status_raw: get(row, first(Col::Status)),
                source_url: page_url.clone(),
            });
        }
    }
    if !recognized_table {
        bail!("no table with a recognized spacecraft/mission header in {page_url}");
    }
    Ok(records)
}

/// Table status synonyms; unrecognised text is `None` (caller keeps raw text).
pub fn map_status_label(raw: &str) -> Option<OperationalStatus> {
    match raw.trim().to_lowercase().as_str() {
        "active" | "operational" | "operating" => Some(OperationalStatus::Active),
        "ended" | "terminated" | "completed" => Some(OperationalStatus::Ended),
        "failed" | "aborted" | "crashed" => Some(OperationalStatus::Failed),
        "planned" | "future" => Some(OperationalStatus::Planned),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Overviews (non-NMC mission pages)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OverviewKind {
    Apollo(u32),
    Viking,
    Mesur,
}

static RE_APOLLO_OVERVIEW: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^/planetary/lunar/apollo(\d+)info\.html$").unwrap());

pub fn overview_kind(u: &Url) -> Option<OverviewKind> {
    if let Some(c) = RE_APOLLO_OVERVIEW.captures(u.path()) {
        return c[1].parse().ok().map(OverviewKind::Apollo);
    }
    match u.path() {
        "/planetary/viking.html" => Some(OverviewKind::Viking),
        "/planetary/mesur.html" => Some(OverviewKind::Mesur),
        _ => None,
    }
}

#[derive(Debug, Clone)]
pub struct Component {
    pub id: String,
    pub url: Url,
    pub label: String,
    /// `Lunar Module`, `Lander` or `Rover` when it can be told from the anchor.
    pub role: Option<&'static str>,
}

/// Only the mission's own surface-craft anchors; never "related spacecraft".
pub fn parse_overview(html: &str, page_url: &Url, kind: OverviewKind, seed_name: &str) -> Result<Vec<Component>> {
    let doc = Document::from(html);
    let seed = seed_name.to_lowercase();
    let mut out: Vec<Component> = Vec::new();
    for a in doc.find(Name("a")) {
        let Some(url) = a.attr("href").and_then(|h| join(page_url, h)) else { continue };
        let Some(id) = nmc_id_from_url(&url) else { continue };
        if !only_id_param(&url) {
            continue;
        }
        let label = node_text(a);
        let low = label.to_lowercase();
        let role = match kind {
            OverviewKind::Apollo(_) => low.contains("lunar module").then_some("Lunar Module"),
            OverviewKind::Viking => {
                (low.contains("lander") && low.strip_prefix(&seed).is_some_and(|r| r.starts_with(' '))).then_some("Lander")
            }
            OverviewKind::Mesur => {
                if low.contains("rover") {
                    Some("Rover")
                } else if low.contains("lander") {
                    Some("Lander")
                } else {
                    None
                }
            }
        };
        let Some(role) = role else { continue };
        if out.iter().any(|c| c.id == id) {
            continue;
        }
        out.push(Component { id, url, label, role: Some(role) });
        if matches!(kind, OverviewKind::Apollo(_)) {
            break;
        }
    }
    if out.is_empty() {
        bail!("no recognized surface-craft anchors in overview {page_url}");
    }
    Ok(out)
}

// ---------------------------------------------------------------------------
// NMC spacecraft pages
// ---------------------------------------------------------------------------

/// Identity needed to attribute narrative text to one craft.
#[derive(Debug, Clone)]
pub struct CraftSeed {
    pub id: String,
    /// Exact timeline name.
    pub name: String,
    /// Mission-level record for a mixed orbiter/lander mission.
    pub mixed_role: bool,
}

#[derive(Debug, Clone)]
pub struct EndEvidence {
    pub date: NaiveDate,
    pub basis: EndBasis,
    pub evidence: String,
}

#[derive(Debug, Clone)]
pub struct StatusEvidence {
    pub status: OperationalStatus,
    pub evidence: String,
}

#[derive(Debug, Clone, Default)]
pub struct ParsedCraft {
    pub name: String,
    pub id: String,
    pub launch_raw: Option<String>,
    pub launch_date: Option<NaiveDate>,
    pub landing_site: Option<String>,
    pub coordinates: Option<Coordinates>,
    pub coordinates_raw: Option<String>,
    pub ends: Vec<EndEvidence>,
    pub statuses: Vec<StatusEvidence>,
    pub links: Vec<DataLink>,
}

static RE_LABEL_ID: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)^NSSDCA(?:/COSPAR)? ID:?$").unwrap());

fn is_error_shell(doc: &Document) -> bool {
    if doc.find(Class("actionMessage")).next().is_some() {
        return true;
    }
    doc.find(Name("body"))
        .next()
        .map(node_text)
        .is_some_and(|t| t.contains("An error has occurred") || t.contains("Please search again"))
}

pub fn parse_spacecraft(html: &str, page_url: &Url, seed: &CraftSeed) -> Result<ParsedCraft> {
    let doc = Document::from(html);
    if is_error_shell(&doc) {
        bail!("archive returned an error page instead of a spacecraft record");
    }
    let rc = doc
        .find(Name("div").and(Attr("id", "rightcontent")))
        .next()
        .ok_or_else(|| anyhow!("missing #rightcontent"))?;
    let h1 = rc.find(Name("h1")).next().map(node_text).filter(|t| !t.is_empty()).ok_or_else(|| anyhow!("missing #rightcontent h1"))?;
    let found_id = rc
        .find(Name("strong"))
        .find(|s| RE_LABEL_ID.is_match(&node_text(*s)))
        .map(|s| trailing_text(s, &["br", "strong", "b"]))
        .ok_or_else(|| anyhow!("missing NSSDCA ID label"))?;
    if !found_id.eq_ignore_ascii_case(seed.id.trim()) {
        bail!("record ID {found_id:?} does not match requested ID {:?}", seed.id);
    }

    let mut out = ParsedCraft { name: h1.clone(), id: found_id, ..Default::default() };

    // Labeled facts: only `.urtwo` "Facts in Brief".
    let urtwo = doc.find(Class("urtwo")).next();
    if let Some(u2) = urtwo {
        for s in u2.find(Name("strong").or(Name("b"))) {
            if node_text(s).trim_end_matches(':').eq_ignore_ascii_case("launch date") {
                let raw = trailing_text(s, &["br", "strong", "b"]);
                if !raw.is_empty() {
                    out.launch_date = parse_full_date(&raw);
                    out.launch_raw = Some(raw);
                }
            }
        }
        collect_links(u2, page_url, &mut out.links);
    }

    // Narrative: only `.urone`.
    if let Some(u1) = doc.find(Class("urone")).next() {
        let paras = paragraphs(u1);
        let mut aliases = vec![norm(&h1), norm(&seed.name)];
        for src in [&h1, &seed.name] {
            if let Some(i) = src.find('(') {
                aliases.push(norm(&src[..i]));
                if let Some(j) = src[i..].find(')') {
                    aliases.push(norm(&src[i + 1..i + j]));
                }
            }
        }
        // A "Lander / ALSEP" style name makes the package part of this craft, so its
        // own sentences must not be rejected as sibling-hardware references.
        let mut package = false;
        for src in [&h1, &seed.name] {
            for part in src.split('/') {
                let part = norm(part);
                if RE_SIBLING.is_match(&part) {
                    aliases.push(part);
                    package = true;
                }
            }
        }
        if package {
            aliases.extend(["experiment", "experiments", "instrument", "instruments"].map(String::from));
        }
        aliases.retain(|a| a.len() >= 4);
        aliases.sort_by_key(|a| std::cmp::Reverse(a.len()));
        aliases.dedup();
        analyze_narrative(&paras, &aliases, seed.mixed_role, &mut out);
    }
    out.links.sort_by(|a, b| a.url.cmp(&b.url));
    out.links.dedup_by(|a, b| a.url == b.url);
    Ok(out)
}

static RE_ARCHIVE_LABEL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)\b(?:data|archive|pds)\b").unwrap());

fn collect_links(root: Node, page_url: &Url, out: &mut Vec<DataLink>) {
    for a in root.find(Name("a")) {
        let Some(url) = a.attr("href").and_then(|h| join(page_url, h)) else { continue };
        let label = node_text(a);
        let kind = if url.path().ends_with("/displayDataset.action") {
            LinkKind::DataCollection
        } else if url.path().ends_with("/displayTelemetry.action") {
            LinkKind::Telemetry
        } else if url.path().ends_with("/displayExperiment.action") {
            LinkKind::Experiment
        } else if !url.path().starts_with("/nmc/") && RE_ARCHIVE_LABEL.is_match(&label) {
            LinkKind::Archive
        } else {
            continue;
        };
        out.push(DataLink { label, url: url.to_string(), kind });
    }
}

// --- sentence-scoped attribution -------------------------------------------

static RE_SIBLING: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(?:orbiter|command module|service module|experiments?|instruments?|alsep|easep)\b").unwrap()
});
static RE_GENERIC: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b(?:lander|rover|spacecraft|probe|lunar module)\b").unwrap());
static RE_MIXED_GENERIC: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b(?:lander|rover|penetrator|impactor)\b").unwrap());
static RE_SITE_REF: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\bthe landing site\b").unwrap());
static RE_PRONOUN: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(?:it|its)\b").unwrap());
static RE_HYPO: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(?:planned|will|would|was to|were to|targets?|targeted|targeting|landing ellipse|primary mission ended|nominal mission|if|whether|not known|may have|might|possibly|probably)\b")
        .unwrap()
});
static RE_LAND_VERB: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(?:landed|touched down|touchdown|came to rest|landing site|impact(?:ed)?)\b").unwrap()
});
static RE_SITE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(?:landing site in|touched down in|landed (?:at|in|on))\s+(?:the\s+)?(.+?)(?:\s+(?:is|was|which|where|at|on|near|with|located)\b|[,.;:(]|$)").unwrap()
});
static RE_FAIL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(?:crashed|crash[- ]landed|failed to (?:land|soft[- ]land|achieve|reach)|landing (?:failed|failure)|launch failure|never (?:made contact|established contact))\b").unwrap()
});
static RE_ACTIVE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(?:(?:is|remains)\s+(?:currently\s+)?(?:operating|operational|active)|continues to operate)\b").unwrap()
});

/// (pattern, basis, required extra pattern, date may precede the keyword)
static END_PATTERNS: LazyLock<Vec<(Regex, EndBasis, Option<Regex>, bool)>> = LazyLock::new(|| {
    let r = |s: &str| Regex::new(s).unwrap();
    vec![
        (r(r"\boperated until\b"), EndBasis::LastContact, Some(r(r"\bcontact (?:with it )?(?:was|had been) lost\b")), false),
        (r(r"\bturned off\b"), EndBasis::MissionEnd, None, false),
        (r(r"\bshut down (?:along with|on)\b"), EndBasis::MissionEnd, None, false),
        (r(r"\b(?:was|were) terminated\b"), EndBasis::MissionEnd, None, true),
        (
            r(r"\b(?:mission|operations?)\b.{0,80}?\b(?:terminated|ended|concluded)\b"),
            EndBasis::MissionEnd,
            None,
            false,
        ),
        (r(r"\b(?:final|last)\s+(?:communications?|contact|transmissions?|signals?)\b"), EndBasis::LastContact, None, false),
        (r(r"\blast\s+telemetry\b"), EndBasis::LastContact, None, false),
        (r(r"\bcontact (?:was |has been )?lost\b"), EndBasis::LastContact, None, false),
    ]
});

/// Split at sentence punctuation followed by whitespace and a capital/quote;
/// decimals and single-letter initials do not split.
pub fn split_sentences(p: &str) -> Vec<String> {
    let chars: Vec<char> = p.chars().collect();
    let mut out = Vec::new();
    let mut start = 0;
    let mut i = 0;
    while i < chars.len() {
        if matches!(chars[i], '.' | '!' | '?') && i + 1 < chars.len() && chars[i + 1].is_whitespace() {
            let mut j = i + 1;
            while j < chars.len() && chars[j].is_whitespace() {
                j += 1;
            }
            // A lone capital before the period is an initial ("J. Smith") unless it
            // follows a number, where it is a compass letter ("195 W.").
            let after_number = {
                let mut k = i.saturating_sub(2);
                while k > 0 && chars[k].is_whitespace() {
                    k -= 1;
                }
                chars[k].is_ascii_digit()
            };
            let initial = chars[i] == '.'
                && i >= 1
                && chars[i - 1].is_uppercase()
                && (i < 2 || !chars[i - 2].is_alphanumeric())
                && !after_number;
            if j < chars.len() && (chars[j].is_uppercase() || matches!(chars[j], '"' | '\'' | '(' | '“')) && !initial {
                out.push(chars[start..=i].iter().collect::<String>().trim().to_owned());
                start = j;
                i = j;
                continue;
            }
        }
        i += 1;
    }
    if start < chars.len() {
        out.push(chars[start..].iter().collect::<String>().trim().to_owned());
    }
    out.retain(|s| !s.is_empty());
    out
}

fn strip_aliases(normed: &str, aliases: &[String]) -> (String, bool) {
    let mut padded = format!(" {normed} ");
    let mut named = false;
    for a in aliases {
        let pat = format!(" {a} ");
        while padded.contains(&pat) {
            padded = padded.replace(&pat, " ");
            named = true;
        }
    }
    (padded, named)
}

fn analyze_narrative(paras: &[String], aliases: &[String], mixed: bool, out: &mut ParsedCraft) {
    for para in paras {
        let mut this_craft = false;
        for sentence in split_sentences(para) {
            let low = sentence.to_lowercase();
            let (stripped, named) = strip_aliases(&norm(&sentence), aliases);
            let sibling = RE_SIBLING.is_match(&stripped);
            let own = if mixed {
                RE_MIXED_GENERIC.is_match(&stripped)
            } else {
                named || RE_GENERIC.is_match(&stripped) || RE_SITE_REF.is_match(&low)
            };
            let pronoun_chain = RE_PRONOUN.is_match(&low) && this_craft;
            let qualifies = !sibling && (own || pronoun_chain);
            this_craft = qualifies;
            if !qualifies || RE_HYPO.is_match(&low) {
                continue;
            }
            extract_events(&sentence, &low, out);
        }
    }
    out.ends.sort_by(|a, b| (a.date, a.basis as u8).cmp(&(b.date, b.basis as u8)));
    out.ends.dedup_by(|a, b| a.date == b.date && a.basis == b.basis);
}

fn extract_events(sentence: &str, low: &str, out: &mut ParsedCraft) {
    // Landing site and coordinates.
    if RE_LAND_VERB.is_match(sentence) {
        if out.coordinates.is_none()
            && let Some((c, raw)) = find_directional_pair(sentence)
        {
            out.coordinates = Some(c);
            out.coordinates_raw = Some(raw);
        }
        if out.landing_site.is_none()
            && let Some(c) = RE_SITE.captures(sentence)
        {
            let mut site = c[1].trim().to_owned();
            for suffix in [" region of Mars", " region"] {
                if let Some(s) = site.strip_suffix(suffix) {
                    site = s.trim().to_owned();
                }
            }
            if !site.is_empty()
                && site.split_whitespace().count() <= 8
                && !site.chars().next().is_some_and(|c| c.is_ascii_digit())
            {
                out.landing_site = Some(site);
            }
        }
    }
    // Lifecycle dates.
    for (re, basis, extra, date_may_precede) in END_PATTERNS.iter() {
        let Some(m) = re.find(low) else { continue };
        if let Some(x) = extra
            && !x.is_match(low)
        {
            continue;
        }
        // Month names are matched case-insensitively, so search the lowercase text
        // whose byte offsets `m` refers to.
        let date = find_date(&low[m.start()..])
            .map(|(_, _, d)| d)
            .or_else(|| date_may_precede.then(|| find_date(&low[..m.start()])).flatten().map(|(_, _, d)| d));
        let Some(date) = date else { continue };
        out.ends.push(EndEvidence { date, basis: *basis, evidence: sentence.to_owned() });
    }
    if RE_FAIL.is_match(low) {
        out.statuses.push(StatusEvidence { status: OperationalStatus::Failed, evidence: sentence.to_owned() });
    } else if RE_ACTIVE.is_match(low) {
        out.statuses.push(StatusEvidence { status: OperationalStatus::Active, evidence: sentence.to_owned() });
    }
}
