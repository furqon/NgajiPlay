import { stat } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

/**
 * Real IndexedDB, real downloads, real UI. Runs against the Vite dev server so
 * the store module can seed clips, exactly like data.spec.ts and record.spec.ts.
 */
const DB_MODULE = '/src/store/db.ts';

interface SeedClip {
  page: number;
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  mimeType?: string;
  durationMs?: number;
  createdAt?: number;
  displayName?: string;
}

const WEBM = 'audio/webm;codecs=opus';
const CREATED = Date.UTC(2026, 10, 10, 9, 0);

// The library is a phone screen first; every case runs at phone width.
test.use({ viewport: { width: 390, height: 752 } });

async function seed(page: Page, clips: SeedClip[]): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    async ({ modulePath, clips: entries, createdAt }) => {
      const db = await import(/* @vite-ignore */ modulePath);
      await db.clearAll();
      for (const entry of entries) {
        const mimeType = entry.mimeType ?? 'audio/mp4;codecs=mp4a.40.2';
        const blob = new Blob([new Uint8Array(2_048)], { type: mimeType });
        await db.putClip(
          {
            id: db.clipId(entry.page, entry.surah),
            page: entry.page,
            surah: entry.surah,
            ayahStart: entry.ayahStart,
            ayahEnd: entry.ayahEnd,
            mimeType,
            bytes: blob.size,
            durationMs: entry.durationMs ?? 4_000,
            createdAt: entry.createdAt ?? createdAt,
            displayName: entry.displayName ?? `p${entry.page}-s${entry.surah}`,
          },
          blob,
        );
      }
    },
    { modulePath: DB_MODULE, clips, createdAt: CREATED },
  );
}

async function goLibrary(page: Page): Promise<void> {
  await page.goto('/#/library');
  await expect(page.getByTestId('clip-list')).toBeVisible();
}

test('lists every clip in playlist order with its metadata and the storage readout', async ({
  page,
}) => {
  // Inserted out of order on purpose: the order is derived, never stored.
  await seed(page, [
    { page: 100, surah: 4, ayahStart: 135, ayahEnd: 140, durationMs: 120_000 },
    { page: 2, surah: 2, ayahStart: 1, ayahEnd: 5, durationMs: 61_000 },
    {
      page: 1,
      surah: 1,
      ayahStart: 1,
      ayahEnd: 7,
      durationMs: 4_321,
      displayName: 'p001-s001-al-fatihah-a001-007.m4a',
    },
  ]);
  await goLibrary(page);

  await expect(page.getByTestId('clip')).toHaveCount(3);
  await expect(page.getByTestId('clip').first()).toHaveAttribute('data-clip-id', '1:1');
  expect(
    await page.getByTestId('clip').evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-clip-id')),
    ),
  ).toEqual(['1:1', '2:2', '100:4']);
  await expect(page.getByTestId('library-count')).toHaveText('3 rekaman');

  const first = page.getByTestId('clip').first();
  await expect(first.getByTestId('clip-name')).toHaveText('p001-s001-al-fatihah-a001-007.m4a');
  // FR-4.1: page, surah and ayah range, all readable without opening the clip.
  await expect(first.getByTestId('clip-meta')).toHaveText(
    'Halaman 1 · Al-Fatihah · Ayat 1–7',
  );
  await expect(first.getByTestId('clip-meta')).toHaveAttribute('href', '#/p/1');
  // Duration, size and the created date.
  await expect(first.getByTestId('clip-stats')).toContainText('0:04');
  await expect(first.getByTestId('clip-stats')).toContainText('2 KB');
  await expect(first.getByTestId('clip-stats')).toContainText('10 Nov 2026');

  // Longer clips show real minutes, not a raw millisecond count.
  await expect(page.getByTestId('clip').nth(2).getByTestId('clip-stats')).toContainText('2:00');

  // FR-4.5: used and available storage, plus the persistence state (FR-4.6).
  await expect(page.getByTestId('storage-usage')).toHaveText(/^Terpakai .+ dari kuota .+\.$/);
  await expect(page.getByTestId('storage-free')).toHaveText(/masih tersedia/);
  await expect(page.getByTestId('storage-persist')).not.toHaveText('');
  await expect(page.getByTestId('export-all')).toHaveText('Ekspor semua (3)');
  await expect(page.getByTestId('export-all')).toBeEnabled();

  // Long names and dates must not push the phone layout sideways.
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
});

test('renames a clip and the new name survives a reload', async ({ page }) => {
  await seed(page, [
    { page: 1, surah: 1, ayahStart: 1, ayahEnd: 7, displayName: 'p001-s001-al-fatihah.m4a' },
  ]);
  await goLibrary(page);

  await page.getByTestId('clip-rename').click();
  const input = page.getByTestId('clip-input');
  await expect(input).toHaveValue('p001-s001-al-fatihah.m4a');
  await input.fill('Bacaan Ali — pagi');
  await page.getByTestId('clip-rename-save').click();

  await expect(page.getByTestId('clip-name')).toHaveText('Bacaan Ali — pagi');

  await page.reload();
  await expect(page.getByTestId('clip-name')).toHaveText('Bacaan Ali — pagi');
  // The deterministic identifiers stay visible (FR-3.2).
  await expect(page.getByTestId('clip-meta')).toHaveText('Halaman 1 · Al-Fatihah · Ayat 1–7');

  // Cancelling leaves the stored name alone.
  await page.getByTestId('clip-rename').click();
  await page.getByTestId('clip-input').fill('Nama lain');
  await page.getByTestId('clip-rename-cancel').click();
  await expect(page.getByTestId('clip-name')).toHaveText('Bacaan Ali — pagi');
});

test('deletes a clip only after confirmation, and it stays gone after a reload', async ({
  page,
}) => {
  await seed(page, [{ page: 2, surah: 2, ayahStart: 1, ayahEnd: 5 }]);
  await goLibrary(page);

  // Backing out of the confirmation keeps the clip.
  await page.getByTestId('clip-delete').click();
  await expect(page.getByTestId('clip-status')).toContainText('Hapus rekaman ini?');
  await page.getByTestId('clip-delete-cancel').click();
  await expect(page.getByTestId('clip')).toHaveCount(1);

  await page.getByTestId('clip-delete').click();
  await page.getByTestId('clip-delete-confirm').click();

  await expect(page.getByTestId('clip')).toHaveCount(0);
  await expect(page.getByTestId('library-empty')).toBeVisible();
  await expect(page.getByTestId('library-count')).toHaveText('0 rekaman');
  await expect(page.getByTestId('export-all')).toBeDisabled();

  await page.reload();
  await expect(page.getByTestId('clip')).toHaveCount(0);
  expect(
    await page.evaluate(async (modulePath) => {
      const db = await import(/* @vite-ignore */ modulePath);
      return db.clipCount();
    }, DB_MODULE),
  ).toBe(0);
});

test('exports one clip with a sanitised name and the real codec extension', async ({ page }) => {
  await seed(page, [
    {
      page: 1,
      surah: 1,
      ayahStart: 1,
      ayahEnd: 7,
      mimeType: WEBM,
      displayName: 'Ali/Bacaan: "pagi"',
    },
  ]);
  await goLibrary(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('clip-export').click(),
  ]);

  // FR-3.3: sanitised display name, page and surah for uniqueness, WebM from the
  // stored codec even though the clip lives in an `.m4a`-sounding library slot.
  expect(download.suggestedFilename()).toBe('Ali-Bacaan-pagi-p001-s001.webm');
  // The exported file is the stored blob, byte for byte, not a re-encode.
  const saved = await download.path();
  expect(saved).not.toBeNull();
  expect((await stat(saved!)).size).toBe(2_048);
  await expect(page.getByTestId('library-state')).toContainText('Unduhan dimulai');
});

test('exports every clip as its own file', async ({ page }) => {
  await seed(page, [
    { page: 1, surah: 1, ayahStart: 1, ayahEnd: 7, displayName: 'p001-s001-al-fatihah-a001-007.m4a' },
    { page: 2, surah: 2, ayahStart: 1, ayahEnd: 5, mimeType: WEBM, displayName: 'Bacaan Ali' },
  ]);
  await goLibrary(page);

  const names: string[] = [];
  page.on('download', (download) => names.push(download.suggestedFilename()));

  await page.getByTestId('export-all').click();

  await expect.poll(() => names.length, { timeout: 15_000 }).toBe(2);
  expect(names.sort()).toEqual([
    'Bacaan-Ali-p002-s002.webm',
    'p001-s001-al-fatihah-a001-007.m4a',
  ]);
});

test('the search screen leads to an empty library with a way back', async ({ page }) => {
  await seed(page, []);
  await page.goto('/');
  await page.getByTestId('library-link').click();

  await expect(page.getByTestId('library-empty')).toBeVisible();
  await expect(page.getByTestId('library-count')).toHaveText('0 rekaman');
  await expect(page.getByTestId('export-all')).toBeDisabled();

  await page.getByTestId('back').click();
  await expect(page.getByTestId('search-input')).toBeVisible();
});
