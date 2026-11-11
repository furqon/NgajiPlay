# ngajiPlay

A small offline-first PWA: a parent records a child reciting a surah portion of a
Madani page, and the child replays it while looking at that same page.

Spec: [docs/REQ.md](docs/REQ.md) · Plan: [docs/TASKS.md](docs/TASKS.md)

## Status

Phases 0–8 are implemented: the installable shell, the Madani data layer, search
+ page view, recording per surah slice, the library (rename, delete, export,
storage), playback with repeat off/one/all/2/3/5/10 and resume, a page that
follows the recording with the playing ayahs highlighted, an ID/EN switch, a
browsable surah index, a how-it-works modal, an About screen carrying the Tanzil
and OFL notices, a service worker that precaches the shell, caches the Quran text
on use and waits for the listener before updating, an Android install prompt, iOS
add-to-home-screen guidance, and offline relaunch of a visited page. An Android
APK built with Capacitor lives in `android/` (see below). The HTTPS deploy and
the on-device checks are the only outstanding items.

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
npm run icons:android  # regenerate the Android launcher icons and splashes
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

## Android APK

The `android/` project is a Capacitor shell around the same `dist/` build: no
server URL, no plugins, so the APK is the web app with its assets bundled and
works offline exactly like the installed PWA. It needs JDK 21 and an Android SDK
(compile/target SDK 35); Gradle 8.11.1 and the SDK are not committed.

```bash
npm run build                 # regenerate quran.json and dist/
npx cap sync android          # copy dist into the Android project
cd android
JAVA_HOME=/path/to/jdk-21 ANDROID_HOME=/path/to/android-sdk \
  ./gradlew assembleRelease   # or assembleDebug
```

`android/local.properties` points Gradle at the SDK on this machine and is
gitignored. A signed release needs `android/keystore.properties` (also
gitignored; `storeFile`, `storePassword`, `keyAlias`, `keyPassword`); without it
the module still builds a debug APK. Built files from the last local run:
`release/ngajiPlay-1.0.0.apk` (release, signature verified) and
`release/ngajiPlay-1.0.0-debug.apk`.

## Deploy

Static hosting over HTTPS, no backend. Two paths are wired up.

### GitHub Pages (the repo is public)

Live at **https://furqon.github.io/NgajiPlay/**. `.github/workflows/pages.yml` builds
on every push to `main` and publishes `dist/`; Pages is enabled with
**Settings → Pages → Source: GitHub Actions**.

Do not add the **Static HTML** starter workflow that the Pages settings page
suggests — it publishes the repository root, which serves the raw `index.html`
(white screen) and competes with this workflow for the same deployment.

A project site lives under `/<repo>/`, so the workflow builds with
`BASE_PATH=/NgajiPlay/`. Everything that used to assume the site root now follows
that base: the manifest's `start_url`/`scope`/icon paths are relative, the page
links and font use `%BASE_URL%`/relative URLs, the Quran fetch and service-worker
registration use `import.meta.env.BASE_URL`, and the worker derives its precache
prefix and navigation handler from its own scope.

```bash
BASE_PATH=/NgajiPlay/ npm run build   # same build the workflow publishes
```

On Windows Git Bash, prefix it with `MSYS2_ENV_CONV_EXCL=BASE_PATH`, otherwise the
shell rewrites `/NgajiPlay/` into a Windows path.

Pages has no custom headers: it sends `Cache-Control: max-age=600`, so a new build
can wait up to ten minutes before the update prompt appears. It still cannot swap
under a running recording — the update flow is unaffected, only slower.

A custom domain (or a repo named `<user>.github.io`) serves from the root; build
with no `BASE_PATH` and add the `CNAME` in the Pages settings. `vercel.json` is
still there for Vercel, which supports root hosting and the no-cache headers the
worker prefers:

```bash
npx vercel link
npx vercel deploy --prod
```
