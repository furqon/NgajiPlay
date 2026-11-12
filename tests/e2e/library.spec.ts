import { readFile, stat } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { elapsedSeconds } from './helpers';

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
  updatedAt?: number;
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
            updatedAt: entry.updatedAt ?? entry.createdAt ?? createdAt,
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

interface SavedFile {
  name: string;
  bytes: number;
}

async function stubFolderPicker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const saved: Array<{ name: string; bytes: number }> = [];
    (window as unknown as { __savedFiles: typeof saved }).__savedFiles = saved;

    const directory = Object.assign(
      Object.create({
        queryPermission: async () => 'granted',
        requestPermission: async () => 'granted',
        getFileHandle: async (fileName: string) => ({
          kind: 'file',
          name: fileName,
          createWritable: async () => ({
            write: async (data: Blob) => {
              saved.push({ name: fileName, bytes: data.size });
            },
            close: async () => {},
            abort: async () => {},
          }),
        }),
      }),
      { kind: 'directory', name: 'Drive' },
    );

    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => directory,
    });
  });
}

async function savedFiles(page: Page): Promise<SavedFile[]> {
  return page.evaluate(
    () => (window as unknown as { __savedFiles?: SavedFile[] }).__savedFiles ?? [],
  );
}

interface ExportedClip {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

async function recordAndExport(page: Page): Promise<ExportedClip> {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const db = await import(/* @vite-ignore */ modulePath);
    await db.clearAll();
  }, DB_MODULE);

  await page.goto('/#/p/2');
  await page.getByTestId('record').first().click();
  await page.getByTestId('record-start').click();
  await expect(page.getByTestId('record-stop')).toBeVisible();
  await page.waitForTimeout(1_300);
  await page.getByTestId('record-stop').click();
  await expect(page.getByTestId('record-preview')).toBeVisible();
  await page.getByTestId('record-save').click();
  await expect(page.getByTestId('recorder-status')).toHaveText('Rekaman tersimpan.');

  const mimeType = await page.evaluate(async (modulePath) => {
    const db = await import(/* @vite-ignore */ modulePath);
    return (await db.getClip('2:2'))?.mimeType;
  }, DB_MODULE);
  expect(mimeType).toBeTruthy();

  await goLibrary(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('clip-export').click(),
  ]);
  const saved = await download.path();
  expect(saved).not.toBeNull();

  return {
    name: download.suggestedFilename(),
    mimeType: mimeType!,
    buffer: await readFile(saved!),
  };
}

async function importFile(page: Page, clip: ExportedClip): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('import-clips').click();
  await (await chooser).setFiles({
    name: clip.name,
    mimeType: clip.mimeType,
    buffer: clip.buffer,
  });
  await expect(page.getByTestId('import-panel')).toBeVisible();
}

async function clearLibrary(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const db = await import(/* @vite-ignore */ modulePath);
    await db.clearAll();
  }, DB_MODULE);
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

test('saves every clip into a chosen folder with the export filenames', async ({ page }) => {
  await stubFolderPicker(page);
  await seed(page, [
    {
      page: 1,
      surah: 1,
      ayahStart: 1,
      ayahEnd: 7,
      displayName: 'p001-s001-al-fatihah-a001-007.m4a',
    },
    { page: 2, surah: 2, ayahStart: 1, ayahEnd: 5, mimeType: WEBM, displayName: 'Bacaan Ali' },
  ]);
  await goLibrary(page);

  await expect(page.getByTestId('save-all-to-folder')).toHaveText('Simpan semua ke folder (2)');
  await page.getByTestId('save-all-to-folder').click();

  await expect(page.getByTestId('library-state')).toContainText('Tersimpan ke folder “Drive”');
  expect(await savedFiles(page)).toEqual([
    { name: 'p001-s001-al-fatihah-a001-007.m4a', bytes: 2_048 },
    { name: 'Bacaan-Ali-p002-s002.webm', bytes: 2_048 },
  ]);
  await expect(page.getByTestId('storage-folder')).toContainText('Drive');
});

test('saves one clip into the chosen folder from its library row', async ({ page }) => {
  await stubFolderPicker(page);
  await seed(page, [
    {
      page: 1,
      surah: 1,
      ayahStart: 1,
      ayahEnd: 7,
      displayName: 'Ali',
    },
  ]);
  await goLibrary(page);

  await page.getByTestId('clip-save-folder').click();

  await expect(page.getByTestId('clip-status')).toContainText('Tersimpan ke folder “Drive”');
  expect(await savedFiles(page)).toEqual([{ name: 'Ali-p001-s001.m4a', bytes: 2_048 }]);
});

test('hides folder actions and keeps the download export when the picker is missing', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: undefined });
  });
  await seed(page, [
    {
      page: 1,
      surah: 1,
      ayahStart: 1,
      ayahEnd: 7,
      displayName: 'p001-s001-al-fatihah-a001-007.m4a',
    },
  ]);
  await goLibrary(page);

  await expect(page.getByTestId('save-all-to-folder')).toHaveCount(0);
  await expect(page.getByTestId('clip-save-folder')).toHaveCount(0);
  await expect(page.getByTestId('storage-folder')).toBeHidden();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('clip-export').click(),
  ]);
  expect(download.suggestedFilename()).toBe('p001-s001-al-fatihah-a001-007.m4a');
});

test('imports an exported recording into a fresh library and plays it back', async ({ page }) => {
  const exported = await recordAndExport(page);
  await clearLibrary(page);
  await page.goto('/#/library');
  await expect(page.getByTestId('import-clips')).toBeVisible();
  await expect(page.getByTestId('library-empty')).toBeVisible();

  await expect(page.getByTestId('import-input')).toHaveAttribute(
    'accept',
    'audio/*,.m4a,.mp4,.webm,.ogg',
  );
  await importFile(page, exported);

  await expect(page.getByTestId('import-row')).toHaveCount(1);
  await expect(page.getByTestId('import-row-new')).toBeVisible();
  await expect(page.getByTestId('import-row-meta')).toContainText(exported.name);

  await page.getByTestId('import-apply').click();
  await expect(page.getByTestId('library-state')).toHaveText(
    'Impor selesai: 1 baru, 0 diganti, 0 dilewati, 0 gagal.',
  );
  await expect(page.getByTestId('import-outcome')).toHaveText('Diimpor');
  await expect(page.getByTestId('clip')).toHaveCount(1);
  await expect(page.getByTestId('clip-name')).toHaveText(exported.name);
  await expect(page.getByTestId('clip-meta')).toHaveText('Halaman 2 · Al-Baqarah · Ayat 1–5');

  await page.getByTestId('clip-play').click();
  await expect(page.getByTestId('player-title')).toHaveText(exported.name);
  await expect.poll(() => elapsedSeconds(page), { timeout: 6_000 }).toBeGreaterThan(0);
});

test('previews a conflict, keeps the local clip, then replaces it last-write-wins', async ({
  page,
}) => {
  const exported = await recordAndExport(page);
  await clearLibrary(page);

  const older = Date.now() - 3_600_000;
  await page.evaluate(
    async ({ modulePath, mimeType, updatedAt }) => {
      const db = await import(/* @vite-ignore */ modulePath);
      const blob = new Blob([new Uint8Array(2_048)], { type: mimeType });
      await db.putClip(
        {
          id: '2:2',
          page: 2,
          surah: 2,
          ayahStart: 1,
          ayahEnd: 5,
          mimeType,
          bytes: blob.size,
          durationMs: 4_000,
          createdAt: updatedAt,
          updatedAt,
          displayName: 'Rekaman lama',
        },
        blob,
      );
    },
    { modulePath: DB_MODULE, mimeType: exported.mimeType, updatedAt: older },
  );

  await goLibrary(page);
  await expect(page.getByTestId('clip-name')).toHaveText('Rekaman lama');

  await importFile(page, exported);
  await expect(page.getByTestId('import-row-existing')).toContainText('Rekaman lama');
  await expect(page.getByTestId('import-replace')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('import-keep').click();
  await expect(page.getByTestId('import-keep')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('import-apply').click();
  await expect(page.getByTestId('library-state')).toHaveText(
    'Impor selesai: 0 baru, 0 diganti, 1 dilewati, 0 gagal.',
  );
  await expect(page.getByTestId('import-outcome')).toHaveText('Dilewati');
  await expect(page.getByTestId('clip-name')).toHaveText('Rekaman lama');

  await page.getByTestId('import-cancel').click();
  await importFile(page, exported);
  await expect(page.getByTestId('import-replace')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('import-apply').click();
  await expect(page.getByTestId('library-state')).toHaveText(
    'Impor selesai: 0 baru, 1 diganti, 0 dilewati, 0 gagal.',
  );
  await expect(page.getByTestId('import-outcome')).toHaveText('Diganti');
  await expect(page.getByTestId('clip-name')).toHaveText(exported.name);
});
