# NASA Mission Gallery — NASA Space Apps Challenge

**Live demo:** https://nasa-space-challenge-alpha.vercel.app

**Team CaribeShip** · Challenge: [Abandoned but not Forgotten: Storytelling about NASA's Discarded Equipment on the Moon and Mars](https://www.spaceappschallenge.org/2026/challenges/nasas-discarded-equipment-storytelling/)

## Demo video

[![Abandoned but not Forgotten, project demo on YouTube](https://img.youtube.com/vi/pr9UK7pEAp4/maxresdefault.jpg)](https://youtu.be/pr9UK7pEAp4)

Watch on YouTube: https://youtu.be/pr9UK7pEAp4

## Overview

An interactive expedition through NASA's Moon and Mars surface missions. Each mission has a guided chapter, a 3D model to inspect, a decision-based "mission control" quiz, and a full reference page built from NASA's own archive text.

## Summary

NASA's mission archives hold decades of rich material, but it is scattered across dense, text-heavy pages. This project collects that material into one place and presents it as a story: visitors scroll through the expedition, inspect real spacecraft models, follow a guided tour of each vehicle, test their understanding, and then open a full reference page for any mission.

## What it does

- **Expedition homepage:** chapters, journey timelines and lesson panels for each mission.
- **3D inspection:** lazy-loaded spacecraft models with labels, lighting modes, standard views, zoom and a guided tour.
- **Mission control quiz:** a decisions-and-scoring game at the end of each section.
- **Full mission pages** (`/mission/[slug]`): all source text preserved and laid out as a readable article, with a fixed section index on the left, key facts, tables, and optional technical records and source links.
- **Accessibility:** reduced-motion support, keyboard-operable controls, native disclosures, and pages that stay readable without JavaScript.

## Data and sources

- Mission pages and metadata come from the **NASA NSSDCA** (National Space Science Data Coordinated Archive), collected with the Rust scraper in `src/` (`npm run scrape:missions`).
- Captured page JSON is in `assets/`; the web-served dataset is `public/data/missions.json`.
- Each mission page links back to its original NASA source URL and shows the fetch date.
- 3D models and images are credited on the mission pages where they appear. Check each asset's license before reusing it.

## Tech stack

Next.js 16 (App Router), React 19, TypeScript, Three.js with `three-mesh-bvh`, GSAP and Lenis for motion, a Rust scraper (`reqwest`, `select`), Playwright for end-to-end tests, deployed on Vercel.

## Run locally

```sh
npm install
npm run dev          # http://localhost:3000
npm run build && npm start
```

## Tests

```sh
npm test             # Node unit tests in lib/*.test.ts
cargo test           # Rust scraper tests
npm run test:e2e     # Playwright (builds and serves on :3100 first)
```

Maintenance scripts: `npm run scrape:missions`, `npm run optimize:models`, `npm run capture:posters`.

## Project structure

| Path | Contents |
| --- | --- |
| `app/` | Routes and global styles |
| `components/` | React components and CSS modules |
| `lib/` | Catalog, content normalization, lessons and story logic |
| `src/`, `tests/` | Rust NSSDCA scraper and its tests |
| `assets/`, `public/` | Source models and captured data; web-served data, images, models |
| `e2e/` | Playwright specs |

## Use of AI

AI coding assistants were used during development, for example for code generation, refactoring and layout work. All output was reviewed and tested by the team. Mission text comes from NASA's archive and is not AI-generated.

## Team

Team CaribeShip: Estiven Mejia Gueto and David Mejia Rebolledo, for the NASA Space Apps Challenge.

## Acknowledgements

Mission information courtesy of NASA and the NSSDCA. This project is not affiliated with or endorsed by NASA.
