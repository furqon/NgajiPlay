import { expect, test, type Page } from '@playwright/test';

/**
 * Real getUserMedia → MediaRecorder → IndexedDB → decode, driven through the
 * real UI. Chromium's fake capture device supplies the audio (see
 * playwright.config.ts), so containers, codecs and sizes are genuine.
 *
 * Runs against the dev server so the store module can be imported for
 * assertions, exactly like tests/e2e/data.spec.ts.
 */
const DB_MODULE = '/src/store/db.ts';

const RECORD_CLIP_NAME = /^p002-s002-al-baqarah-a001-005\.(m4a|mp4|webm)$/;

async function clearLibrary(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const db = await import(/* @vite-ignore */ modulePath);
    await db.clearAll();
  }, DB_MODULE);
}

async function recordFor(page: Page, ms: number): Promise<void> {
  await page.getByTestId('record').first().click();
  await expect(page.getByTestId('recorder')).toBeVisible();
  await page.getByTestId('record-start').click();
  await expect(page.getByTestId('record-stop')).toBeVisible();
  // MediaRecorder runs in real time; this is the capture itself, not a wait.
  await page.waitForTimeout(ms);
  await page.getByTestId('record-stop').click();
  await expect(page.getByTestId('record-preview')).toBeVisible();
}

test('records a clip, saves it, survives a reload and plays back', async ({ page }) => {
  await clearLibrary(page);
  await page.goto('/#/p/2');

  await expect(page.getByTestId('slice')).toHaveCount(1);
  await expect(page.getByTestId('slice')).toHaveAttribute('data-recorded', 'false');

  await page.getByTestId('record').first().click();
  // FR-2.5: the slice's ayahs stay visible inside the recorder.
  await expect(page.getByTestId('recorder-text')).toContainText('Al-Baqarah');
  await expect(page.getByTestId('recorder-title')).toContainText('Ayat 1–5');

  await page.getByTestId('record-start').click();
  await expect(page.getByTestId('record-timer')).toHaveText(/^0:0[1-9]$/);
  await page.waitForTimeout(1_300);
  await page.getByTestId('record-stop').click();

  const preview = page.getByTestId('record-preview');
  await expect(preview).toBeVisible();
  expect(await preview.getAttribute('src')).toMatch(/^blob:/);
  await expect(page.getByTestId('record-meta')).toContainText(/Durasi 0:0[1-9] · \d+ KB/);

  await page.getByTestId('record-save').click();
  await expect(page.getByTestId('recorder-status')).toHaveText('Rekaman tersimpan.');
  await expect(page.getByTestId('slice')).toHaveAttribute('data-recorded', 'true');
  await expect(page.getByTestId('slice').locator('.badge')).toHaveText('Sudah direkam');

  // Survives a reload: the badge comes back from IndexedDB, not from memory.
  await page.reload();
  await expect(page.getByTestId('slice')).toHaveAttribute('data-recorded', 'true');

  const stored = await page.evaluate(async (modulePath) => {
    const db = await import(/* @vite-ignore */ modulePath);
    const record = await db.getClip('2:2');
    if (!record) return null;

    const decoded = await new AudioContext().decodeAudioData(await record.blob.arrayBuffer());
    const url = URL.createObjectURL(record.blob);
    const audio = new Audio(url);
    await audio.play();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const playedTo = audio.currentTime;
    audio.pause();
    URL.revokeObjectURL(url);

    return {
      mimeType: record.mimeType,
      bytes: record.bytes,
      durationMs: record.durationMs,
      displayName: record.displayName,
      channels: record.channels,
      decodedSeconds: decoded.duration,
      playedTo,
    };
  }, DB_MODULE);

  expect(stored).not.toBeNull();
  const clip = stored!;
  expect(clip.mimeType).toMatch(/^audio\/(mp4|webm)/);
  expect(clip.displayName).toMatch(RECORD_CLIP_NAME);
  expect(clip.bytes).toBeGreaterThan(0);
  expect(clip.durationMs).toBeGreaterThanOrEqual(1_000);
  expect(clip.channels).toBeGreaterThanOrEqual(1);
  // The stored container really decodes, so the extension is not a guess.
  expect(clip.decodedSeconds).toBeGreaterThan(0.3);
  // And it really plays through an audio element (FR-5.1 groundwork).
  expect(clip.playedTo).toBeGreaterThan(0);
});

test('discarding a capture leaves the slice unrecorded', async ({ page }) => {
  await clearLibrary(page);
  await page.goto('/#/p/2');

  await recordFor(page, 700);
  await page.getByTestId('record-discard').click();
  await expect(page.getByTestId('recorder')).toHaveCount(0);
  await expect(page.getByTestId('slice')).toHaveAttribute('data-recorded', 'false');

  const count = await page.evaluate(async (modulePath) => {
    const db = await import(/* @vite-ignore */ modulePath);
    return db.clipCount();
  }, DB_MODULE);
  expect(count).toBe(0);
});

test('re-recording a slice asks before replacing the old clip', async ({ page }) => {
  await clearLibrary(page);
  await page.goto('/#/p/2');
  await expect(page.getByTestId('slice')).toHaveAttribute('data-recorded', 'false');

  // First clip.
  await recordFor(page, 700);
  await page.getByTestId('record-save').click();
  await expect(page.getByTestId('recorder-status')).toHaveText('Rekaman tersimpan.');
  await page.getByTestId('record-close').click();

  // Second clip on the same slice: the confirmation gates the write (FR-2.9).
  await recordFor(page, 700);
  await page.getByTestId('record-save').click();
  await expect(page.getByTestId('recorder-status')).toHaveText(
    'Ayat ini sudah punya rekaman. Ganti dengan yang baru?',
  );

  await page.getByTestId('record-cancel-replace').click();
  await expect(page.getByTestId('record-save')).toBeVisible();
  expect(
    await page.evaluate(async (modulePath) => {
      const db = await import(/* @vite-ignore */ modulePath);
      return db.clipCount();
    }, DB_MODULE),
  ).toBe(1);

  await page.getByTestId('record-save').click();
  await page.getByTestId('record-replace').click();
  await expect(page.getByTestId('recorder-status')).toHaveText('Rekaman tersimpan.');

  // One clip per slice: replacing does not add a second row.
  expect(
    await page.evaluate(async (modulePath) => {
      const db = await import(/* @vite-ignore */ modulePath);
      return db.clipCount();
    }, DB_MODULE),
  ).toBe(1);
});

test('a denied microphone shows the recovery message', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
    });
  });

  await page.goto('/#/p/2');
  await page.getByTestId('record').first().click();
  await page.getByTestId('record-start').click();

  await expect(page.getByTestId('record-error')).toContainText('Akses mikrofon ditolak');
  await expect(page.getByTestId('record-retry')).toBeVisible();
  await expect(page.getByTestId('record-preview')).toHaveCount(0);
});

test('a browser without a recordable codec says so instead of saving junk', async ({ page }) => {
  await page.addInitScript(() => {
    MediaRecorder.isTypeSupported = () => false;
  });

  await page.goto('/#/p/2');
  await page.getByTestId('record').first().click();
  await page.getByTestId('record-start').click();

  await expect(page.getByTestId('record-error')).toContainText(
    'tidak bisa merekam dalam format yang bisa disimpan',
  );
  // No retry, because retrying cannot help.
  await expect(page.getByTestId('record-retry')).toHaveCount(0);
});

// The done-when check asks for a 30-second capture. It costs 30 s of real time,
// so it runs on demand: LONG_RECORDING=1 npm run test:e2e -- -g "thirty-second"
test('a thirty-second clip records and saves', async ({ page }) => {
  test.skip(!process.env.LONG_RECORDING, 'set LONG_RECORDING=1 to run the real 30 s capture');
  test.setTimeout(120_000);

  await clearLibrary(page);
  await page.goto('/#/p/2');
  await recordFor(page, 30_000);
  await expect(page.getByTestId('record-meta')).toContainText(/Durasi 0:3[01]/);
  await page.getByTestId('record-save').click();
  await expect(page.getByTestId('recorder-status')).toHaveText('Rekaman tersimpan.');

  const stored = await page.evaluate(async (modulePath) => {
    const db = await import(/* @vite-ignore */ modulePath);
    const record = await db.getClip('2:2');
    if (!record) return null;
    const decoded = await new AudioContext().decodeAudioData(await record.blob.arrayBuffer());
    return { decodedSeconds: decoded.duration, durationMs: record.durationMs };
  }, DB_MODULE);

  expect(stored!.durationMs).toBeGreaterThanOrEqual(29_000);
  expect(stored!.decodedSeconds).toBeGreaterThan(29);
});
