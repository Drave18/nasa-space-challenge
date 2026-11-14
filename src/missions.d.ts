export type CelestialBody = 'Moon' | 'Mars';
export type OperationalStatus = 'active' | 'ended' | 'failed' | 'planned' | 'unknown';
export type EndBasis = 'mission_end' | 'last_contact';
export type LinkKind = 'data_collection' | 'telemetry' | 'experiment' | 'archive';
export type ExtractionStatus = 'complete' | 'partial';

export interface Coordinates {
  latitude_deg: number;
  longitude_deg: number;
}

export interface DataLink {
  label: string;
  url: string;
  kind: LinkKind;
}

export interface SourceError {
  url: string;
  message: string;
}

export interface MissionRecord {
  id: string;
  craft_name: string;
  celestial_body: CelestialBody;
  landing_site: string | null;
  landing_coordinates: Coordinates | null;
  landing_coordinates_raw: string | null;
  /** ISO date YYYY-MM-DD */
  launch_date: string | null;
  launch_date_raw: string | null;
  /** ISO date YYYY-MM-DD */
  end_of_mission_date: string | null;
  end_of_mission_date_basis: EndBasis | null;
  end_of_mission_evidence: string | null;
  operational_status: OperationalStatus;
  operational_status_evidence: string | null;
  data_links: DataLink[];
  source_urls: string[];
  extraction_status: ExtractionStatus;
  source_errors: SourceError[];
}

export function loadMissions(url?: string | URL): Promise<MissionRecord[]>;
