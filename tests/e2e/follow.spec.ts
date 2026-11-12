import { expect, test } from '@playwright/test';
import { elapsedSeconds, playingAyahVisible, seed, type SeedClip } from './helpers';

/**
 * Phase 6: the page travels with the audio (FR-6.1–6.4).
 *
 * Page 604 carries three surahs (112, 113, 114), so the highlight can be shown
 * to match one clip's range rather than the whole page.
 */
test.use({ viewport: { width: 390, height: 752 } });

const P604: SeedClip[] = [
  { id: '604:112', page: 604, surah: 112, from: 1, to: 4, name: 'Ali 112', seconds: 8 },
  { id: '604:113', page: 604, surah: 113, from: 1, to: 5, name: 'Ali 113', seconds: 8 },
  { id: '604:114', page: 604, surah: 114, from: 1, to: 6, name: 'Ali 114', seconds: 8 },
];

const FATIHAH: SeedClip = {
  id: '1:1',
  page: 1,
  surah: 1,
  from: 1,
  to: 7,
  name: 'Ali Fatihah',
  seconds: 8,
};

test('playing a clip opens its page and marks only that clip’s ayahs', async ({ page }) => {
  await seed(page, P604);
  await page.getByTestId('clip-play').nth(1).click();

  await expect(page).toHaveURL(/#\/p\/604$/);
  await expect(page.getByTestId('page-number')).toContainText('Halaman 604');
  await expect(page.getByTestId('surah-header')).toHaveCount(3);

  const marks = page.locator('[data-ayah-playing="true"]');
  await expect(marks).toHaveCount(5);
  // 113:1–5, not the 4 ayahs of 112 or the 6 of 114.
  expect(await marks.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-surah'))))
    .toEqual(['113', '113', '113', '113', '113']);
  expect(await marks.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-ayah')),
  )).toEqual(['1', '2', '3', '4', '5']);

  await expect(page.getByTestId('player-title')).toHaveText('Ali 113');
  await expect(page.getByTestId('player-toggle')).toHaveText('Jeda');
});

test('next follows the track to the new page', async ({ page }) => {
  await seed(page, [FATIHAH, { ...P604[0]! }]);
  await page.getByTestId('clip-play').first().click();

  await expect(page).toHaveURL(/#\/p\/1$/);
  await expect(page.locator('[data-ayah-playing="true"]')).toHaveCount(7);

  await page.getByTestId('player-next').click();

  // FR-6.4: the view follows, because the reader was watching the playing page.
  await expect(page).toHaveURL(/#\/p\/604$/);
  await expect(page.getByTestId('player-title')).toHaveText('Ali 112');
  const marks = page.locator('[data-ayah-playing="true"]');
  await expect(marks).toHaveCount(4);
  expect(await marks.first().getAttribute('data-surah')).toBe('112');
});

test('scrolling away never pauses the audio and offers a way back', async ({ page }) => {
  await seed(page, [P604[0]!]);
  await page.getByTestId('clip-play').first().click();
  await expect(page).toHaveURL(/#\/p\/604$/);
  await expect(page.locator('[data-ayah-playing="true"]')).toHaveCount(4);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

  const follow = page.getByTestId('follow');
  await expect(follow).toBeVisible();
  await expect(follow).toHaveText('Kembali ke ayat yang diputar');

  // The point of the whole phase: reading away does not stop the recitation.
  await expect(page.getByTestId('player-toggle')).toHaveText('Jeda');
  const before = await elapsedSeconds(page);
  await expect.poll(() => elapsedSeconds(page), { timeout: 6_000 }).toBeGreaterThan(before);

  await follow.click();
  await expect.poll(() => playingAyahVisible(page), { timeout: 6_000 }).toBe(true);
  await expect(follow).toBeHidden();
});

test('leaving the page offers a way back without pausing', async ({ page }) => {
  await seed(page, [FATIHAH]);
  await page.getByTestId('clip-play').first().click();
  await expect(page.getByTestId('page-number')).toContainText('Halaman 1');

  await page.getByTestId('library-link').click();
  await expect(page.getByTestId('library-count')).toHaveText('1 rekaman');

  const follow = page.getByTestId('follow');
  await expect(follow).toBeVisible();
  await expect(follow).toHaveText('Buka halaman yang diputar');
  await expect(page.getByTestId('player-toggle')).toHaveText('Jeda');

  // The follow strip and the seek bar keep their own full-width rows on a phone.
  const wide = await page.evaluate(() => ({
    viewport: window.innerWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(wide.viewport).toBe(390);
  expect(wide.page).toBeLessThanOrEqual(wide.viewport);
  for (const id of ['follow', 'player-scrubber', 'player-toggle']) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(wide.viewport);
  }

  await follow.click();

  await expect(page).toHaveURL(/#\/p\/1$/);
  await expect(page.getByTestId('player-title')).toHaveText('Ali Fatihah');
  await expect(page.locator('[data-ayah-playing="true"]')).toHaveCount(7);
  await expect.poll(() => playingAyahVisible(page), { timeout: 6_000 }).toBe(true);
  await expect(page.getByTestId('player-toggle')).toHaveText('Jeda');
});
