import { expect, test, type Page } from '@playwright/test';

/**
 * Playback, repeat, cross-navigation audio and resume, driven through the real
 * bar against the dev server so the store module can be seeded directly.
 *
 * The clips are 8 kHz mono WAV tones: real, decodable audio with an exact
 * duration, which keeps these cases about the player's state machine rather
 * than about the recorder (record.spec.ts already proves the recorded formats
 * play back).
 */
const DB_MODULE = '/src/store/db.ts';

// Playback is a phone-first screen, and the bar's five controls share one row.
test.use({ viewport: { width: 390, height: 752 } });

interface SeedClip {
  id: string;
  page: number;
  surah: number;
  from: number;
  to: number;
  name: string;
  seconds: number;
}

const FIRST: SeedClip = {
  id: '1:1',
  page: 1,
  surah: 1,
  from: 1,
  to: 7,
  name: 'Ali satu',
  seconds: 6,
};
const SECOND: SeedClip = {
  id: '2:2',
  page: 2,
  surah: 2,
  from: 1,
  to: 5,
  name: 'Ali dua',
  seconds: 6,
};

async function seed(page: Page, clips: SeedClip[]): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    async ({ modulePath, clips: items }) => {
      const tone = (seconds: number): Blob => {
        const rate = 8_000;
        const samples = Math.floor(rate * seconds);
        const buffer = new ArrayBuffer(44 + samples * 2);
        const view = new DataView(buffer);
        const text = (offset: number, value: string): void => {
          for (let index = 0; index < value.length; index += 1) {
            view.setUint8(offset + index, value.charCodeAt(index));
          }
        };

        text(0, 'RIFF');
        view.setUint32(4, 36 + samples * 2, true);
        text(8, 'WAVE');
        text(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, rate, true);
        view.setUint32(28, rate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        text(36, 'data');
        view.setUint32(40, samples * 2, true);
        for (let index = 0; index < samples; index += 1) {
          view.setInt16(44 + index * 2, Math.sin((2 * Math.PI * 440 * index) / rate) * 3_000, true);
        }
        return new Blob([buffer], { type: 'audio/wav' });
      };

      const db = await import(/* @vite-ignore */ modulePath);
      await db.clearAll();
      for (const item of items) {
        const blob = tone(item.seconds);
        await db.putClip(
          {
            id: item.id,
            page: item.page,
            surah: item.surah,
            ayahStart: item.from,
            ayahEnd: item.to,
            mimeType: 'audio/wav',
            bytes: blob.size,
            durationMs: Math.round(item.seconds * 1000),
            createdAt: Date.UTC(2026, 10, 10, 9, 0),
            displayName: item.name,
            channels: 1,
          },
          blob,
        );
      }
    },
    { modulePath: DB_MODULE, clips },
  );

  await page.goto('/#/library');
  await expect(page.getByTestId('clip')).toHaveCount(clips.length);
}

async function elapsedSeconds(page: Page): Promise<number> {
  const text = (await page.getByTestId('player-elapsed').textContent()) ?? '0:00';
  const [minutes, seconds] = text.split(':').map(Number);
  return (minutes ?? 0) * 60 + (seconds ?? 0);
}

test('plays a clip and the bar shows its page, surah, elapsed and remaining time', async ({
  page,
}) => {
  await seed(page, [FIRST, SECOND]);
  await page.getByTestId('clip-play').first().click();

  await expect(page.getByTestId('player')).toBeVisible();
  await expect(page.getByTestId('player-title')).toHaveText('Ali satu');
  await expect(page.getByTestId('player-meta')).toContainText('Halaman 1');
  await expect(page.getByTestId('player-meta')).toContainText('Al-Fatihah');
  await expect(page.getByTestId('player-meta')).toHaveAttribute('href', '#/p/1');
  await expect(page.getByTestId('player-toggle')).toHaveText('Jeda');
  await expect(page.getByTestId('player-remaining')).toHaveText(/^−0:0[0-6]$/);

  // Real playback: the elapsed clock has to move on its own.
  await expect.poll(() => elapsedSeconds(page), { timeout: 6_000 }).toBeGreaterThan(0);

  // Media Session metadata is best-effort, and Chromium offers it (FR-5.6).
  expect(await page.evaluate(() => navigator.mediaSession?.metadata?.title)).toBe('Ali satu');
  expect(await page.evaluate(() => navigator.mediaSession?.playbackState)).toBe('playing');

  await page.getByTestId('player-toggle').click();
  await expect(page.getByTestId('player-toggle')).toHaveText('Putar');
  const paused = await elapsedSeconds(page);
  await page.waitForTimeout(800);
  expect(await elapsedSeconds(page)).toBe(paused);

  // The bar must fit a 390px phone without sideways scrolling.
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
});

test('next and previous move through the playlist and mark the playing row', async ({ page }) => {
  await seed(page, [FIRST, SECOND]);
  await page.getByTestId('clip-play').first().click();
  await expect(page.getByTestId('clip').first()).toHaveAttribute('data-playing', 'true');
  await expect(page.getByTestId('clip').nth(1)).toHaveAttribute('data-playing', 'false');

  await page.getByTestId('player-next').click();
  await expect(page.getByTestId('player-title')).toHaveText('Ali dua');
  await expect(page.getByTestId('player-meta')).toContainText('Halaman 2');
  await expect(page.getByTestId('player-meta')).toContainText('Al-Baqarah');
  await expect(page.getByTestId('clip').nth(1)).toHaveAttribute('data-playing', 'true');

  await page.getByTestId('player-prev').click();
  await expect(page.getByTestId('player-title')).toHaveText('Ali satu');
  await expect(page.getByTestId('clip').first()).toHaveAttribute('data-playing', 'true');
});

test('the repeat button cycles every mode in FR-5.2 order', async ({ page }) => {
  await seed(page, [FIRST]);
  await page.getByTestId('clip-play').first().click();
  await page.getByTestId('player-toggle').click();

  const repeat = page.getByTestId('player-repeat');
  await expect(repeat).toHaveText('Ulangi: nonaktif');

  for (const label of [
    'Ulangi: satu',
    'Ulangi: semua',
    'Ulangi: 2×',
    'Ulangi: 3×',
    'Ulangi: 5×',
    'Ulangi: 10×',
    'Ulangi: nonaktif',
  ]) {
    await repeat.click();
    await expect(repeat).toHaveText(label);
  }
});

test('a clip that ends hands over to the next one, and repeat one keeps it', async ({ page }) => {
  await seed(page, [
    { ...FIRST, seconds: 0.6 },
    { ...SECOND, seconds: 0.6 },
  ]);

  await page.getByTestId('clip-play').first().click();
  // Auto-advance, without any further tap.
  await expect(page.getByTestId('player-title')).toHaveText('Ali dua', { timeout: 6_000 });

  // Park it, switch to repeat one, then let it run for longer than a clip.
  await page.getByTestId('player-toggle').click();
  await page.getByTestId('player-repeat').click();
  await expect(page.getByTestId('player-repeat')).toHaveText('Ulangi: satu');
  await page.getByTestId('player-toggle').click();

  await page.waitForTimeout(2_000);
  await expect(page.getByTestId('player-title')).toHaveText('Ali dua');
  await expect(page.getByTestId('player-toggle')).toHaveText('Jeda');
});

test('repeat all wraps from the last clip back to the first', async ({ page }) => {
  await seed(page, [
    { ...FIRST, seconds: 0.5 },
    { ...SECOND, seconds: 0.5 },
  ]);

  await page.getByTestId('clip-play').nth(1).click();
  await expect(page.getByTestId('player-title')).toHaveText('Ali dua');

  await page.getByTestId('player-toggle').click();
  await page.getByTestId('player-repeat').click();
  await page.getByTestId('player-repeat').click();
  await expect(page.getByTestId('player-repeat')).toHaveText('Ulangi: semua');
  await page.getByTestId('player-toggle').click();

  await expect(page.getByTestId('player-title')).toHaveText('Ali satu', { timeout: 6_000 });
});

test('audio keeps playing across route changes, in a single element (FR-5.5)', async ({ page }) => {
  await seed(page, [{ ...FIRST, seconds: 10 }]);
  await page.getByTestId('clip-play').first().click();
  await expect.poll(() => elapsedSeconds(page), { timeout: 6_000 }).toBeGreaterThan(0);

  await page.evaluate(() => {
    window.location.hash = '#/p/2';
  });
  await expect(page.getByTestId('page-number')).toBeVisible();
  await expect(page.getByTestId('player-toggle')).toHaveText('Jeda');

  const afterPage = await elapsedSeconds(page);
  expect(afterPage).toBeGreaterThanOrEqual(1);

  await page.getByTestId('library-link').click();
  await expect(page.getByTestId('library-count')).toHaveText('1 rekaman');
  await expect(page.getByTestId('player-toggle')).toHaveText('Jeda');

  // One element for the whole app, and it is the one still playing.
  expect(await page.evaluate(() => document.querySelectorAll('audio').length)).toBe(1);
  await expect.poll(() => elapsedSeconds(page), { timeout: 6_000 }).toBeGreaterThan(afterPage);
});

test('a recorded slice plays straight from its page, without the library', async ({ page }) => {
  await seed(page, [FIRST, SECOND]);
  await page.goto('/#/p/1');
  await expect(page.getByTestId('slice')).toHaveCount(1);

  const play = page.getByTestId('slice-play');
  await expect(play).toBeVisible();
  await expect(play).toHaveAttribute('aria-label', 'Putar Al-Fatihah ayat 1–7');

  await play.click();
  await expect(page.getByTestId('player-title')).toHaveText('Ali satu');
  await expect(page.getByTestId('slice')).toHaveAttribute('data-playing', 'true');
  await expect(play).toHaveText('❚❚');
  await expect.poll(() => elapsedSeconds(page), { timeout: 6_000 }).toBeGreaterThan(0);

  // The same control pauses; it does not restart the clip.
  await play.click();
  await expect(page.getByTestId('player-toggle')).toHaveText('Putar');
  await expect(play).toHaveText('▶');

  // A page with nothing recorded has no play control at all.
  await page.goto('/#/p/100');
  await expect(page.getByTestId('slice')).toHaveCount(1);
  await expect(page.getByTestId('slice-play')).toBeHidden();
});

test('remembered clip and position come back after a reload, still paused (FR-5.4)', async ({
  page,
}) => {
  await seed(page, [FIRST, SECOND]);
  await page.getByTestId('clip-play').nth(1).click();
  await expect(page.getByTestId('player-title')).toHaveText('Ali dua');
  await expect.poll(() => elapsedSeconds(page), { timeout: 6_000 }).toBeGreaterThan(0);

  await page.getByTestId('player-toggle').click();
  const beforeReload = await elapsedSeconds(page);
  expect(beforeReload).toBeGreaterThan(0);
  await page.waitForTimeout(250);

  await page.reload();

  await expect(page.getByTestId('player')).toBeVisible();
  await expect(page.getByTestId('player-title')).toHaveText('Ali dua');
  await expect(page.getByTestId('player-toggle')).toHaveText('Putar');
  // The position is restored, not just the clip.
  expect(await elapsedSeconds(page)).toBeGreaterThanOrEqual(beforeReload);

  // And play resumes from there rather than from zero.
  await page.getByTestId('player-toggle').click();
  await expect.poll(() => elapsedSeconds(page), { timeout: 6_000 }).toBeGreaterThan(beforeReload);
});
