# ngajiPlay

A small offline-first PWA: a parent records a child reciting a surah portion of a
Madani page, and the child replays it while looking at that same page.

Spec: [docs/REQ.md](docs/REQ.md) · Plan: [docs/TASKS.md](docs/TASKS.md)

## Status

Phase 0 — the installable, offline-capable shell is in place. No product screens yet.

## Commands

```bash
npm install
npm run dev        # local dev server
npm run build      # production build + size budget check (REQ §7)
npm run preview    # serve the built shell
npm run typecheck  # tsc, app and service worker separately
npm run lint
npm run test:e2e   # builds, then runs Playwright against the preview server
npm run icons      # regenerate public/icons from the vector mark
```

`npm run test:e2e` uses the installed Edge by default (`PW_CHANNEL=chromium` after
`npx playwright install chromium` elsewhere).

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
