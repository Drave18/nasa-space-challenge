import { normalizePage, type NormalizedPage } from './content.ts';
import { readMissionRecords, type MissionRecord } from './missions.ts';
import { readPageExport } from './pages.ts';
import modelManifest from '../public/models/optimized/manifest.json' with { type: 'json' };

export interface Label {
  t: string;
  p: [number, number, number];
}

export type Media =
  | { kind: 'model'; src: string; poster: string; alt: string; bytes: number; ground: 'moon' | 'mars' | null; credit: string | null; labels?: Label[] }
  | { kind: 'image'; src: string; alt: string; credit: string };

export interface MissionEntry {
  slug: string;
  file: string;
  shortName: string;
  body: string;
  recordIds: string[];
  media: Media;
}

// Anchors in world units (model centred on x/z, feet at y=0, ladder side = -x).
const APOLLO_11_LABELS: Label[] = [
  { t: 'Antenna', p: [-30.8, 115.3, -27.5] },
  { t: 'Rendezvous radar antenna', p: [-26.8, 109.2, 22.5] },
  { t: 'EVA antenna', p: [15.1, 129.1, -0.2] },
  { t: 'Overhead hatch', p: [1.7, 108.9, -4.6] },
  { t: 'Forward hatch', p: [-23.2, 80.1, 22] },
  { t: 'Docking window', p: [-30.8, 79.2, -16.7] },
  { t: 'Thrust chamber cluster', p: [-39.8, 85.9, -3] },
  { t: 'Thrust chamber cluster', p: [42.7, 99.5, 2] },
  { t: 'Tracking light', p: [-24.9, 89.9, 23.9] },
  { t: 'Docking lights', p: [-38.1, 89.9, -4.4] },
  { t: 'Plume deflector', p: [1.8, 90.5, 36.5] },
  { t: 'Egress platform', p: [-27.3, 62.1, 25.7] },
  { t: 'Ladder', p: [-51.2, 38.1, 43.9] },
  { t: 'Landing gear', p: [-52.3, 28.8, -50.8] },
  { t: 'Landing probe', p: [-62.4, 12.7, 61.8] },
  { t: 'Descent stage', p: [-36.1, 28.9, -2.2] },
];

export const CATALOG: MissionEntry[] = [
  {
    slug: 'apollo-11',
    file: 'apollo-11-1969-059C.json',
    shortName: 'Apollo 11 LM',
    body: 'Moon',
    recordIds: ['1969-059C'],
    media: {
      kind: 'model',
      src: modelManifest['apollo-11'].src,
      poster: '/images/posters/apollo-11.webp', alt: '3D view of Apollo 11 LM', bytes: modelManifest['apollo-11'].bytes,
      ground: 'moon',
      credit: 'Based on "Apollo 11 Lunar Module" by CMFDesign (Sketchfab), CC-BY-4.0; optimized for web delivery',
      labels: APOLLO_11_LABELS,
    },
  },
  {
    slug: 'apollo-12',
    file: 'apollo-12-1969-099C.json',
    shortName: 'Apollo 12 LM',
    body: 'Moon',
    recordIds: ['1969-099C'],
    media: {
      kind: 'image',
      src: '/images/apollo-12.jpg',
      alt: 'Alan Bean descends the ladder of the Apollo 12 Lunar Module Intrepid',
      credit: 'NASA (AS12-46-6726)',
    },
  },
  {
    slug: 'apollo-15',
    file: 'apollo-15-1971-063C.json',
    shortName: 'Apollo 15 LM',
    body: 'Moon',
    recordIds: ['1971-063C'],
    media: {
      kind: 'image',
      src: '/images/apollo-15.jpg',
      alt: 'Lunar Module Falcon at the Hadley-Apennine landing site',
      credit: 'NASA (AS15-86-11600)',
    },
  },
  {
    slug: 'surveyor-3',
    file: 'surveyor-3.json',
    shortName: 'Surveyor 3',
    body: 'Moon',
    recordIds: ['1967-035A'],
    media: {
      kind: 'image',
      src: '/images/surveyor-3.jpg',
      alt: 'Surveyor 3 on the Moon with the Apollo 12 Lunar Module in the background',
      credit: 'NASA (AS12-48-7134)',
    },
  },
  {
    slug: 'viking-1',
    file: 'viking-1.json',
    shortName: 'Viking 1',
    body: 'Mars',
    recordIds: ['1975-075C'],
    media: { kind: 'model', src: modelManifest['viking-1'].src, poster: '/images/posters/viking-1.webp', alt: '3D view of Viking 1', bytes: modelManifest['viking-1'].bytes, ground: 'mars', credit: null },
  },
  {
    slug: 'mars-pathfinder',
    file: 'mars-pathfinder.json',
    shortName: 'Mars Pathfinder',
    body: 'Mars',
    recordIds: ['1996-068A', 'MESURPR'],
    media: { kind: 'model', src: modelManifest['mars-pathfinder'].src, poster: '/images/posters/mars-pathfinder.webp', alt: '3D view of Mars Pathfinder', bytes: modelManifest['mars-pathfinder'].bytes, ground: 'mars', credit: null },
  },
  {
    slug: 'mars-exploration-rovers',
    file: 'mars-exploration-rovers-spirit-and-opportunity.json',
    shortName: 'Spirit & Opportunity',
    body: 'Mars',
    recordIds: ['2003-027A', '2003-032A'],
    media: { kind: 'model', src: modelManifest['mars-exploration-rovers'].src, poster: '/images/posters/mars-exploration-rovers.webp', alt: '3D view of Spirit & Opportunity', bytes: modelManifest['mars-exploration-rovers'].bytes, ground: 'mars', credit: null },
  },
  {
    slug: 'insight',
    file: 'insight.json',
    shortName: 'InSight',
    body: 'Mars',
    recordIds: ['2018-042A'],
    media: { kind: 'model', src: modelManifest.insight.src, poster: '/images/posters/insight.webp', alt: '3D view of InSight', bytes: modelManifest.insight.bytes, ground: 'mars', credit: null },
  },
  {
    slug: 'ingenuity',
    file: 'ingenuity-mars-helicopter.json',
    shortName: 'Ingenuity',
    body: 'Mars',
    recordIds: [],
    media: { kind: 'model', src: modelManifest.ingenuity.src, poster: '/images/posters/ingenuity.webp', alt: '3D view of Ingenuity', bytes: modelManifest.ingenuity.bytes, ground: 'mars', credit: null },
  },
  {
    slug: 'pioneer-10',
    file: 'pioneer-10.json',
    shortName: 'Pioneer 10',
    body: 'Deep space',
    recordIds: [],
    media: { kind: 'model', src: modelManifest['pioneer-10'].src, poster: '/images/posters/pioneer-10.webp', alt: '3D view of Pioneer 10', bytes: modelManifest['pioneer-10'].bytes, ground: null, credit: null },
  },
  {
    slug: 'near-shoemaker',
    file: 'near-shoemaker.json',
    shortName: 'NEAR Shoemaker',
    body: 'Asteroid Eros',
    recordIds: [],
    media: { kind: 'model', src: modelManifest['near-shoemaker'].src, poster: '/images/posters/near-shoemaker.webp', alt: '3D view of NEAR Shoemaker', bytes: modelManifest['near-shoemaker'].bytes, ground: null, credit: null },
  },
  {
    slug: 'dawn',
    file: 'dawn.json',
    shortName: 'Dawn',
    body: 'Vesta & Ceres',
    recordIds: [],
    media: {
      kind: 'image',
      src: '/images/dawn.jpg',
      alt: "Artist's concept of Dawn firing its ion engine above Ceres",
      credit: 'NASA/JPL-Caltech (PIA19598)',
    },
  },
  {
    slug: 'kepler',
    file: 'kepler.json',
    shortName: 'Kepler / K2',
    body: 'Heliocentric',
    recordIds: [],
    media: {
      kind: 'image',
      src: '/images/kepler.jpg',
      alt: "Artist's concept of the Kepler space telescope",
      credit: 'NASA/Ames/Wendy Stenzel/Daniel Rutter (ACD18-0204-002)',
    },
  },
  {
    slug: 'nssdca',
    file: 'nssdca-home.json',
    shortName: 'NSSDCA Archive',
    body: 'Earth · Goddard',
    recordIds: [],
    media: {
      kind: 'image',
      src: '/images/nssdca.jpg',
      alt: "Aerial view of NASA's Goddard Space Flight Center",
      credit: 'NASA Goddard/Bill Hrybyk',
    },
  },
];

export function getEntry(slug: string): MissionEntry | undefined {
  return CATALOG.find((e) => e.slug === slug);
}

export interface LoadedMission {
  entry: MissionEntry;
  page: NormalizedPage;
  records: MissionRecord[];
}

export function loadMission(slug: string): LoadedMission | undefined {
  const entry = getEntry(slug);
  if (!entry) return undefined;
  return {
    entry,
    page: normalizePage(readPageExport(entry.file)),
    records: readMissionRecords(entry.recordIds),
  };
}
