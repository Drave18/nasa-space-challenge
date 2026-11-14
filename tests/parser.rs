mod common;

use common::*;
use nssdca_scraper::model::*;
use nssdca_scraper::parse::*;
use url::Url;

fn u(s: &str) -> Url {
    Url::parse(s).unwrap()
}

fn page() -> Url {
    u("https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=X")
}

fn seed(id: &str, name: &str, mixed: bool) -> CraftSeed {
    CraftSeed { id: id.into(), name: name.into(), mixed_role: mixed }
}

fn d(y: i32, m: u32, day: u32) -> chrono::NaiveDate {
    chrono::NaiveDate::from_ymd_opt(y, m, day).unwrap()
}

#[test]
fn apollo_table_with_bold_td_headers_joins_lm_by_link() {
    let base = u("https://nssdc.gsfc.nasa.gov/planetary/lunar/apolloland.html");
    let rows = parse_tables(APOLLO_LAND, &base).unwrap();
    assert_eq!(rows.len(), 1);
    let r = &rows[0];
    assert_eq!(r.name, "11");
    assert_eq!(r.nmc_id.as_deref(), Some("1969-059C"));
    assert_eq!(r.launch_raw.as_deref(), Some("16 Jul 1969"));
    assert_eq!(r.landing_site.as_deref(), Some("Mare Tranquilitatis"));
    let c = r.coordinates.unwrap();
    assert_eq!((c.latitude_deg, c.longitude_deg), (0.674, 23.473));
    assert_eq!(r.coordinates_raw.as_deref(), Some("0.674 N, 23.473 E"));
}

#[test]
fn artifact_table_coordinates_signed_and_unknown_rejected() {
    let base = u("https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html");
    let rows = parse_tables(ARTIFACTS, &base).unwrap();
    let by = |n: &str| rows.iter().find(|r| r.name == n).unwrap_or_else(|| panic!("row {n}"));
    let r7 = by("Ranger 7").coordinates.unwrap();
    assert!((r7.latitude_deg + 10.634).abs() < 1e-9 && (r7.longitude_deg + 20.677).abs() < 1e-9, "{r7:?}");
    assert_eq!(by("Ranger 7").coordinates_raw.as_deref(), Some("-10.6340, 339.3230"));
    assert!(by("Surveyor 4").coordinates.is_none());
    assert!(by("Luna 2 booster 3rd stage").coordinates.is_none());
    let l2 = by("Luna 2").coordinates.unwrap();
    assert_eq!((l2.latitude_deg, l2.longitude_deg), (30.0, 0.0));
}

#[test]
fn table_status_and_end_date_aliases() {
    let html = r#"<table><tr><th>Craft Name</th><th>Launch Date</th><th>Operational Status</th><th>End Date</th><th>Landing Site</th><th>Latitude, Longitude</th></tr>
<tr><td>Test Lander</td><td>1999-05-04</td><td>Terminated</td><td>2000-01-02</td><td>Plain</td><td>12.5 S, 170.25 E</td></tr>
<tr><td>Odd Lander</td><td>1 Jan 2001</td><td>Hibernating</td><td>sometime</td><td></td><td>1 N to 3 N, 4 E</td></tr></table>"#;
    let rows = parse_tables(html, &u("https://nssdc.gsfc.nasa.gov/x.html")).unwrap();
    assert_eq!(map_status_label(rows[0].status_raw.as_deref().unwrap()), Some(OperationalStatus::Ended));
    assert_eq!(rows[0].end_date, Some(d(2000, 1, 2)));
    assert_eq!(rows[0].coordinates.unwrap().longitude_deg, 170.25);
    assert_eq!(map_status_label("Hibernating"), None);
    assert_eq!(rows[1].end_date, None);
    assert!(rows[1].coordinates.is_none(), "numeric ranges are rejected");
}

#[test]
fn tables_without_a_recognized_header_error() {
    assert!(parse_tables("<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>", &page()).is_err());
}

#[test]
fn nested_table_rows_do_not_leak_into_parent() {
    let html = r#"<table><tr><th>Spacecraft</th><th>Launch Date</th></tr>
<tr><td>Outer<table><tr><td>Inner</td><td>2000-01-01</td></tr></table></td><td>1999-01-01</td></tr></table>"#;
    let rows = parse_tables(html, &page()).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].launch_raw.as_deref(), Some("1999-01-01"));
}

#[test]
fn full_dates_only() {
    assert_eq!(parse_full_date("2003-07-08"), Some(d(2003, 7, 8)));
    assert_eq!(parse_full_date("13 November 1982"), Some(d(1982, 11, 13)));
    assert_eq!(parse_full_date("16 Jul 1969"), Some(d(1969, 7, 16)));
    assert_eq!(parse_full_date("Sep 12, 1959"), Some(d(1959, 9, 12)));
    assert_eq!(parse_full_date("April 11, 1980"), Some(d(1980, 4, 11)));
    assert_eq!(parse_full_date("11 April 1970 UT 19:13:00 (02:13:00 p.m. EST)"), Some(d(1970, 4, 11)));
    assert_eq!(parse_full_date("2003-07-08T03:18:15Z"), Some(d(2003, 7, 8)));
    for partial in ["April 2019", "Fall 2025", "2025", "May 4", "31 February 2001", "1969-13-40"] {
        assert_eq!(parse_full_date(partial), None, "{partial}");
    }
}

#[test]
fn timeline_rows_include_nested_font_and_exclude_navigation() {
    let html = timeline(&[
        ("/nmc/spacecraft/display.action?id=1973-052A", "Mars 6", "5 August 1973", "Mars Lander <font color=\"maroon\">(Contact Lost)</font>"),
        ("/nmc/spacecraft/display.action?id=1971-051A", "Mariner 9", "30 May 1971", "Mars Orbiter"),
        ("/nmc/spacecraft/display.action?id=1988-0A", "Phobos 2", "12 July 1988", "Mars Orbiter/Attempted Phobos Landers"),
        ("viking.html", "Viking 1", "20 August 1975", "Mars Orbiter and Lander"),
        ("/nmc/spacecraft/display.action?id=PEN", "Deep Space 2", "3 January 1999", "Attempted Mars Penetrators"),
    ]);
    let seeds = parse_timeline(&html, &u("https://nssdc.gsfc.nasa.gov/planetary/chronology_mars.html"), CelestialBody::Mars).unwrap();
    let names: Vec<_> = seeds.iter().map(|s| s.name.as_str()).collect();
    assert_eq!(names, ["Mars 6", "Viking 1", "Deep Space 2"]);
    assert_eq!(seeds[0].description, "Mars Lander (Contact Lost)");
    assert_eq!(seeds[0].launch_raw, "5 August 1973");
    assert_eq!(seeds[0].nmc_id.as_deref(), Some("1973-052A"));
    assert_eq!(seeds[1].link.as_str(), "https://nssdc.gsfc.nasa.gov/planetary/viking.html");
    assert!(seeds[1].nmc_id.is_none());
}

#[test]
fn timeline_without_rows_is_an_error() {
    let html = "<html><body><a href=\"/x.html\">Home</a><br></body></html>";
    assert!(parse_timeline(html, &u("https://nssdc.gsfc.nasa.gov/a.html"), CelestialBody::Moon).is_err());
}

#[test]
fn opportunity_launch_end_and_links() {
    let html = nmc_page(
        "2003-032A",
        "Opportunity",
        &["Opportunity explored Meridiani Terra for over 14 years. The final communication from the rover was received on 10 June 2018."],
        Some("2003-07-08"),
    );
    let c = parse_spacecraft(&html, &page(), &seed("2003-032A", "Opportunity (MER-B)", false)).unwrap();
    assert_eq!(c.name, "Opportunity");
    assert_eq!(c.launch_date, Some(d(2003, 7, 8)));
    assert_eq!(c.ends.len(), 1);
    assert_eq!(c.ends[0].date, d(2018, 6, 10));
    assert_eq!(c.ends[0].basis, EndBasis::LastContact);
    let kinds: Vec<_> = c.links.iter().map(|l| (l.kind, l.url.as_str())).collect();
    assert!(kinds.contains(&(LinkKind::Telemetry, "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/displayTelemetry.action?id=2003-032A")));
    assert!(kinds.contains(&(LinkKind::DataCollection, "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/displayDataset.action?spacecraftId=2003-032A")));
    assert_eq!(c.links.len(), 3, "trajectory link must not be treated as data: {kinds:?}");
}

#[test]
fn personnel_text_is_not_narrative() {
    // The fixture's Personnel table contains "The final communication was on 1 January 2001."
    let html = nmc_page("X-1", "Probe", &["Probe landed."], None);
    let c = parse_spacecraft(&html, &page(), &seed("X-1", "Probe", false)).unwrap();
    assert!(c.ends.is_empty());
}

#[test]
fn viking_lander_dates_do_not_take_orbiter_dates() {
    let v1 = nmc_page(
        "1975-075C",
        "Viking 1 Lander",
        &["The Viking 1 Lander touched down on Chryse Planitia. It operated until 13 November 1982 when contact was lost. The Viking 1 Orbiter mission was terminated on 17 August 1980. It had run out of attitude control gas."],
        None,
    );
    let c = parse_spacecraft(&v1, &page(), &seed("1975-075C", "Viking 1", false)).unwrap();
    let dates: Vec<_> = c.ends.iter().map(|e| (e.date, e.basis)).collect();
    assert_eq!(dates, [(d(1982, 11, 13), EndBasis::LastContact)]);

    let v2 = nmc_page(
        "1975-083C",
        "Viking 2 Lander",
        &["The Viking 2 Orbiter operations ended on 25 July 1978. Viking 2 Lander was turned off on April 11, 1980."],
        None,
    );
    let c = parse_spacecraft(&v2, &page(), &seed("1975-083C", "Viking 2", false)).unwrap();
    let dates: Vec<_> = c.ends.iter().map(|e| (e.date, e.basis)).collect();
    assert_eq!(dates, [(d(1980, 4, 11), EndBasis::MissionEnd)]);
}

#[test]
fn experiment_shutdowns_and_primary_missions_are_not_craft_ends() {
    let html = nmc_page(
        "1969-059C",
        "Apollo 11 Lunar Module",
        &["The Apollo 11 Lunar Module landed in Mare Tranquillitatis. The EASEP experiment package was turned off on 27 August 1969. The primary mission ended on 24 July 1969. The nominal mission terminated on 1 August 1969."],
        None,
    );
    let c = parse_spacecraft(&html, &page(), &seed("1969-059C", "Apollo 11 Lunar Module", false)).unwrap();
    assert!(c.ends.is_empty(), "{:?}", c.ends);
    assert_eq!(c.landing_site.as_deref(), Some("Mare Tranquillitatis"));
}

#[test]
fn mixed_role_records_need_explicit_lander_subject() {
    let html = nmc_page(
        "2003-022A",
        "Mars Express",
        &["Mars Express was launched on 2 June 2003. Mars Express operations ended on 1 January 2030. The spacecraft was lost on 3 March 2004. The lander contact was lost on 25 December 2003."],
        None,
    );
    let c = parse_spacecraft(&html, &page(), &seed("2003-022A", "Mars Express", true)).unwrap();
    let dates: Vec<_> = c.ends.iter().map(|e| e.date).collect();
    assert_eq!(dates, [d(2003, 12, 25)]);
}

#[test]
fn msl_site_is_captured_without_end_or_status() {
    let html = nmc_page(
        "2011-070A",
        "Mars Science Laboratory",
        &["The landing site in Gale Crater is at the foot of Aeolis Mons. The planned mission duration is one Martian year."],
        None,
    );
    let c = parse_spacecraft(&html, &page(), &seed("2011-070A", "Mars Science Laboratory", false)).unwrap();
    assert_eq!(c.landing_site.as_deref(), Some("Gale Crater"));
    assert!(c.coordinates.is_none() && c.ends.is_empty() && c.statuses.is_empty());
}

#[test]
fn pathfinder_site_and_coordinates() {
    let html = nmc_page(
        "1996-068A",
        "Mars Pathfinder",
        &["The landing site in the Ares Vallis region of Mars is at 19.33 N, 33.55 W. Communications were lost on 27 September 1997."],
        None,
    );
    let c = parse_spacecraft(&html, &page(), &seed("1996-068A", "Mars Pathfinder Lander", false)).unwrap();
    assert_eq!(c.landing_site.as_deref(), Some("Ares Vallis"));
    let co = c.coordinates.unwrap();
    assert_eq!((co.latitude_deg, co.longitude_deg), (19.33, -33.55));
    assert_eq!(c.coordinates_raw.as_deref(), Some("19.33 N, 33.55 W"));
}

#[test]
fn mars_polar_lander_target_coordinates_are_not_landing_coordinates() {
    let html = nmc_page(
        "1999-001A",
        "Mars Polar Lander",
        &["Mars Polar Lander was to land near 76 S, 195 W. The landing ellipse was about 200 km wide. The last telemetry from Mars Polar Lander was received on 3 December 1999."],
        None,
    );
    let c = parse_spacecraft(&html, &page(), &seed("1999-001A", "Mars Polar Lander", false)).unwrap();
    assert!(c.coordinates.is_none());
    assert_eq!(c.ends.len(), 1);
    assert_eq!((c.ends[0].date, c.ends[0].basis), (d(1999, 12, 3), EndBasis::LastContact));
}

#[test]
fn uncertain_or_unknown_coordinates_are_rejected() {
    let html = nmc_page(
        "X-2",
        "Probe",
        &["Probe landed at Unknown (0.5 N, 1.5 W). Probe touched down at 3 N, 4 E?"],
        None,
    );
    let c = parse_spacecraft(&html, &page(), &seed("X-2", "Probe", false)).unwrap();
    assert!(c.coordinates.is_none());
}

#[test]
fn semantic_error_shells_and_identity_mismatch_fail() {
    let e = parse_spacecraft(ERROR_SHELL, &page(), &seed("1971-045A", "Mars 2", true)).unwrap_err();
    assert!(e.to_string().contains("error page"), "{e}");
    let html = nmc_page("OTHER-1", "Other", &["Other landed."], None);
    let e = parse_spacecraft(&html, &page(), &seed("1971-045A", "Mars 2", true)).unwrap_err();
    assert!(e.to_string().contains("does not match"), "{e}");
    assert!(parse_spacecraft("<html><body>nothing</body></html>", &page(), &seed("a", "b", false)).is_err());
}

#[test]
fn legacy_nssdca_id_label_is_accepted() {
    let html = nmc_page("MESURPR", "Sojourner", &["Sojourner roved."], None).replace("NSSDCA/COSPAR ID:", "NSSDCA ID:");
    assert!(parse_spacecraft(&html, &page(), &seed("MESURPR", "Mars Pathfinder Rover", false)).is_ok());
}

#[test]
fn overviews_select_only_own_surface_craft() {
    let base = u("https://nssdc.gsfc.nasa.gov/planetary/viking.html");
    let v = parse_overview(VIKING_OVERVIEW, &base, OverviewKind::Viking, "Viking 2").unwrap();
    assert_eq!(v.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(), ["1975-083C"]);
    let base = u("https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo13info.html");
    let a = parse_overview(APOLLO13_OVERVIEW, &base, OverviewKind::Apollo(13), "Apollo 13").unwrap();
    assert_eq!(a.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(), ["1970-029C"]);
    assert!(parse_overview("<html></html>", &base, OverviewKind::Apollo(13), "Apollo 13").is_err());
}

#[test]
fn sentence_splitting_respects_decimals_initials_and_compass_letters() {
    assert_eq!(split_sentences("It was at 19.33 N, 33.55 W. The next one. Done"), ["It was at 19.33 N, 33.55 W.", "The next one.", "Done"]);
    assert_eq!(split_sentences("Reported by J. Smith in 1999. Next."), ["Reported by J. Smith in 1999.", "Next."]);
}

#[test]
fn conditional_failure_speculation_is_not_status_evidence() {
    let html = nmc_page(
        "1967-068A",
        "Surveyor 4",
        &["It was not known if only communications were lost and the lander proceeded with a soft landing, or if the lander crashed."],
        None,
    );
    let c = parse_spacecraft(&html, &page(), &seed("1967-068A", "Surveyor 4", false)).unwrap();
    assert!(c.statuses.is_empty() && c.ends.is_empty());
}

#[test]
fn package_named_in_craft_title_supplies_its_own_end_date() {
    let a11 = nmc_page(
        "1969-059C",
        "Apollo 11 Lunar Module / EASEP",
        &["The EASEP was turned on by ground command on 21 July 1969. On 27 August 1969, near noon of this second lunar day, the EASEP no longer accepted commands from Earth stations and the experiment was terminated."],
        None,
    );
    let c = parse_spacecraft(&a11, &page(), &seed("1969-059C", "Apollo 11 Lunar Module / EASEP", false)).unwrap();
    let dates: Vec<_> = c.ends.iter().map(|e| (e.date, e.basis)).collect();
    assert_eq!(dates, [(d(1969, 8, 27), EndBasis::MissionEnd)]);

    let a15 = nmc_page(
        "1971-063C",
        "Apollo 15 Lunar Module /ALSEP",
        &["The ALSEP central station was turned on at 18:37 UT on 31 July 1971 and shut down along with the other ALSEP stations on 30 September 1977."],
        None,
    );
    let c = parse_spacecraft(&a15, &page(), &seed("1971-063C", "Apollo 15 Lunar Module /ALSEP", false)).unwrap();
    let dates: Vec<_> = c.ends.iter().map(|e| (e.date, e.basis)).collect();
    assert_eq!(dates, [(d(1977, 9, 30), EndBasis::MissionEnd)]);
}

#[test]
fn temporary_lunar_night_shutdown_is_not_an_end() {
    let html = nmc_page(
        "1967-084A",
        "Surveyor 5",
        &["The spacecraft shut down from September 24 to October 15, 1967 over the first lunar night."],
        None,
    );
    let c = parse_spacecraft(&html, &page(), &seed("1967-084A", "Surveyor 5", false)).unwrap();
    assert!(c.ends.is_empty(), "{:?}", c.ends);
}
