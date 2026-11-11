import { expect, test, type Page } from '@playwright/test';
import { DB_MODULE } from './helpers';

/**
 * Phase 7: the ID/EN switcher, the About screen's licence text, and neither
 * language overflowing a phone or the desktop column.
 */
test.use({ viewport: { width: 390, height: 752 } });

async function storedLanguage(page: Page): Promise<string> {
  return page.evaluate(async (modulePath) => {
    const db = await import(/* @vite-ignore */ modulePath);
    return (await db.getSetting('language', 'id')) as string;
  }, DB_MODULE);
}

async function noSidewaysScroll(page: Page): Promise<void> {
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
}

test('the language switch repaints the app and survives a reload (FR-7.3)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('tagline')).toContainText('Rekam bacaan');
  await expect(page.getByTestId('language-id')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('language-en')).toHaveAttribute('aria-pressed', 'false');

  await page.getByTestId('language-en').click();

  await expect(page.getByTestId('language-en')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('tagline')).toContainText('Record your child');
  await expect(page.getByRole('button', { name: 'Search' })).toBeVisible();
  await expect(page.getByTestId('search-input')).toHaveAttribute(
    'placeholder',
    'For example: 100, 2, Al-Baqarah',
  );
  await expect(page.getByTestId('about-link')).toHaveText('About');
  await expect(page.getByTestId('library-link')).toHaveText('Library');

  // Persisted, not just repainted (the write is async, so wait for the store).
  await expect.poll(() => storedLanguage(page)).toBe('en');
  await page.reload();
  await expect(page.getByTestId('tagline')).toContainText('Record your child');
  await expect(page.getByTestId('language-en')).toHaveAttribute('aria-pressed', 'true');

  // And back, with the Indonesian copy intact.
  await page.getByTestId('language-id').click();
  await expect(page.getByTestId('tagline')).toContainText('Rekam bacaan');
  await expect(page.getByTestId('about-link')).toHaveText('Tentang');
  await expect.poll(() => storedLanguage(page)).toBe('id');
  await page.reload();
  await expect(page.getByTestId('tagline')).toContainText('Rekam bacaan');
});

test('English screens fit a 390px phone without being cut off', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('language-en').click();

  // How-it-works lives behind the header icon now; it must render in English.
  await page.getByTestId('how-to-open').click();
  await expect(page.getByTestId('how-to')).toContainText('How it works');
  await page.getByTestId('how-to-close').click();

  // The surah index uses the English names when English is chosen.
  await expect(page.locator('[data-testid="surah-link"][data-surah="108"]')).toContainText(
    'Al-Kawthar',
  );
  await noSidewaysScroll(page);

  await page.getByTestId('library-link').click();
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
  await expect(page.getByTestId('library-empty')).toContainText('No recordings yet');
  await expect(page.getByTestId('storage-usage')).toContainText('quota');
  await noSidewaysScroll(page);

  await page.goto('/#/p/604');
  await expect(page.getByTestId('page-number')).toHaveText('Page 604 of 604');
  await expect(page.getByRole('heading', { name: 'Parts of this page' })).toBeVisible();
  await expect(page.getByTestId('slice').first()).toContainText('Not recorded');
  await noSidewaysScroll(page);

  await page.goto('/#/about');
  await expect(page.getByRole('heading', { name: 'About ngajiPlay' })).toBeVisible();
  await noSidewaysScroll(page);
});

test('the About screen credits Tanzil verbatim and ships the OFL notice (FR-7.5)', async ({
  page,
}) => {
  await page.goto('/#/about');
  const about = page.getByTestId('about');
  await expect(about).toContainText('Tanzil Quran Text');

  await expect(page.getByTestId('tanzil-link')).toHaveAttribute('href', 'https://tanzil.net');
  await expect(page.getByTestId('tanzil-link')).toHaveAttribute('rel', 'noopener noreferrer');

  // The block on screen is byte-identical to the one inside the data file.
  const bundled = await page.evaluate(async (modulePath) => {
    const data = await import(/* @vite-ignore */ modulePath);
    const quran = await data.loadQuran();
    return quran.meta.copyright as string;
  }, '/src/data/quran.ts');
  expect(await page.getByTestId('copyright').textContent()).toBe(bundled);
  expect(bundled).toContain('Tanzil');

  await expect(page.getByTestId('ofl-link')).toHaveAttribute('href', '/fonts/OFL.txt');
  const licence = await page.request.get('/fonts/OFL.txt');
  expect(licence.status()).toBe(200);
  expect(await licence.text()).toContain('SIL OPEN FONT LICENSE');

  await page.getByTestId('language-en').click();
  await expect(page.getByTestId('tanzil-link')).toHaveText('Open tanzil.net');
  await expect(page.getByTestId('ofl-link')).toHaveText('Read the OFL licence');
  expect(await page.getByTestId('copyright').textContent()).toBe(bundled);
});

test('the desktop layout keeps its reading column and safe spacing (FR-7.4)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#/about');
  await page.getByTestId('language-en').click();

  const column = await page.locator('.view').evaluate((node) => node.getBoundingClientRect().width);
  expect(column).toBeLessThanOrEqual(720);
  await noSidewaysScroll(page);

  const target = await page.getByTestId('language-en').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(target.height).toBeGreaterThanOrEqual(44);
  expect(target.width).toBeGreaterThanOrEqual(44);
});
