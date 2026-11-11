# ngajiPlay

A small offline-first PWA: a parent records a child reciting a surah portion of a
Madani page, and the child replays it while looking at that same page.

Spec: [docs/REQ.md](docs/REQ.md) · Plan: [docs/TASKS.md](docs/TASKS.md)

## Status

Phase 7 — the installable shell, the Madani data layer, search + page view,
recording per surah slice, the library (rename, delete, export, storage),
playback with repeat off/one/all/2/3/5/10 and resume, a page that follows the
recording with the playing ayahs highlighted, and an ID/EN switch plus an
About screen carrying the Tanzil and OFL notices. Offline/install/release
hardening is next (Phase 8).

## Commands

```bash
npm install
npm run dev        # local dev server
npm run build      # production build + size budget check (REQ §7)
npm run preview    # serve the built shell
npm run typecheck  # tsc, app and service worker separately
npm run lint
npm run test:unit  # Vitest: Quran data, basmala split, IndexedDB, quota, search, naming
npm run test:e2e   # Playwright: shell, data, pages, recording, library, playback, follow, i18n
LONG_RECORDING=1 npx playwright test -g "thirty-second"   # the real 30 s capture
npm run verify     # typecheck + lint + unit + e2e
npm run icons      # regenerate public/icons from the vector mark
```

`npm run test:e2e` uses the installed Edge by default (`PW_CHANNEL=chromium` after
`npx playwright install chromium` elsewhere).

## Data

`public/quran.json` is generated, not committed: `npm run build` and `npm run dev`
regenerate it from the pinned files in `assets/quran/`, verifying both SHA-256 pins
first. Page slices, surah text and the Tanzil copyright block all come from there.

```bash
node scripts/build-quran-data.mjs                                  # data only
.venv/Scripts/python.exe scripts/subset-font.py                    # font subset (needs fonttools + brotli + uharfbuzz)
```

The font subset is committed because it needs Python; the data file is not because
it is a pure function of the pinned sources.

## Stack

Vite + TypeScript with no UI framework, to stay inside the 1.5 MB gzipped budget.
The service worker is hand-written (`src/sw.ts`) and only receives Vite's precache
manifest, so offline behaviour is explicit.

## Deploy

Static hosting over HTTPS, no backend. `vercel.json` sets the build command and the
`Cache-Control` headers the service worker needs in order to update.

```bash
npx vercel link
npx vercel deploy --prod
```

Serving from a subpath instead of a domain root requires changing `base` in
`vite.config.ts`, `start_url`/`scope` in `public/manifest.webmanifest`, and the
service worker scope in `src/main.ts`.
