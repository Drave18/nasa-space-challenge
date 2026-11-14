mod common;

use std::io::{self, Write};
use std::path::Path;
use std::time::Duration;

use common::*;
use nssdca_scraper::http::{ENTRY_PAGES, Jitter, RetryPolicy};
use nssdca_scraper::model::*;
use nssdca_scraper::scrape::{publish_with, run, scrape, write_records};
use nssdca_scraper::{ScrapeConfig, publish};
use serde_json::Value;
use url::Url;
use wiremock::matchers::{method, path, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn ok(body: &str, delay: Duration) -> ResponseTemplate {
    ResponseTemplate::new(200).set_body_raw(body.as_bytes().to_vec(), "text/html; charset=utf-8").set_delay(delay)
}

async fn page(server: &MockServer, p: &str, body: &str, delay: Duration) {
    Mock::given(method("GET")).and(path(p)).respond_with(ok(body, delay)).mount(server).await;
}

async fn nmc(server: &MockServer, id: &str, resp: ResponseTemplate) {
    Mock::given(method("GET"))
        .and(path("/nmc/spacecraft/display.action"))
        .and(query_param("id", id))
        .respond_with(resp)
        .mount(server)
        .await;
}

const N: &str = "/nmc/spacecraft/display.action?id=";

/// Serve a complete synthetic archive. `d(i)` is the response delay of the i-th page.
async fn mount_archive(server: &MockServer, d: impl Fn(usize) -> Duration) {
    let nm = |id: &str| format!("{N}{id}");
    let moon = timeline(&[
        (&nm("1959-014A"), "Luna 2", "Sep 12, 1959", "Impact"),
        (&nm("1964-041A"), "Ranger 7", "Jul 28, 1964", "Impact"),
        (&nm("1966-027A"), "Luna 10", "Mar 31, 1966", "Orbiter"),
        (&nm("1967-068A"), "Surveyor 4", "Jul 14, 1967", "Attempted Lander"),
        ("apollo11info.html", "Apollo 11", "Jul 16, 1969", "Crewed Landing"),
        ("apollo13info.html", "Apollo 13", "Apr 11, 1970", "Crewed Landing (aborted)"),
        (&nm("2019-042A"), "Chandrayaan 2", "April 2019", "ISRO (India) Moon Orbiter, Lander, and Rover"),
        (&nm("VIPER"), "Griffin Mission 1", "Fall 2025", "Lunar South Pole Lander"),
    ]);
    let mars = timeline(&[
        (&nm("2003-032A"), "Opportunity (MER-B)", "8 July 2003", "Mars Rover"),
        ("viking.html", "Viking 1", "20 August 1975", "Mars Orbiter and Lander"),
        ("viking.html", "Viking 2", "9 September 1975", "Mars Orbiter and Lander"),
        (&nm("1999-001A"), "Mars Polar Lander", "3 January 1999", "Attempted Mars Lander"),
        (&nm("2011-070A"), "Mars Science Laboratory", "26 November 2011", "Mars Rover"),
        (&nm("1988-0A"), "Phobos 2", "12 July 1988", "Mars Orbiter/Attempted Phobos Landers"),
        ("mystery.html", "Mars Test Lander", "1 January 1990", "Mars Lander"),
        (&nm("1971-045A"), "Mars 2", "19 May 1971", "Mars Orbiter/ <font color=\"maroon\">Lander</font>"),
    ]);
    page(server, ENTRY_PAGES[0], &moon, d(0)).await;
    page(server, ENTRY_PAGES[1], &mars, d(1)).await;
    page(server, ENTRY_PAGES[2], APOLLO_LAND, d(2)).await;
    page(server, ENTRY_PAGES[3], ARTIFACTS, d(3)).await;
    page(server, "/planetary/lunar/apollo13info.html", APOLLO13_OVERVIEW, d(4)).await;
    page(server, "/planetary/viking.html", VIKING_OVERVIEW, d(5)).await;

    nmc(server, "2003-032A", ok(&nmc_page("2003-032A", "Opportunity", &["Opportunity explored Meridiani Terra. The final communication from the rover was received on 10 June 2018."], Some("2003-07-08")), d(6))).await;
    nmc(server, "1975-075C", ok(&nmc_page("1975-075C", "Viking 1 Lander", &["The Viking 1 Lander touched down on Chryse Planitia. It operated until 13 November 1982 when contact was lost. The Viking 1 Orbiter mission was terminated on 17 August 1980."], Some("1975-08-20")), d(7))).await;
    nmc(server, "1975-083C", ok(&nmc_page("1975-083C", "Viking 2 Lander", &["Viking 2 Lander was turned off on April 11, 1980."], Some("1975-09-09")), d(8))).await;
    nmc(server, "1999-001A", ok(&nmc_page("1999-001A", "Mars Polar Lander", &["Mars Polar Lander was to land near 76 S, 195 W. The last telemetry from Mars Polar Lander was received on 3 December 1999."], Some("1999-01-03")), d(9))).await;
    nmc(server, "2011-070A", ok(&nmc_page("2011-070A", "Mars Science Laboratory", &["The landing site in Gale Crater is at the foot of Aeolis Mons. The planned mission duration is one Martian year."], Some("2011-11-26")), d(10))).await;
    nmc(server, "1967-068A", ok(&nmc_page("1967-068A", "Surveyor 4", &["Surveyor 4 lost contact shortly before touchdown."], Some("1967-07-14")), d(11))).await;
    nmc(server, "1969-059C", ok(&nmc_page("1969-059C", "Apollo 11 Lunar Module", &["The Apollo 11 Lunar Module landed in Mare Tranquillitatis. The EASEP experiment package was turned off on 27 August 1969."], Some("1969-07-16")), d(12))).await;
    nmc(server, "1970-029C", ok(&nmc_page("1970-029C", "Apollo 13 Lunar Module", &["The Apollo 13 Lunar Module Aquarius was a lifeboat. Aquarius was jettisoned before reentry on 17 April 1970."], Some("1970-04-11")), d(13))).await;
    // Error shell served as text/xml with HTTP 200, as observed live.
    nmc(server, "2019-042A", ResponseTemplate::new(200).set_body_raw(ERROR_SHELL.as_bytes().to_vec(), "text/xml").set_delay(d(14))).await;
    nmc(server, "1971-045A", ResponseTemplate::new(200).set_body_raw(ERROR_SHELL.as_bytes().to_vec(), "text/xml")).await;
    // 404s: Luna 2, Ranger 7, VIPER detail pages are unavailable.
}

fn cfg(server: &MockServer) -> ScrapeConfig {
    ScrapeConfig::loopback(Url::parse(&server.uri()).unwrap())
}

fn by<'a>(v: &'a Value, id: &str) -> &'a Value {
    v.as_array().unwrap().iter().find(|r| r["id"] == id).unwrap_or_else(|| panic!("no record {id}"))
}

#[tokio::test]
async fn end_to_end_publishes_stable_typed_json() {
    let server = MockServer::start().await;
    mount_archive(&server, |_| Duration::ZERO).await;
    let dir = tempfile::tempdir().unwrap();
    let out = dir.path().join("nested/out/missions.json");
    let records = run(cfg(&server), &out).await.unwrap();
    assert_eq!(records.len(), records.iter().map(|r| &r.id).collect::<std::collections::HashSet<_>>().len());

    let text = std::fs::read_to_string(&out).unwrap();
    assert!(text.ends_with("}\n]\n") || text.ends_with("]\n"));
    let v: Value = serde_json::from_str(&text).unwrap();
    let names: Vec<_> = v.as_array().unwrap().iter().map(|r| r["craft_name"].as_str().unwrap().to_owned()).collect();
    assert!(!names.iter().any(|n| n.contains("booster") || n.contains("Luna 10") || n.contains("Phobos")), "{names:?}");

    // Every record carries every contract field.
    let keys: Vec<_> = v[0].as_object().unwrap().keys().cloned().collect();
    for k in ["id", "craft_name", "celestial_body", "landing_site", "landing_coordinates", "landing_coordinates_raw", "launch_date", "launch_date_raw", "end_of_mission_date", "end_of_mission_date_basis", "end_of_mission_evidence", "operational_status", "operational_status_evidence", "data_links", "source_urls", "extraction_status", "source_errors"] {
        assert!(keys.iter().any(|x| x == k), "missing {k}");
    }
    for r in v.as_array().unwrap() {
        for f in ["launch_date", "end_of_mission_date"] {
            if let Some(s) = r[f].as_str() {
                assert!(chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok(), "{f}={s}");
            }
        }
        if !r["landing_coordinates"].is_null() {
            let lon = r["landing_coordinates"]["longitude_deg"].as_f64().unwrap();
            assert!((-180.0..180.0).contains(&lon));
        }
        for l in r["data_links"].as_array().unwrap() {
            assert!(l["url"].as_str().unwrap().starts_with("http"));
        }
        assert_eq!(r["extraction_status"] == "partial", !r["source_errors"].as_array().unwrap().is_empty());
    }

    // Apollo 11: LM id from the table link; table beats stage rows of the artifact table.
    let a11 = by(&v, "1969-059C");
    assert_eq!(a11["launch_date"], "1969-07-16");
    assert_eq!(a11["landing_site"], "Mare Tranquilitatis");
    assert_eq!(a11["landing_coordinates"]["latitude_deg"], 0.674);
    assert_eq!(a11["landing_coordinates"]["longitude_deg"], 23.473);
    assert_eq!(a11["end_of_mission_date"], Value::Null, "EASEP shutdown is not the LM end");
    assert_eq!(a11["extraction_status"], "complete");

    // Apollo 13: LM from overview, failed, no landing, Earth return is not an end.
    let a13 = by(&v, "1970-029C");
    assert_eq!(a13["operational_status"], "failed");
    assert_eq!(a13["operational_status_evidence"], "Crewed Landing (aborted)");
    assert!(a13["landing_coordinates"].is_null() && a13["end_of_mission_date"].is_null());

    // Artifact enrichment survives a missing detail page; Unknown stays null; booster adds nothing.
    let r7 = by(&v, "1964-041A");
    assert!((r7["landing_coordinates"]["latitude_deg"].as_f64().unwrap() + 10.634).abs() < 1e-9);
    assert!((r7["landing_coordinates"]["longitude_deg"].as_f64().unwrap() + 20.677).abs() < 1e-9);
    assert_eq!(r7["extraction_status"], "partial");
    assert!(r7["source_errors"][0]["message"].as_str().unwrap().contains("404"));
    assert_eq!(by(&v, "1959-014A")["landing_coordinates"]["latitude_deg"], 30.0);
    let s4 = by(&v, "1967-068A");
    assert!(s4["landing_coordinates"].is_null());
    assert_eq!(s4["operational_status"], "failed");

    // Lifecycle attribution.
    let opp = by(&v, "2003-032A");
    assert_eq!((opp["launch_date"].as_str(), opp["end_of_mission_date"].as_str()), (Some("2003-07-08"), Some("2018-06-10")));
    assert_eq!((opp["end_of_mission_date_basis"].as_str(), opp["operational_status"].as_str()), (Some("last_contact"), Some("ended")));
    let kinds: Vec<_> = opp["data_links"].as_array().unwrap().iter().map(|l| l["kind"].as_str().unwrap()).collect();
    assert!(kinds.contains(&"telemetry") && kinds.contains(&"data_collection") && kinds.contains(&"experiment"));
    let v1 = by(&v, "1975-075C");
    assert_eq!((v1["end_of_mission_date"].as_str(), v1["end_of_mission_date_basis"].as_str()), (Some("1982-11-13"), Some("last_contact")));
    let v2 = by(&v, "1975-083C");
    assert_eq!((v2["end_of_mission_date"].as_str(), v2["end_of_mission_date_basis"].as_str()), (Some("1980-04-11"), Some("mission_end")));
    assert_eq!(by(&v, "1975-075C")["craft_name"], "Viking 1 Lander");
    assert!(v.as_array().unwrap().iter().all(|r| r["id"] != "1975-075A"), "orbiters are not surface craft");
    let mpl = by(&v, "1999-001A");
    assert_eq!(mpl["operational_status"], "failed");
    assert_eq!((mpl["end_of_mission_date"].as_str(), mpl["end_of_mission_date_basis"].as_str()), (Some("1999-12-03"), Some("last_contact")));
    assert!(mpl["landing_coordinates"].is_null());
    let msl = by(&v, "2011-070A");
    assert_eq!(msl["landing_site"], "Gale Crater");
    assert!(msl["end_of_mission_date"].is_null());
    assert_eq!(msl["operational_status"], "unknown");

    // HTTP-200 error shell: seed facts retained, partial, not a mission failure; vague launch dates stay raw.
    let ch2 = by(&v, "2019-042A");
    assert_eq!(ch2["extraction_status"], "partial");
    assert_eq!((ch2["launch_date"].is_null(), ch2["launch_date_raw"].as_str()), (true, Some("April 2019")));
    assert_eq!(ch2["operational_status"], "unknown");
    assert_eq!(ch2["craft_name"], "Chandrayaan 2");
    assert!(ch2["source_errors"][0]["message"].as_str().unwrap().contains("error page"));
    let grif = by(&v, "VIPER");
    assert_eq!((grif["launch_date"].is_null(), grif["launch_date_raw"].as_str(), grif["operational_status"].as_str()), (true, Some("Fall 2025"), Some("unknown")));
    // Mixed-role mission failure comes from the timeline descriptor, not scraping failure.
    assert_eq!(by(&v, "1971-045A")["operational_status"], "unknown");

    // Unsupported overview keeps the seed under a stable source-name id.
    let mystery = by(&v, &format!("{}/planetary/mystery.html#mars-test-lander", server.uri()));
    assert_eq!(mystery["extraction_status"], "partial");
    assert!(mystery["source_errors"][0]["message"].as_str().unwrap().contains("unsupported overview"));
    assert_eq!(mystery["celestial_body"], "Mars");

    // Sorted output.
    let order: Vec<_> = v.as_array().unwrap().iter().map(|r| (r["celestial_body"].as_str().unwrap(), r["craft_name"].as_str().unwrap(), r["id"].as_str().unwrap())).collect();
    let mut sorted = order.clone();
    sorted.sort_by(|a, b| (a.0 != "Moon", a.1, a.2).cmp(&(b.0 != "Moon", b.1, b.2)));
    assert_eq!(order, sorted);
}

#[tokio::test]
async fn output_bytes_do_not_depend_on_response_timing() {
    let server = MockServer::start().await;
    mount_archive(&server, |_| Duration::ZERO).await;
    let dir = tempfile::tempdir().unwrap();
    let (a, b) = (dir.path().join("a.json"), dir.path().join("b.json"));
    run(cfg(&server), &a).await.unwrap();
    server.reset().await;
    mount_archive(&server, |i| Duration::from_millis(((i * 37) % 11 * 9) as u64)).await;
    run(cfg(&server), &b).await.unwrap();
    assert_eq!(std::fs::read(&a).unwrap(), std::fs::read(&b).unwrap());
}

const SENTINEL: &[u8] = b"[\"previous\"]\n";

fn sentinel(dir: &Path) -> std::path::PathBuf {
    let p = dir.join("missions.json");
    std::fs::write(&p, SENTINEL).unwrap();
    p
}

#[tokio::test]
async fn required_source_failure_keeps_previous_output() {
    for broken in 0..4 {
        let server = MockServer::start().await;
        mount_archive(&server, |_| Duration::ZERO).await;
        // Highest-priority mock: this entry page now fails permanently.
        Mock::given(method("GET")).and(path(ENTRY_PAGES[broken])).respond_with(ResponseTemplate::new(404)).with_priority(1).mount(&server).await;
        let dir = tempfile::tempdir().unwrap();
        let out = sentinel(dir.path());
        let e = run(cfg(&server), &out).await.unwrap_err();
        assert!(e.to_string().contains(ENTRY_PAGES[broken]), "{e:#}");
        assert_eq!(std::fs::read(&out).unwrap(), SENTINEL, "entry page {broken}");
    }
}

#[tokio::test]
async fn zero_recognized_rows_abort_publication() {
    let server = MockServer::start().await;
    mount_archive(&server, |_| Duration::ZERO).await;
    Mock::given(method("GET")).and(path(ENTRY_PAGES[0])).respond_with(ok("<html><body><a href=\"/x\">Home</a><br></body></html>", Duration::ZERO)).with_priority(1).mount(&server).await;
    let dir = tempfile::tempdir().unwrap();
    let out = sentinel(dir.path());
    let e = run(cfg(&server), &out).await.unwrap_err();
    assert!(format!("{e:#}").contains("no mission timeline rows"), "{e:#}");
    assert_eq!(std::fs::read(&out).unwrap(), SENTINEL);
}

struct FailAfter<W: Write> {
    inner: W,
    left: usize,
}

impl<W: Write> Write for FailAfter<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        if self.left == 0 {
            return Err(io::Error::other("disk full"));
        }
        let n = buf.len().min(self.left);
        self.left -= n;
        self.inner.write(&buf[..n])
    }
    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

fn sample_record() -> MissionRecord {
    MissionRecord {
        id: "X".into(),
        craft_name: "X".into(),
        celestial_body: CelestialBody::Moon,
        landing_site: None,
        landing_coordinates: None,
        landing_coordinates_raw: None,
        launch_date: None,
        launch_date_raw: None,
        end_of_mission_date: None,
        end_of_mission_date_basis: None,
        end_of_mission_evidence: None,
        operational_status: OperationalStatus::Unknown,
        operational_status_evidence: None,
        data_links: vec![],
        source_urls: vec![],
        extraction_status: ExtractionStatus::Complete,
        source_errors: vec![],
    }
}

#[test]
fn write_failure_leaves_destination_and_directory_untouched() {
    let dir = tempfile::tempdir().unwrap();
    let out = sentinel(dir.path());
    let recs = vec![sample_record(); 3];
    let err = publish_with(&out, |w| write_records(&recs, FailAfter { inner: w, left: 50 })).unwrap_err();
    assert!(format!("{err:#}").contains("disk full"), "{err:#}");
    assert_eq!(std::fs::read(&out).unwrap(), SENTINEL);
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1, "temp file must be cleaned up");

    publish(&out, &recs).unwrap();
    let v: Value = serde_json::from_slice(&std::fs::read(&out).unwrap()).unwrap();
    assert_eq!(v.as_array().unwrap().len(), 3);
    assert_eq!(v[0]["landing_site"], Value::Null);
    assert_eq!(v[0]["data_links"], serde_json::json!([]));
}

#[tokio::test]
async fn scrape_alone_never_writes() {
    let server = MockServer::start().await;
    mount_archive(&server, |_| Duration::ZERO).await;
    let mut c = cfg(&server);
    c.retry = RetryPolicy { max_attempts: 1, base_backoff: Duration::ZERO, max_backoff: Duration::ZERO, jitter: Jitter::Fixed(Duration::ZERO) };
    assert!(!scrape(c).await.unwrap().is_empty());
}
