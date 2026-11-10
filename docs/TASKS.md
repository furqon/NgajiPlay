# ngajiPlay — Task Breakdown

Read with [REQ.md](REQ.md). Every phase ends with a **Done when** check; a phase is not complete until that check passes on the target browsers.

## Conventions

- Each task names the requirement it satisfies where one applies (`FR-` / `NFR-` in REQ.md).
- Anything touching audio or layout gets checked on Android Chrome and iOS Safari at the end of its phase. Note in the commit/task what could not be verified on a device.
- Project-level definition of done: typecheck, lint and build clean; size budgets (NFR-1, NFR-2) measured, not assumed; the full flow search → record → play → repeat works offline after first load.

## Phase 0 — Spikes and scaffolding

Retire the three unknowns that could invalidate later phases, then stand up an empty shell.

- [ ] **Spike A — recording capability. PARTIAL 2026-11-10:** desktop Chromium measured (codec matrix, bitrates, fMP4 and Opus-in-MP4 traps) and recorded in REQ §8.3. Probe harness written at `docs/spikes/recorder-probe.html`. Still outstanding: the same probe on Android Chrome and iOS Safari over HTTPS. (FR-2.4, NFR-5)
- [ ] Run `docs/spikes/recorder-probe.html` on both phones and paste the JSON into REQ §8.3, then confirm or correct the §4 audio rows.
- [x] **Spike B — Madani page mapping. DONE 2026-11-10.** Source chosen and validated: Tanzil text + `quran-data.xml`, 604/604 pages verified against an independent index, hashes pinned in REQ §8. Remaining work is only to re-run the check if the source or version ever changes. (FR-1.7)
- [x] **Spike C — Arabic text rendering. DONE 2026-11-10.** Real render of Madani pages at 390px in headless Edge; font chosen as **Amiri Quran (OFL 1.1)** after measuring KFGQPC Hafs too; subset to 37 KB with identical shaping; dense page ≈1.3 screens at 26px. Details in REQ §8.2. (NFR-1, NFR-6)
- [x] **Name and icons — DONE 2026-11-10.** Name confirmed as `ngajiPlay`; icon set generated from one vector mark (`npm run icons`): 192, 512, maskable 512 inside the Android safe zone, and a 180px Apple touch icon, all opaque on the theme green. Manifest is `public/manifest.webmanifest`, `display: standalone`.
- [x] **Stack and scaffold — DONE 2026-11-10.** Vite + TypeScript, no UI framework, to stay inside NFR-1. `src/` for app code, `public/` for the manifest and icons; `typecheck` (app and service worker compiled separately), `lint` (ESLint 10 flat config), `build` (includes the size check) and `verify` scripts in place. Service worker is hand-written (`src/sw.ts`, precache only), so offline behaviour stays explicit.
- [x] **Shell e2e — DONE 2026-11-10.** Playwright against the production preview build: secure context, document metadata, manifest validity, every icon's real PNG dimensions against its declared `sizes`, service worker control + precache contents, offline reload with the network switched off, and a 390px layout with no sideways scroll. 5/5 passing.
- [x] **Size measured — 27.0 KB gzipped** for the whole shell (budget 1.5 MB, NFR-1). `npm run build` fails the build if either budget is exceeded.
- [ ] **Static hosting and deploy.** `vercel.json` (build command, `outputDirectory`, no-cache headers for `sw.js` and the manifest, immutable hashed assets) and the README deploy steps are ready. The deploy itself needs a Vercel token or an authenticated `vercel login` on this machine, neither of which exists yet.

**Done when** Spike A has on-device numbers from both phones, the empty shell is deployed, and it is installable. Locally: installability and offline reload are verified against the preview build; HTTPS deploy and on-device install are the two remaining checks.

## Phase 1 — Data and storage foundation

- [ ] Vendor both Tanzil files per REQ §8.1: fetch at build time, verify the pinned SHA-256, keep the `quran-data.xml` and its copyright block in the repo. (FR-1.7)
- [ ] Vendor the Amiri Quran woff2 (OFL) plus its `OFL.txt`; subset to the 62 Quran codepoints at build time with `--layout-features=*` and assert shaping output is unchanged. (NFR-1, FR-7.5, REQ §8.2)
- [ ] Build step that emits Quran data: surah list, ayah text, page → slice mapping. Bundling the whole text (280 KB gz) is acceptable per NFR-1, so only split per juz if initial load actually exceeds budget. (FR-1.2, NFR-1)
- [ ] Basmala split helper: diacritic-insensitive prefix match for ayah 1 of surahs 2–114 except 9; no split for 1:1 or 27:30; render-time only, stored text untouched. (FR-1.4, REQ §8)
- [ ] Ship the Tanzil copyright block with the data and expose it to the About screen. (FR-7.5)
- [ ] Types and data-access module: page by number, slices on a page, ayahs for a page, surah lookup. (REQ §6)
- [ ] IndexedDB layer with `clips` and `settings` stores plus a migration hook. (FR-2.7, FR-5.4)
- [ ] Storage helpers: `navigator.storage.estimate()`, `persist()`, typed quota-exceeded error. (FR-2.8, FR-4.5, FR-4.6)
- [ ] Check: store and re-read a dummy Blob after reload; verify 5 spot-checked pages return the expected ayahs.

**Done when** a dummy clip round-trips through IndexedDB across a reload, quota is readable, and spot-checked pages return correct text.

## Phase 2 — Search and page view

- [ ] Page-number search with range validation. (FR-1.1)
- [ ] Surah search by number and by both names. (FR-1.2)
- [ ] Results list showing page number and the surahs on it. (FR-1.3)
- [ ] Page view: ayahs in order with a header at every surah boundary. (FR-1.4)
- [ ] Slice list per page with recorded / not-recorded state. (FR-1.5)
- [ ] Previous and next page navigation. (FR-1.6)
- [ ] No-result and invalid-input states. (NFR-8)

**Done when** p.1, p.2 (two surahs) and p.604 render correctly and the surah boundary is visibly marked.

## Phase 3 — Recording

- [ ] Recorder service: codec-exact preference (`mp4a.40.2` then `webm;codecs=opus`, never bare `audio/mp4`), request mono + 96 kbps, full MediaRecorder lifecycle. (FR-2.4, REQ §8.3)
- [ ] Extension mapping from the reported codec: `mp4a` → `.m4a`, Opus-in-MP4 → `.mp4`, WebM → `.webm`; unit-test the mapping. (FR-3.1)
- [ ] Record the real `track.getSettings()` channel count with each clip, so size estimates match reality. (FR-2.7)
- [ ] Microphone permission flow with denial recovery. (FR-2.1)
- [ ] Slice-bound record/stop with the slice's ayah text kept visible. (FR-2.2, FR-2.5)
- [ ] Discard/retake and preview before saving. (FR-2.3)
- [ ] Ten-minute cap with a warning before it. (FR-2.6)
- [ ] Save to IndexedDB with metadata and the generated name. (FR-2.7, FR-3.1)
- [ ] Pre-save quota check and refusal path. (FR-2.8)
- [ ] Replace confirmation when the slice already has a clip. (FR-2.9)
- [ ] Clear message when no supported codec exists. (NFR-8)

**Done when** a 30-second clip records, saves, survives a reload and plays back on both target browsers, and the stored file extension matches the recorded codec.

## Phase 4 — Library management

- [ ] Library list in playlist order with duration, page, surah and date. (FR-4.1)
- [ ] Rename display name. (FR-4.2)
- [ ] Delete with confirmation. (FR-4.3)
- [ ] Export a single clip and export all clips. (FR-4.4, FR-3.3)
- [ ] Storage used / available quota display. (FR-4.5)

**Done when** an exported MP4 clip (fMP4) plays in the phone's own media player, an exported WebM clip plays in a browser, and a deleted clip is gone after a reload.

## Phase 5 — Playback and repeat

- [ ] Single audio element and play queue: play, pause, next, previous. (FR-5.1, FR-5.5)
- [ ] Repeat off / one / all / N, with N presets 2, 3, 5, 10. (FR-5.2)
- [ ] Now-playing bar with clip, page, surah, elapsed and remaining. (FR-5.3)
- [ ] Persist and resume the last clip and position. (FR-5.4)
- [ ] Media Session metadata, best-effort. (FR-5.6)

**Done when** each repeat mode behaves correctly across a three-clip playlist, audio keeps playing while navigating, and resume works after a reload.

## Phase 6 — Quran page during playback

- [ ] Playback view loads the playing clip's page automatically. (FR-6.1)
- [ ] Page stays scrollable and never interrupts audio. (FR-6.2)
- [ ] Highlight the playing clip's ayah range. (FR-6.3)
- [ ] Follow track changes, plus a "back to playing page" control. (FR-6.4)

**Done when** the highlight matches the clip on a two-surah page, the page follows next/previous, and scrolling during playback does not pause audio.

## Phase 7 — UI polish, i18n, states

- [ ] String dictionary for ID/EN, switcher persisted locally. (FR-7.3)
- [ ] About screen with Tanzil attribution, link to tanzil.net and the copyright block; plus the Amiri Quran OFL notice. (FR-7.5)
- [ ] Clean layout: large targets, one primary action per screen, readable Arabic. (NFR-6)
- [ ] Loading, empty, error, permission-denied and quota-exceeded states. (NFR-8)
- [ ] Safe-area insets; portrait phone and desktop layouts. (FR-7.4)
- [ ] Measure initial load and install size against the budgets. (NFR-1, NFR-2)

**Done when** no hardcoded UI strings remain, both languages render without truncation, and measured sizes are within budget.

## Phase 8 — PWA, offline, release

- [ ] Manifest, icons, standalone display and theme colour. (FR-7.1)
- [ ] Service worker: precache shell and font, cache Quran chunks on use, versioned updates. (FR-7.2)
- [ ] Android install prompt; iOS add-to-home-screen guidance. (FR-7.1)
- [ ] Offline relaunch for a previously visited page. (FR-7.2)
- [ ] Final size check and production deploy. (NFR-2)

**Done when** the app installs on Android and iPhone, relaunches offline with a previously used page readable, and clips play back while offline.

## Risks

| Risk | Mitigation |
|---|---|
| Android saves `.webm`, iPhone saves `.m4a` | Accepted (REQ §4). Do not add a transcoder; the extension is derived from the real codec. |
| Safari evicts site storage | Request `persist()`, show storage usage, encourage export (FR-4.4). Not fully preventable in a browser-only app. |
| Madani mapping off by a page | Verified 604/604 (REQ §8); re-run the comparison if the data version changes. |
| Basmala rendered twice on surah starts | Diacritic-insensitive split, plus a check that no page shows two basmalas — surahs 95 and 97 are the ones that break a naive match. |
| Bare `audio/mp4` yields Opus-in-MP4 | Always request `mp4a.40.2` explicitly; assert the reported mime in a unit test. |
| Exported fMP4 does not play in a phone gallery | Phase 4 done-when covers it; fall back to WebM on Android rather than adding a remuxer. |
| Arabic font renders or spaces incorrectly | Spike C: Amiri Quran verified with HarfBuzz + a real render; ship it locally, never from a CDN, and re-check after any subset step. |
| Shipping a font whose licence forbids modification | KFGQPC Hafs is excluded for exactly this reason (REQ §8.2). Only OFL fonts get subset; include the licence file. |
| Unbounded storage growth | Quota check before save, storage display, 10-minute cap. |
| Parent assumes recordings are backed up | Say plainly in the UI that clips live on this device only and export is the backup. |
