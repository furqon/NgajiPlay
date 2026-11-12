import { expect, test } from '@playwright/test';
import { seed, type SeedClip } from './helpers';

test.use({ viewport: { width: 390, height: 752 } });

const P506: SeedClip = {
  id: '506:56',
  page: 506,
  surah: 56,
  from: 1,
  to: 3,
  name: 'Halaman lima nol enam',
  seconds: 0.6,
};
const P507: SeedClip = {
  id: '507:57',
  page: 507,
  surah: 57,
  from: 1,
  to: 2,
  name: 'Halaman lima nol tujuh',
  seconds: 0.6,
};
const ELSEWHERE: SeedClip = {
  id: '1:1',
  page: 1,
  surah: 1,
  from: 1,
  to: 7,
  name: 'Halaman satu',
  seconds: 0.6,
};

test('plays the chosen pages as a temporary playlist and repeats the whole list', async ({
  page,
}) => {
  await seed(page, [P506, P507, ELSEWHERE]);
  await page.goto('/');
  await page.getByTestId('tab-latihan').click();

  await page.getByTestId('playlist-pages').fill('506, 507');
  await page.getByTestId('playlist-repeat').fill('2');
  await page.getByTestId('playlist-play').click();

  await expect(page.getByTestId('player-title')).toHaveText('Halaman lima nol enam');
  await expect(page.getByTestId('page-number')).toContainText('Halaman 506');
  await expect(page.getByTestId('player-playlist')).toHaveText('Daftar putar 1/2');

  await expect(page.getByTestId('player-title')).toHaveText('Halaman lima nol tujuh', {
    timeout: 6_000,
  });

  await expect(page.getByTestId('player-title')).toHaveText('Halaman lima nol enam', {
    timeout: 6_000,
  });
  await expect(page.getByTestId('player-playlist')).toHaveText('Daftar putar 2/2');

  await expect(page.getByTestId('player-title')).toHaveText('Halaman lima nol tujuh', {
    timeout: 6_000,
  });

  await expect(page.getByTestId('player-toggle')).toHaveText('Putar', { timeout: 6_000 });
  await expect(page.getByTestId('player-title')).toHaveText('Halaman lima nol tujuh');
});

test('rejects page input that is not 1–604 and starts nothing', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tab-latihan').click();

  await page.getByTestId('playlist-pages').fill('506, 700');
  await page.getByTestId('playlist-play').click();

  await expect(page.getByTestId('playlist-status')).toHaveText(
    'Isi nomor halaman 1–604, dipisahkan koma atau spasi.',
  );
  await expect(page.getByTestId('player')).toBeHidden();
});

test('says so when the chosen pages have no recordings yet', async ({ page }) => {
  await seed(page, [ELSEWHERE]);
  await page.goto('/');
  await page.getByTestId('tab-latihan').click();

  await page.getByTestId('playlist-pages').fill('506, 507');
  await page.getByTestId('playlist-play').click();

  await expect(page.getByTestId('playlist-status')).toHaveText(
    'Belum ada rekaman di halaman 506, 507.',
  );
  await expect(page.getByTestId('player')).toBeHidden();
});
