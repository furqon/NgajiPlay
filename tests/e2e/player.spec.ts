import { expect, test } from '@playwright/test';
import { elapsedSeconds, seed, type SeedClip } from './helpers';

/**
 * Playback, repeat, cross-navigation audio and resume, driven through the real
 * bar against the dev server. helpers.ts seeds real, decodable WAV clips and
 * record.spec.ts proves the recorded formats play back.
 */

// Playback is a phone-first screen, and the bar's five controls share one row.
test.use({ viewport: { width: 390, height: 752 } });

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

test('closes and reopens the controls drawer without interrupting playback', async ({ page }) => {
  await seed(page, [FIRST]);
  await page.getByTestId('clip-play').first().click();

  const drawer = page.getByTestId('player-drawer');
  const toggle = page.getByTestId('player-drawer-toggle');
  await expect(drawer).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  await toggle.click();
  await expect(drawer).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveAttribute('aria-label', 'Tampilkan kontrol');
  await expect(page.getByTestId('player-title')).toBeVisible();

  const before = await elapsedSeconds(page);
  await expect.poll(() => elapsedSeconds(page), { timeout: 6_000 }).toBeGreaterThan(before);

  await toggle.click();
  await expect(drawer).toBeVisible();
  await expect(page.getByTestId('player-toggle')).toHaveText('Jeda');
});

test('hides the whole player without stopping playback, and restores it', async ({ page }) => {
  await seed(page, [FIRST]);
  await page.getByTestId('clip-play').first().click();

  const bar = page.getByTestId('player');
  const mini = page.getByTestId('player-mini');
  await expect(bar).toBeVisible();
  await expect(mini).toBeHidden();

  await page.getByTestId('player-hide').click();
  await expect(bar).toBeHidden();
  await expect(mini).toBeVisible();
  await expect(mini).toHaveAttribute('aria-label', 'Tampilkan pemutar');

  // The recitation carries on: the clock keeps moving with the bar gone.
  const before = await elapsedSeconds(page);
  await expect.poll(() => elapsedSeconds(page), { timeout: 6_000 }).toBeGreaterThan(before);
  await expect(page.getByTestId('player-toggle')).toHaveText('Jeda');

  await mini.click();
  await expect(bar).toBeVisible();
  await expect(mini).toBeHidden();
  await expect(page.getByTestId('player-title')).toHaveText('Ali satu');
});

test('next and previous move through the playlist and mark the playing row', async ({ page }) => {
  await seed(page, [FIRST, SECOND]);
  await page.getByTestId('clip-play').first().click();
  // Starting playback opens the clip's page (FR-6.1), so come back to the list.
  await expect(page.getByTestId('page-number')).toContainText('Halaman 1');
  await page.getByTestId('library-link').click();

  await expect(page.getByTestId('clip').first()).toHaveAttribute('data-playing', 'true');
  await expect(page.getByTestId('clip').nth(1)).toHaveAttribute('data-playing', 'false');

  // A track change made while browsing does not yank the reader off the list.
  await page.getByTestId('player-next').click();
  await expect(page.getByTestId('player-title')).toHaveText('Ali dua');
  await expect(page.getByTestId('player-meta')).toContainText('Halaman 2');
  await expect(page.getByTestId('player-meta')).toContainText('Al-Baqarah');
  await expect(page.getByTestId('clip').nth(1)).toHaveAttribute('data-playing', 'true');
  await expect(page.getByTestId('library-count')).toHaveText('2 rekaman');

  await page.getByTestId('player-prev').click();
  await expect(page.getByTestId('player-title')).toHaveText('Ali satu');
  await expect(page.getByTestId('clip').first()).toHaveAttribute('data-playing', 'true');
});

test('the repeat button opens an explained drill sheet and reflects the mode', async ({ page }) => {
  await seed(page, [FIRST]);
  await page.getByTestId('clip-play').first().click();
  await page.getByTestId('player-toggle').click();

  const repeat = page.getByTestId('player-repeat');
  const sheet = page.getByTestId('repeat-sheet');
  await expect(repeat).toHaveText('Ulangi');

  await repeat.click();
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId('repeat-option-off')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('repeat-option-3')).toContainText('3×');

  await page.getByTestId('repeat-option-3').click();
  await expect(sheet).toBeHidden();
  await expect(repeat).toHaveText('3×');

  await repeat.click();
  await expect(page.getByTestId('repeat-option-3')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('repeat-option-all').click();
  await expect(repeat).toHaveText('Semua');

  await repeat.click();
  await page.getByTestId('repeat-option-one').click();
  await expect(repeat).toHaveText('Ulangi satu');

  // Escape dismisses the sheet without changing the mode.
  await repeat.click();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(repeat).toHaveText('Ulangi satu');
});

test('the scrubber seeks inside the clip instead of restarting it', async ({ page }) => {
  await seed(page, [{ ...FIRST, seconds: 10 }]);
  await page.getByTestId('clip-play').first().click();
  await expect(page.getByTestId('player-toggle')).toHaveText('Jeda');

  // Halfway through a ten-second clip: the readouts and the position agree.
  await page.getByTestId('player-scrubber').fill('500');
  await expect(page.getByTestId('player-elapsed')).toHaveText(/^0:0[4-6]$/);
  await expect(page.getByTestId('player-remaining')).toHaveText(/^−0:0[4-6]$/);

  await page.getByTestId('player-toggle').click();
  expect(await elapsedSeconds(page)).toBeGreaterThanOrEqual(4);
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
  await page.getByTestId('repeat-option-one').click();
  await expect(page.getByTestId('player-repeat')).toHaveText('Ulangi satu');
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
  await page.getByTestId('repeat-option-all').click();
  await expect(page.getByTestId('player-repeat')).toHaveText('Semua');
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
