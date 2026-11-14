//! Public JSON contract. Field order here is the serialized order.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum CelestialBody {
    Moon,
    Mars,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OperationalStatus {
    Active,
    Ended,
    Failed,
    Planned,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EndBasis {
    MissionEnd,
    LastContact,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LinkKind {
    DataCollection,
    Telemetry,
    Experiment,
    Archive,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExtractionStatus {
    Complete,
    Partial,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Coordinates {
    pub latitude_deg: f64,
    pub longitude_deg: f64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DataLink {
    pub label: String,
    pub url: String,
    pub kind: LinkKind,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct SourceError {
    pub url: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MissionRecord {
    pub id: String,
    pub craft_name: String,
    pub celestial_body: CelestialBody,
    pub landing_site: Option<String>,
    pub landing_coordinates: Option<Coordinates>,
    pub landing_coordinates_raw: Option<String>,
    pub launch_date: Option<chrono::NaiveDate>,
    pub launch_date_raw: Option<String>,
    pub end_of_mission_date: Option<chrono::NaiveDate>,
    pub end_of_mission_date_basis: Option<EndBasis>,
    pub end_of_mission_evidence: Option<String>,
    pub operational_status: OperationalStatus,
    pub operational_status_evidence: Option<String>,
    pub data_links: Vec<DataLink>,
    pub source_urls: Vec<String>,
    pub extraction_status: ExtractionStatus,
    pub source_errors: Vec<SourceError>,
}
