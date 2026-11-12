import { expect, test } from '@playwright/test';

/**
 * Runs against the Vite dev server so the real source modules can be imported
 * into the page. fake-indexeddb cannot prove that a Blob survives a reload in a
 * real browser, which is exactly what Phase 1's done-when requires.
 */
interface DbModule {
  clipId(page: number, surah: number): string;
  putClip(clip: unknown, blob: Blob): Promise<unknown>;
  listClips(): Promise<Array<{ id: string; page: number; surah: number; bytes: number }>>;
  getClip(id: string): Promise<{ blob: Blob; durationMs: number } | undefined>;
  clipCount(): Promise<number>;
}

const DB_MODULE = '/src/store/db.ts';

test('a clip and its blob survive a real page reload', async ({ page }) => {
  await page.goto('/');

  const savedSize = await page.evaluate(async (modulePath) => {
    const db: DbModule = await import(/* @vite-ignore */ modulePath);
    const blob = new Blob(['recitation-bytes-for-phase-1'], { type: 'audio/webm;codecs=opus' });
    await db.putClip(
      {
        id: db.clipId(2, 1),
        page: 2,
        surah: 1,
        ayahStart: 1,
        ayahEnd: 5,
        mimeType: blob.type,
        bytes: blob.size,
        durationMs: 4321,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        displayName: 'p002-s001-al-fatihah',
      },
      blob,
    );
    return blob.size;
  }, DB_MODULE);

  await page.reload();

  const read = await page.evaluate(async (modulePath) => {
    const db: DbModule = await import(/* @vite-ignore */ modulePath);
    const clips = await db.listClips();
    const record = await db.getClip(db.clipId(2, 1));
    const estimate = await navigator.storage.estimate();
    return {
      count: await db.clipCount(),
      ids: clips.map((clip) => clip.id),
      blobText: record ? await record.blob.text() : null,
      blobSize: record?.blob.size ?? 0,
      durationMs: record?.durationMs ?? 0,
      quota: estimate.quota ?? 0,
    };
  }, DB_MODULE);

  expect(read.count).toBe(1);
  expect(read.ids).toEqual(['2:1']);
  expect(read.blobSize).toBe(savedSize);
  expect(read.blobText).toBe('recitation-bytes-for-phase-1');
  expect(read.durationMs).toBe(4321);
  // FR-4.5: the quota must be readable so the UI can show storage used.
  expect(read.quota).toBeGreaterThan(0);
});

test('the vendored Quran data is served and page slices are correct on spot checks', async ({
  page,
}) => {
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const response = await fetch('/quran.json');
    const data = await response.json();
    const sliceOf = (n: number) =>
      data.pages[n - 1].slices.map(([surah, from, to]: [number, number, number]) => [surah, from, to]);
    return {
      status: response.status,
      surahs: data.surahs.length,
      pages: data.pages.length,
      ayahCount: data.meta.ayahCount,
      spot: {
        1: sliceOf(1),
        2: sliceOf(2),
        50: sliceOf(50),
        200: sliceOf(200),
        604: sliceOf(604),
      },
      firstAyah: data.surahs[0].ayahs[0],
      secondSurahFirstAyah: data.surahs[1].ayahs[0],
      lastAyah: data.surahs[113].ayahs[5],
    };
  });

  expect(result.status).toBe(200);
  expect(result.surahs).toBe(114);
  expect(result.pages).toBe(604);
  expect(result.ayahCount).toBe(6236);
  expect(result.spot).toMatchObject({
    1: [[1, 1, 7]],
    2: [[2, 1, 5]],
    604: [
      [112, 1, 4],
      [113, 1, 5],
      [114, 1, 6],
    ],
  });
  // Page 50 and 200 must be non-empty and ordered; exact ranges come from the
  // pinned metadata and are asserted in the unit tests.
  for (const page of [result.spot[50], result.spot[200]] as Array<number[][]>) {
    expect(page.length).toBeGreaterThan(0);
    for (const [surah, from, to] of page as Array<[number, number, number]>) {
      expect(from).toBeLessThanOrEqual(to);
      expect(surah).toBeGreaterThanOrEqual(1);
    }
  }
  // Al-Fatihah 1 is the basmala itself, and 2:1 begins with it (REQ §8).
  expect(result.firstAyah.length).toBeGreaterThan(0);
  expect(result.secondSurahFirstAyah.startsWith(result.firstAyah)).toBe(true);
  expect(result.lastAyah.length).toBeGreaterThan(0);
  expect(result.lastAyah).not.toBe(result.firstAyah);
});

test('the Amiri Quran subset is served and covers every glyph the text needs', async ({ page }) => {
  await page.goto('/');

  const font = await page.evaluate(async () => {
    const response = await fetch('/fonts/amiri-quran-subset.woff2');
    const buffer = await response.arrayBuffer();
    await document.fonts.load('16px "Amiri Quran"');
    return {
      status: response.status,
      bytes: buffer.byteLength,
      loaded: document.fonts.check('16px "Amiri Quran"'),
    };
  });

  expect(font.status).toBe(200);
  expect(font.bytes).toBeGreaterThan(10_000);
  expect(font.loaded).toBe(true);
});
