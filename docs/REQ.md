# ngajiPlay — Requirements

Status: agreed spec for v1 · Updated: 2026-11-10 · Task breakdown: [TASKS.md](TASKS.md)

## 1. Purpose

A small, offline-first web app where a parent records a child reciting from a page of the Quran, and the child later listens back to **their own recitation** while looking at the same page. Recording is split per surah, so each file is one surah's portion of that page.

## 2. Users

| Role | Does |
|---|---|
| **Recorder** (parent / older kid) | Finds a page, picks the surah portion, records, reviews, saves; renames or exports later. |
| **Listener** (young kid) | Opens the playlist, plays and repeats, follows along on the page. |

One shared device, one shared library. No accounts, no profiles.

## 3. Scope

**In v1:** Madani page search and text view · per-page/per-surah recording · library with rename, delete, export · ordered playlist playback · repeat off/one/all/N · Quran page shown and highlighted during playback · Indonesian + English · installable PWA · works offline for used pages.

**Out of v1 (do not build):** accounts, cloud storage, device sync, sharing to other apps, automatic backup/restore/import, tajweed colouring, playback speed control, manual playlist reordering, splitting one continuous recording into several files, pixel-faithful page facsimile images, non-Madani page numbering, Quran translations.

## 4. Locked decisions

These are settled. Changing one invalidates downstream tasks — re-open it deliberately, not by accident.

| Area | Decision | Consequence / tradeoff |
|---|---|---|
| **Audio format** | Codec-exact preference: `audio/mp4;codecs=mp4a.40.2` (AAC) first, then `audio/webm;codecs=opus`. **Never request bare `audio/mp4`.** No transcoding. | `.m4a` only for AAC; Opus-in-MP4 and WebM keep their real extension. **Relaxes the original "m4a file" requirement**: transcoding adds ~25 MB of wasm and re-encodes (quality loss). Chromium's MP4 output is fragmented — see §8.3, and on-device browser support is still unverified. |
| **Audio quality** | Request mono, 96 kbps, no echo cancellation / noise suppression / AGC. Accept what the device actually returns; never fail a save over it. | Mono is a request, not a guarantee: desktop Chromium returned stereo, roughly doubling size. 96k AAC measured 103 kbps ≈ 0.77 MB/min; browser default measured 135 kbps ≈ 1.01 MB/min. |
| **Recording unit** | Exactly one clip per **page + surah slice**. A surah spanning 5 pages becomes 5 clips. | Simplest model; matching clips to a page is direct. |
| **One clip per slice** | Re-recording a slice replaces the existing clip after confirmation. | No version history. Keeps library and playlist unambiguous. |
| **Library** | One shared library, no profiles. | All clips in one list, identified by page/surah only. |
| **Mushaf** | Madani, **604 pages**. | Page numbers and surah boundaries follow the Madani edition only. |
| **Quran display** | Text rendered with **Amiri Quran** (OFL 1.1), self-hosted woff2, subset to the codepoints the text uses plus the precomposed forms HarfBuzz substitutes (163 codepoints, 52 KB). Shows the ayahs of the page. | Not a pixel-faithful page image. Chosen in Spike C: renders Tanzil's Uthmani text correctly, its licence permits bundling *and* subsetting, and it is half the size of KFGQPC Hafs. KFGQPC Hafs renders fine but its licence forbids modification (so no subsetting) and HarfBuzz removed it over licensing. See §8.2. |
| **Quran text + page mapping** | Tanzil Quran Text (Uthmani, v1.1) for the Arabic text plus Tanzil `quran-data.xml` for the Madani 604-page boundaries. Fetched once at build time, vendored, and pinned by SHA-256. | Licence: CC BY 3.0 — verbatim only (no character changes), the Tanzil Project must be credited with a link to tanzil.net, and the copyright block must ship with the data. Validated 604/604 pages against an independent Madani index; see §8. |
| **Storage** | IndexedDB blobs on-device plus `navigator.storage.persist()`. | No restore after the user clears site data. Export is the manual backup path. |
| **Repeat modes** | Off · repeat one · repeat all · repeat N times (presets 2, 3, 5, 10). | Covers memorisation practice. |
| **Playlist order** | Fixed: page ascending, then surah ascending, then ayah start ascending. | Deterministic; no drag-to-reorder in v1. |
| **Languages** | Indonesian (default) and English, switcher persisted on device. | All user-facing strings come from one dictionary. |
| **Name** | `ngajiPlay` | Used for manifest, icons and download filenames. |
| **Hosting** | Static files over HTTPS, no backend. | Any static host works; the specific host is not an architectural choice. |

## 5. Functional requirements

### 5.1 Search and page view

- **FR-1.1** Search by page number, 1–604; out-of-range input is rejected with a message, not a crash.
- **FR-1.2** Search by surah (number, Indonesian name, English name).
- **FR-1.3** Results show the page number plus the surah(s) present on that page.
- **FR-1.4** Page view shows every ayah on the page in order, with a visible header wherever a new surah begins.
- **FR-1.5** Page view lists the surah slices on that page and marks which ones already have a clip.
- **FR-1.6** Previous/next page navigation from the page view.
- **FR-1.7** The ayah range attributed to each page matches the printed Madani mushaf (verified in TASKS Phase 0).

### 5.2 Recording

- **FR-2.1** Microphone permission is requested on first record; denial shows a clear recovery message and retry.
- **FR-2.2** Recording starts from a chosen surah slice, so the clip is bound to that slice before any audio is captured.
- **FR-2.3** Controls: record, stop, discard and retake, preview before saving.
- **FR-2.4** The recorder picks the first supported `mimeType` from the preference list; if none is supported it says so plainly instead of saving a broken file.
- **FR-2.5** The selected slice's ayah text stays visible while recording.
- **FR-2.6** A single recording is capped at 10 minutes, with a warning before the cap.
- **FR-2.7** Saving persists the blob and its metadata to IndexedDB, indexed by page + surah.
- **FR-2.8** Available storage is checked before saving; when insufficient, the save is refused with a clear message and an offer to export existing clips.
- **FR-2.9** Saving over an existing slice asks for confirmation, then replaces it.

### 5.3 Clip naming

- **FR-3.1** Default name: `p042-s001-al-fatihah-a001-007.<ext>` (3-digit page and surah, ayah range, real extension).
- **FR-3.2** The display name is editable; the deterministic page/surah identifiers stay visible in the library.
- **FR-3.3** Exported filenames use the sanitised display name plus page and surah for uniqueness, with the extension matching the actual codec.

### 5.4 Library

- **FR-4.1** Library lists all clips in playlist order with duration, page, surah and created date.
- **FR-4.2** Rename a clip's display name.
- **FR-4.3** Delete a clip, after confirmation.
- **FR-4.4** Export a single clip, and export all clips as one file per clip.
- **FR-4.5** Show storage used and available quota.
- **FR-4.6** Clips survive app restart, and persistent storage is requested once so the browser is less likely to evict them.

### 5.5 Playback and repeat

- **FR-5.1** Play/pause any clip, plus next and previous.
- **FR-5.2** Repeat mode off / one / all / N applies continuously while browsing.
- **FR-5.3** Now-playing shows current clip, page, surah, elapsed and remaining time.
- **FR-5.4** Last clip and position are remembered and resumed on reopen.
- **FR-5.5** One audio element for the whole app: audio keeps playing while the user navigates.
- **FR-5.6** Lock-screen / notification metadata via Media Session where supported (best-effort, not required).

### 5.6 Quran page during playback

- **FR-6.1** Playing a clip shows the page for that clip.
- **FR-6.2** The page is freely scrollable during playback and scrolling never pauses audio.
- **FR-6.3** The playing clip's ayah range is highlighted.
- **FR-6.4** The view follows track changes; if the user has scrolled away, a "back to playing page" control returns them.

### 5.7 Install, offline, language

- **FR-7.1** Installable PWA (manifest, icons, standalone display); Android gets the install prompt, iOS gets add-to-home-screen guidance.
- **FR-7.2** App shell, font and Quran data for previously used pages load without a network; clips are local by definition.
- **FR-7.3** Language switcher (ID/EN), Indonesian by default, persisted locally, all strings externalised.
- **FR-7.4** Respects safe areas/notches; usable portrait on a phone and on desktop.
- **FR-7.5** An About screen credits "Tanzil Project" with a link to tanzil.net (verbatim copyright block available, and intact inside the bundled data file), and includes the Amiri Quran OFL licence notice. (Licence obligations, not optional polish.)

## 6. Data model

```
Surah   { number, nameId, nameEn, nameArabic, ayahCount }
Ayah    { surah, number, text }
Page    { number, slices: [{ surah, ayahStart, ayahEnd }] }   // 1..604
Clip    { id, page, surah, ayahStart, ayahEnd, mimeType, bytes,
          durationMs, createdAt, displayName }
Settings{ language, repeatMode, repeatCount, lastClipId, lastPositionMs }
```

The playlist is derived, never stored: clips sorted by page, surah, ayah start.

## 7. Non-functional requirements

- **NFR-1** Initial load ≤ 1.5 MB gzipped including the Quran font. Measured after Phase 1: 277 KB gzipped text + 52 KB subset font ≈ 330 KB, and the whole built shell comes to **358 KB gzipped**, about 23% of the budget. Bundling everything fits, so per-juz lazy loading is optional, not required.
- **NFR-2** Install size ≤ 5 MB excluding recordings.
- **NFR-3** No network needed after first load for pages already visited.
- **NFR-4** Recordings never leave the device except when the user exports them.
- **NFR-5** Supported: Android Chrome ≥ 110, iOS Safari ≥ 16.4 (installed and in-tab), desktop Chrome.
- **NFR-6** Minimum 44px touch targets, one clear action per screen, Arabic text legible without pinch-zoom.
- **NFR-7** No backend, no accounts, no telemetry; deployable as static files.
- **NFR-8** Empty, loading, permission-denied, quota-exceeded and unsupported-codec states all have designed UI.

## 8. Validation records (Q1 and Spike C, 2026-11-10)

### 8.1 Quran source (Q1)

**Chosen source.** Tanzil Quran Text (Uthmani) for the Arabic, `quran-data.xml` for the Madani page boundaries. Both CC BY 3.0. No runtime API, so the app stays offline-first and needs no keys.

**Pinned downloads** (fetch at build time, commit the files, verify the hashes):

| File | URL | Bytes | SHA-256 |
|---|---|---|---|
| Text | `https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=txt&marks=true&sajdah=true&alef=true&tatweel=true&agree=true` | 1,359,946 | `829083f684ecb5c71853029ca1970946a12c2dc90528d6e0e3cd6dbc41204b7c` |
| Metadata | `https://tanzil.net/res/text/metadata/quran-data.xml` | 77,234 | `8867c1d88191472adec9db694b3cd9f135b1a2ef580574d32cf888dcb22c5c7a` |

These bytes are pinned in `assets/quran/SOURCES.json`; `scripts/build-quran-data.mjs` re-verifies both hashes on every build and refuses to emit data when either changes.

**Re-pin note (Phase 1, 2026-11-10).** The text was originally pinned as `outType=txt-2`, 1,370,878 B, `bf4f57b…`. That file can no longer be produced: the download endpoint parses parameter *presence* rather than values, and the combinations tried (marks, sajdah, rub, alef, tatweel, laa, stanween, txt vs txt-2, GET vs POST) returned a different byte count every time. The row above is the download form's default state and is the file the app now ships. The metadata file still matches its original pin **byte-for-byte**, and page boundaries come only from that metadata, so the 604/604 page validation below is unaffected. Changing the text again is a deliberate re-pin, not a fetch.

**What was verified**

- **Structure:** 114 surahs, 6,236 ayahs, 604 pages. Per-surah ayah counts in the text match the metadata for all 114 surahs.
- **Page mapping, full check:** all 604 pages were compared against Living NOOR's independent "Standard Madani Mushaf" index. **604/604 match on both the first and last verse of the page.**
- **Surah starts:** agree with Quran.com chapter metadata (Al-Buruj → p590, At-Tariq → p591, Al-Fajr → p593).
- **Text:** 1:1, 2:255, 18:10, 27:30 and 114:6 were compared with an independent text source — identical consonantal skeleton.
- **Known bad source:** Quran.com's legacy `/verses/by_page` endpoint reports different verse counts for 7 pages in juz 30 (e.g. p590 returns 23 verses and includes 86:1). It disagrees with the printed mushaf *and* with Quran.com's own chapter page data. Do not use it as the page source.

**Basmala trap (must be handled in Phase 1).** Tanzil prefixes the basmala to ayah 1 of **112** surahs (2–114 except 9), so ayah 1 renders doubled if the prefix is not separated.

- Surahs **95 and 97** encode the prefix with an extra shadda (`بِّسْمِ`), so an exact string match catches only 110 of them — match diacritic-insensitively.
- **1:1 is itself the basmala**; do not draw a duplicate header for Al-Fatihah.
- **27:30** contains the basmala *inside* the verse (Solomon's letter) and is not ayah 1, so never split it.
- Separate the prefix at render time only; the stored text stays verbatim, which the licence requires.

**Size.** 1.39 MB raw, 277 KB gzipped for the whole Quran — comfortably inside NFR-1.

### 8.2 Font (Spike C)

**Chosen font: Amiri Quran (OFL 1.1).** Self-hosted, subset to the Quran's codepoints, licence shipped alongside it.

**Candidates measured** (RTL, 390px viewport, 26px text):

| | KFGQPC Uthmanic Hafs Ver18 | Amiri Quran v19 |
|---|---|---|
| File size (woff2) | 87,760 B | 45,680 B |
| Subset to 62 Quran codepoints | **not allowed** by licence | **36,876 B**, verified identical shaping |
| Shipped subset (Phase 1) | — | **52,316 B**, 163 codepoints, shaping identical on all 6,236 ayahs |
| Coverage of Quran text (62 codepoints) | 62/62 | 62/62 |
| Coverage of Arabic surah names (36 codepoints) | all | all |
| Digits (U+0660–0669), U+06DD ayah mark, Arabic comma | present | present |
| Mark positioning | GPOS MarkBase anchors verified (marks carry y-offsets ≈ +1950/2048 em) | GPOS MarkBase anchors verified |
| Licence | Freeware/proprietary per ScanCode; grants use/copy/distribute but **forbids modification**, which rules out subsetting | OFL 1.1 — bundling and subsetting allowed; licence text must ship |

Both fonts rendered the Tanzil text legibly in a real headless-Edge render; nothing in either font is broken. The decision came down to licence and bytes, not shape quality.

**Page height on a phone** (390px wide, 26px text, line-height 2.0, viewport 752px):

| Page | Ayat | Rendered height | Screens |
|---|---|---|---|
| p2 | 5 | 326px | 0.43 |
| p42 | 4 | 1002px | 1.33 |
| p100 | 6 | 1054px | 1.40 |
| p300 | 8 | 1002px | 1.33 |
| p604 | 15 | 482px | 0.64 |

Heights are for Amiri Quran; KFGQPC Hafs was identical on every page except p2 (378px, 0.50 screens). A dense page needs about 1.3–1.4 screens of scrolling at 26px — readable without pinch-zoom, no need to shrink the Arabic. Below ~22px the text gets tight for a child.

**Rendered check with the shipped subset (Phase 1, 2026-11-10).** Real pages 2, 42, 100 and 604 were painted at 390px wide, 3× DPR, in Edge, using the committed `amiri-quran-subset.woff2`, with ayah medallions (`۝` + Arabic-Indic digits) and surah header bands.

| Setting | p2 | p42 | p100 | p604 | Verdict |
|---|---|---|---|---|---|
| 26px, line-height 2.0 | 0.60 screens | 1.46 | 1.46 | 1.14 | **chosen** |
| 26px, line-height 1.7 | — | — | 1.25 | — | rejected |
| 22px, line-height 2.0 | — | — | 1.03 | — | legible, smaller than needed |

- **Line-height 2.0 is required, not decorative.** At 1.7 the maddah and the small high marks sit hard against the descenders of the line above; at 2.0 every mark has clear air. Line boxes measured exactly 52px apart at 26px and 44px at 22px — no rounding drift, no collapsed lines.
- **Mark placement is correct**: harakat, shadda, sukun, maddah and the small high signs attach to the right letters, above and below, with no clipping and no drift to the wrong base.
- **No missing glyphs**: every codepoint on those pages renders from the subset (the only glyphs whose advance matched the `.notdef` box were whitespace), and there is no horizontal overflow at 390px.
- **Ayah medallions work**: `۝` encloses the Arabic-Indic ayah number cleanly, so no separate ornament asset is needed.
- **Justification is safe**: `text-align: justify` with `direction: rtl` produced no torn words or oversized gaps on these pages.
- **26px is the floor for a child**, not 22px. 22px stays legible but the marks become cramped.
- Still unverified on a physical phone; this is a desktop renderer at phone width with the phone's DPR.

**Phase 1 subset is 52,316 B, larger than the 36,876 B measured above.** The extra weight buys correctness: the font keeps precomposed forms the text never contains (U+0622 and friends) because HarfBuzz substitutes them in — `ا` + `ٓ` shapes as one glyph from U+0622, and without that codepoint the subset drops the ligature and renders a detached mark. Digits and the ayah brackets ride along. Verification now compares HarfBuzz positions for **every one of the 6,236 ayahs** (full TTF vs the decompressed subset), not a sample.

**Budget:** 52.3 KB font + 277 KB gzipped text ≈ 330 KB of the 1.5 MB initial-load budget (22%). Note woff2 is already compressed, so gzipping it gains nothing.

**Constraints this creates**

- Do not run ffmpeg.wasm on audio or any other heavy dependency; the budget is mostly free but the point is to keep it that way.
- Serve the font from the app's own origin, never a CDN — offline requirement (NFR-3) and font `unicode-range` tricks are unnecessary.
- Ship the OFL licence text with the font; the About screen also credits it (FR-7.5).
- Subsetting must keep all layout features (`--layout-features=*`); the verified subset preserved GSUB/GPOS, and shaping output matched the full font exactly (only glyph IDs renumber).
- Not yet verified: rendering on a physical Android/iOS device; headless Edge on Windows was the only renderer available, so a one-page eyeball check on the phone is still worth doing in Phase 2.

### 8.3 Recorder (Spike A, partial)

**Status: desktop Chromium measured, phones still unverified.** The two numbers in §4 are provisional until `docs/spikes/recorder-probe.html` is run on Android Chrome and iOS Safari.

**Method.** The probe was driven in headless Edge 157 over the DevTools protocol with a fake capture device: real `getUserMedia` → `MediaRecorder` → `decodeAudioData`, so codec negotiation, container and bitrate are genuine; the audio content is synthetic.

**Support matrix (Chromium 157, Windows):**

| Type | `isTypeSupported` |
|---|---|
| `audio/mp4;codecs=mp4a.40.2` | true |
| `audio/mp4` | true — but see trap 1 |
| `audio/webm;codecs=opus` | true |
| `audio/webm` | true |
| `audio/ogg;codecs=opus` | false |
| `audio/mpeg` | false |

**Measured** (4.946 s captures, 44.1 kHz):

| Request | Reported | Bytes | Measured | Per minute |
|---|---|---|---|---|
| 96,000 bps | 96,000 | 63,721 | 103 kbps | ≈0.77 MB |
| browser default | 128,000 | 83,504 | 135 kbps | ≈1.01 MB |

**Traps, all confirmed by inspection:**

1. **Bare `audio/mp4` is not AAC.** Chromium answered it with `audio/mp4;codecs=opus` — Opus muxed into MP4. Naming that `.m4a` would mislead players. Always request `mp4a.40.2` explicitly and derive the extension from the reported codec.
2. **Chromium's MP4 output is fragmented** (`mvex` present, one `moof` per fragment). Some phone galleries and simple players handle fMP4 poorly. Phase 4 must prove an exported file plays in the device's own player; if it does not, the fallback is WebM on Android rather than adding a remuxer.
3. **`channelCount: 1` is a request.** Desktop returned 2 channels in both `track.getSettings()` and the decoded audio, so size estimates must use the actual channel count, not the requested one.
4. Opus-in-WebM came out much smaller than AAC for the same synthetic 1.5 s (12.5 KB vs 18.5 KB). Do not read that as a quality verdict — the fake device's signal is not speech, and Opus encodes silence almost for free.

**Limitations.** No Android or iOS hardware is attached to this machine, and no Chrome is installed (Edge only). Chromium builds without proprietary codecs can lack AAC even when the OS supports it, so a Chromium-based Android browser may behave differently from Chrome.

**To finish this spike:** deploy over HTTPS (or use localhost via USB port forwarding), open `docs/spikes/recorder-probe.html` on each phone, tap Run, and paste both JSON blobs into this section. The probe already reports codec, extension, channels, measured kbps, fMP4 detection and Opus-in-MP4 detection.

## 9. Open questions

1. **Q2 — Are 2/3/5/10 enough for repeat-N?** If not, a free-number input replaces the presets.
2. **Q3 — Should export also write a metadata manifest** (page/surah/duration per file) to enable a future import? Deferred to v2 unless free to add.
3. **Q4 — Confirm replace-on-re-record** (FR-2.9) is acceptable rather than keeping multiple takes.

## 10. Glossary

- **Page** — one printed page of the Madani mushaf, 1–604.
- **Slice** — the portion of one surah that falls on one page; the unit of recording.
- **Clip** — one saved audio file plus its metadata, covering exactly one slice.
- **Library** — all clips on the device.
- **Playlist** — the library in fixed page/surah order, used for sequential playback.
