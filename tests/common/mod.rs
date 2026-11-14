#![allow(dead_code)]

/// Minimal NMC detail page with the structure observed on live records.
pub fn nmc_page(id: &str, h1: &str, paras: &[&str], launch: Option<&str>) -> String {
    let body: String = paras.iter().map(|p| format!("<p>{p}</p>")).collect();
    let launch = launch
        .map(|l| format!("<p><strong>Launch Date:</strong> {l}<br/><strong>Mass:</strong> 1 kg<br/></p>"))
        .unwrap_or_default();
    format!(
        r#"<html><body><div id="contentwrapper"><div id="rightcontent"><h1>{h1}</h1><p><strong>NSSDCA/COSPAR ID:</strong> {id}</p><div class="twocol"><div class="urone"><h2>Description</h2>{body}</div><div class="urtwo"><h2>Facts in Brief</h2>{launch}<h2>Additional Information</h2><ul><li><a href="/nmc/spacecraft/displayTrajectory.action?id={id}">Launch/Orbital information</a></li><li><a href="/nmc/spacecraft/displayTelemetry.action?id={id}">Telecommunications information</a></li></ul><ul><li><a href="/nmc/spacecraft/displayExperiment.action?spacecraftId={id}">Experiments</a></li><li><a href="/nmc/spacecraft/displayDataset.action?spacecraftId={id}">Data collections</a></li></ul></div></div><div class="clear"> </div><h2>Personnel</h2><table><tr><td>The final communication was on 1 January 2001.</td></tr></table></div></div></body></html>"#
    )
}

pub const ERROR_SHELL: &str = r#"<html><head><title>NSSDCA</title></head><body><div id="contentwrapper"><div id="rightcontent"><h1>Master Catalog</h1><div class="actionMessage">An error has occurred</div><p>Please search again</p></div></div></body></html>"#;

/// Legacy timeline: `<a>` + trailing text up to `<br>`; `desc` is raw HTML.
pub fn timeline(rows: &[(&str, &str, &str, &str)]) -> String {
    let mut s = String::from("<html><body><h1>Timeline</h1><h3>Missions</h3><br><p>\r\n");
    for (href, name, launch, desc) in rows {
        s.push_str(&format!(
            "<IMG ALT=\"|--\" SRC=\"x.gif\"> <a href=\"{href}\"> {name} </a>   -  {launch}  -  {desc}<br>\r\n"
        ));
    }
    s.push_str("<p><a href=\"/planetary/chrono.html\"><img alt=\" \" src=\"/b.gif\"> Chronology of Exploration</a><br></body></html>");
    s
}

pub const APOLLO_LAND: &str = r#"<html><body><h1>Apollo Lunar Landings</h1><table border=1>
<tr><td align=center><b>Apollo<br>Mission</b></td><td><b>Launch<br>Date</b></td><td><b>Landing<br>Date</b></td><td><b>Landing Site</b></td><td><b>Latitude</b></td><td><b>Longitude</b></td></tr>
<tr><td><b><a href="/nmc/spacecraft/display.action?id=1969-059C">11</a></b></td><td>16 Jul 1969</td><td>20 Jul 1969</td><td>Mare Tranquilitatis</td><td>0.674 N</td><td>23.473 E</td></tr>
</table></body></html>"#;

pub const ARTIFACTS: &str = r##"<html><body><table border="1">
<tr><th>Spacecraft</th><th>Landing Type</th><th>Landing/Impact<br /> Date</th><th>Latitude, Longitude<br /></th><th>Latitude, Longitude<br />(N, E Positive)</th><th>Notes</th><th>L<br>O</th></tr>
<tr><th align="left"><a href="/nmc/spacecraft/display.action?id=1959-014A">Luna 2</a></th><td>Impact</td><td>&nbsp; 13 September 1959 &nbsp;</td><td>&nbsp; 30 N, 0 E &nbsp;</td><td>&nbsp; 30., 0. &nbsp;</td><td><a href="#a">a</a></td><td bgcolor="#DA9CF7"></td></tr>
<tr bgcolor="#FF6363"><th align="left"><a href="/nmc/spacecraft/display.action?id=1959-014A">Luna 2 booster<br />3rd stage</a></th><td>Impact</td><td>13 September 1959</td><td>Unknown</td><td>Unknown</td><td>b</td><td></td></tr>
<tr><th align="left"><a href="/nmc/spacecraft/display.action?id=1964-041A">Ranger 7</a></th><td>Impact</td><td>31 July 1964</td><td><a href="http://example.org/r7">10.6340 S, 20.6770 W</a></td><td>-10.6340, 339.3230</td><td>d</td><td></td></tr>
<tr><th align="left"><a href="/nmc/spacecraft/display.action?id=1967-068A">Surveyor 4</a></th><td>Impact (?)</td><td>17 July 1967</td><td>Unknown (0.5 N, 1.5 W)</td><td>Unknown (0.5, 358.5)</td><td>i</td><td></td></tr>
<tr><th align="left"><a href="/nmc/spacecraft/display.action?id=1969-059C">Apollo 11 LM<br /> descent stage</a></th><td>Crewed Landing</td><td>20 July 1969</td><td>0.67416 N, 23.47314 E</td><td>0.67416, 23.47314</td><td>d</td><td></td></tr>
<tr><th align="left"><a href="/nmc/spacecraft/display.action?id=1969-059C">Apollo 11 LM<br /> ascent stage</a></th><td>Impact</td><td>21 July 1969</td><td>Unknown</td><td>Unknown</td><td>e</td><td></td></tr>
</table></body></html>"##;

pub const APOLLO13_OVERVIEW: &str = r#"<html><body><h1>Apollo 13</h1><b>Launched:</b> 11 April 1970 UT 19:13:00<br>forced cancellation of lunar landing<br><b>Returned to Earth:</b> 17 April 1970 UT 18:07:41<br>
<h2><a href="/nmc/spacecraft/display.action?id=1970-029A">Apollo 13 Command Module "Odyssey"</a></h2>
<a href="/nmc/spacecraft/display.action?id=1970-029A&ex=01">Experiments</a>
<h2><a href="/nmc/spacecraft/display.action?id=1970-029C">
Apollo 13 Lunar Module "Aquarius"</a></h2>
<a href="/nmc/spacecraft/display.action?id=1970-029C&ex=01">Experiments</a>
<a href="/planetary/lunar/apollo12info.html">Related</a></body></html>"#;

pub const VIKING_OVERVIEW: &str = r#"<html><body><h4>Detailed information on the individual spacecraft</h4>
<a href="/nmc/spacecraft/display.action?id=1975-075A"><img alt=" " src="/b.gif"> Viking 1 Orbiter</a><br>
<a href="/nmc/spacecraft/display.action?id=1975-075C"><img alt=" " src="/b.gif"> Viking 1 Lander</a><br>
<a href="/nmc/spacecraft/display.action?id=1975-083A"><img alt=" " src="/b.gif"> Viking 2 Orbiter</a><br>
<a href="/nmc/spacecraft/display.action?id=1975-083C"><img alt=" " src="/b.gif"> Viking 2 Lander</a><br>
<a href="/planetary/mesur.html">Mars Pathfinder</a></body></html>"#;
