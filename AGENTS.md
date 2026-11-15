# Repository Guidelines

## Project Structure

This repository combines a Next.js mission experience with a Rust NASA NSSDCA scraper. Routes and global styles live in `app/`; reusable React components and CSS modules are in `components/`; content, catalog, and story logic are in `lib/`. The scraper is in `src/`, with Rust integration tests in `tests/`. Source models and captured mission JSON live in `assets/`; web-served data, images, and models live in `public/`. Maintenance scripts are in `scripts/`.

## Development and Verification

- `npm install` installs JavaScript dependencies; `npm run dev` starts the local Next.js server.
- `npm run build` creates a production build; `npm start` serves it.
- `npm test` runs Node's tests in `lib/*.test.ts`; `cargo test` runs the Rust test suite.
- `npm run test:e2e` invokes Playwright; add Playwright configuration and specs when introducing browser tests.
- `npm run scrape:missions` runs the release scraper and writes `public/data/missions.json`. `npm run optimize:models` and `npm run capture:posters` maintain media assets.

## Style and Testing

Follow the surrounding code: TypeScript and TSX use two-space indentation, single quotes, and semicolons. Name React components in PascalCase, helpers in camelCase, and component styles `ComponentName.module.css`. Use descriptive Rust module and function names in snake_case and run `cargo fmt` on Rust changes. No dedicated JavaScript lint or formatting script is configured.

Place TypeScript unit tests beside their subject as `*.test.ts`; place Rust integration tests in `tests/`. Add focused tests for changed behavior and run the relevant suites and production build before submitting. No coverage threshold is configured.

## Commits and Pull Requests

Recent commits use short, imperative descriptions, such as `Add scraper, viewer, mission data and scraped NASA page JSON`. Keep each commit focused. Pull requests should explain the change and validation performed, link related issues when available, and include screenshots or recordings for visual changes.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
