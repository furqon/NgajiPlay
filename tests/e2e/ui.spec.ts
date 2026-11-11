import { expect, test } from '@playwright/test';

/**
 * Runs against the Vite dev server so the real store module can seed
 * IndexedDB. The search screen and page view are the shipped UI either way.
 */
const DB_MODULE = '/src/store/db.ts';

test('page 2 renders with the measured typography and marks the surah boundary', async ({
  page,
}) => {
  await page.goto('/#/p/2');
  await expect(page.getByTestId('mushaf')).toBeVisible();
  await expect(page.getByTestId('page-number')).toHaveText('Halaman 2 dari 604');

  const styles = await page.locator('.ayahs').first().evaluate((node) => {
    const computed = getComputedStyle(node);
    return {
      fontSize: computed.fontSize,
      lineHeight: computed.lineHeight,
      textAlign: computed.textAlign,
      direction: computed.direction,
      family: computed.fontFamily,
    };
  });

  // REQ §8.2 measured these values; a change here is a deliberate re-open.
  expect(styles.fontSize).toBe('26px');
  expect(styles.lineHeight).toBe('52px');
  expect(styles.textAlign).toBe('justify');
  expect(styles.direction).toBe('rtl');
  expect(styles.family).toContain('Amiri Quran');

  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('26px "Amiri Quran"'))).toBe(true);

  // Al-Baqarah starts on this page: one header, the basmala once, five ayahs.
  await expect(page.getByTestId('surah-header')).toHaveCount(1);
  await expect(page.getByTestId('surah-header')).toHaveAttribute('data-surah', '2');
  await expect(page.getByTestId('surah-header')).toContainText('Al-Baqarah');
  await expect(page.getByTestId('basmala')).toHaveCount(1);
  await expect(page.locator('.ayah')).toHaveCount(5);

  // FR-1.3: the ayah number sits inside the enclosing medallion.
  await expect(page.locator('.ayah-mark').first()).toHaveText('۝١');
  await expect(page.locator('.ayah-mark').last()).toHaveText('۝٥');

  // One slice on the page, with its state (FR-1.5).
  await expect(page.getByTestId('slice')).toHaveCount(1);
  await expect(page.getByTestId('slice')).toContainText('Ayat 1–5');
});

test('page 604 has three surah headers and no doubled basmala', async ({ page }) => {
  await page.goto('/#/p/604');

  const headers = page.getByTestId('surah-header');
  await expect(headers).toHaveCount(3);
  await expect(headers.nth(0)).toContainText('Al-Ikhlas');
  await expect(headers.nth(2)).toContainText('An-Nas');
  await expect(page.locator('.ayah')).toHaveCount(15);

  // 112, 113 and 114 each start here, so exactly three basmalas — one per
  // header, none left inside ayah 1 (REQ §8.1 trap).
  await expect(page.getByTestId('basmala')).toHaveCount(3);
  const basmala = (await page.getByTestId('basmala').first().textContent())?.trim() ?? '';
  const firstAyah =
    (await page.locator('.ayah[data-surah="112"][data-ayah="1"]').textContent())?.trim() ?? '';
  expect(basmala.length).toBeGreaterThan(0);
  expect(firstAyah.startsWith(basmala)).toBe(false);
});

test('page 1 keeps 1:1 as the basmala instead of splitting it', async ({ page }) => {
  await page.goto('/#/p/1');

  await expect(page.getByTestId('surah-header')).toHaveCount(1);
  await expect(page.getByTestId('surah-header')).toContainText('Al-Fatihah');
  await expect(page.getByTestId('basmala')).toHaveCount(0);
  await expect(page.locator('.ayah')).toHaveCount(7);
  await expect(page.locator('.ayah-mark').last()).toHaveText('۝٧');
});

test('previous and next page navigation stops at both ends', async ({ page }) => {
  await page.goto('/#/p/1');
  await expect(page.getByTestId('page-prev')).toHaveAttribute('aria-disabled', 'true');

  await page.getByTestId('page-next').click();
  await expect(page.getByTestId('page-number')).toHaveText('Halaman 2 dari 604');
  await expect(page).toHaveURL(/#\/p\/2$/);

  await page.goto('/#/p/604');
  await expect(page.getByTestId('page-next')).toHaveAttribute('aria-disabled', 'true');
  await page.getByTestId('page-prev').click();
  await expect(page.getByTestId('page-number')).toHaveText('Halaman 603 dari 604');
});

test('a page outside 1–604 shows the designed error, not a crash', async ({ page }) => {
  await page.goto('/#/p/999');
  await expect(page.getByTestId('page-error')).toContainText('999');
  await expect(page.getByTestId('page-error')).toContainText('1 sampai 604');
  await expect(page.getByTestId('mushaf')).toHaveCount(0);
});

test('search accepts a page number and a surah name, and opens the page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('tagline')).not.toBeEmpty();
  await expect(page.getByTestId('search-state')).toContainText('1–604');

  await page.getByTestId('search-input').fill('100');
  // Page 100, plus surah 100 (Al-'Adiyat) which starts on p599 — both rows are
  // labelled with their surahs, so neither is a guess at intent.
  await expect(page.getByTestId('result')).toHaveCount(2);
  await expect(page.getByTestId('result').first()).toContainText('Halaman 100');
  await expect(page.getByTestId('result').first()).toContainText('An-Nisa');
  await expect(page.getByTestId('result').nth(1)).toContainText("Al-'Adiyat");

  await page.getByTestId('search-input').fill('Al-Baqarah');
  await expect(page.getByTestId('result')).toHaveCount(1);
  await page.getByTestId('result').click();
  await expect(page).toHaveURL(/#\/p\/2$/);
  await expect(page.getByTestId('surah-header')).toContainText('Al-Baqarah');

  // Going back restores the last query instead of an empty field.
  await page.getByTestId('back').click();
  await expect(page.getByTestId('search-input')).toHaveValue('Al-Baqarah');
});

test('invalid and empty searches say what went wrong', async ({ page }) => {
  await page.goto('/');
  const input = page.getByTestId('search-input');

  await input.fill('605');
  await expect(page.getByTestId('search-state')).toHaveText('Nomor halaman harus 1 sampai 604.');
  await expect(page.getByTestId('result')).toHaveCount(0);

  await input.fill('zzzz');
  await expect(page.getByTestId('search-state')).toContainText('Tidak ada halaman atau surah');
  await expect(page.getByTestId('result')).toHaveCount(0);

  // A small number is both a page and a surah number: two rows, no guessing.
  await input.fill('18');
  await expect(page.getByTestId('result')).toHaveCount(2);
  await expect(page.getByTestId('result').nth(1)).toContainText('Al-Kahf');
});

test('a recorded slice is marked as recorded', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const db = await import(/* @vite-ignore */ modulePath);
    const blob = new Blob(['phase-2-seed'], { type: 'audio/webm;codecs=opus' });
    await db.putClip(
      {
        id: db.clipId(2, 2),
        page: 2,
        surah: 2,
        ayahStart: 1,
        ayahEnd: 5,
        mimeType: blob.type,
        bytes: blob.size,
        durationMs: 1000,
        createdAt: Date.now(),
        displayName: 'p002-s002-al-baqarah',
      },
      blob,
    );
  }, DB_MODULE);

  await page.goto('/#/p/2');
  const slice = page.getByTestId('slice');
  await expect(slice).toHaveAttribute('data-recorded', 'true');
  await expect(slice.locator('.badge')).toHaveText('Sudah direkam');
});

test('the how-to icon opens a modal with the three steps, and it closes', async ({ page }) => {
  await page.goto('/');

  // Nothing is drawn over the search box until it is asked for.
  const dialog = page.getByTestId('how-to');
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('first-run-hint')).toHaveCount(0);

  await page.getByTestId('how-to-open').click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Cara pakai');
  await expect(dialog.locator('li')).toHaveCount(3);
  await expect(dialog.locator('li').nth(0)).toContainText('Cari halaman');
  await expect(dialog.locator('li').nth(1)).toContainText('rekam');
  await expect(dialog.locator('li').nth(2)).toContainText('Putar ulang');

  await page.getByTestId('how-to-close').click();
  await expect(dialog).toBeHidden();

  // Escape closes it too, so the modal never traps a reader.
  await page.getByTestId('how-to-open').click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('the search screen lists all 114 surahs, each opening on its first page', async ({ page }) => {
  await page.goto('/');

  const links = page.getByTestId('surah-link');
  await expect(links).toHaveCount(114);
  await expect(links.first()).toContainText('Al-Fatihah');
  await expect(links.first()).toHaveAttribute('href', '#/p/1');
  await expect(links.last()).toContainText('An-Nas');
  await expect(links.last()).toHaveAttribute('href', '#/p/604');

  // Al-Baqarah opens on page 2; An-Nas on the last page of the mushaf.
  await page.locator('[data-testid="surah-link"][data-surah="2"]').click();
  await expect(page).toHaveURL(/#\/p\/2$/);
  await expect(page.getByTestId('surah-header')).toContainText('Al-Baqarah');

  await page.getByTestId('back').click();
  await page.locator('[data-testid="surah-link"][data-surah="114"]').click();
  await expect(page).toHaveURL(/#\/p\/604$/);
  await expect(page.getByTestId('surah-header').last()).toContainText('An-Nas');
});

test('the page view fits a 390px phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/p/100');
  await expect(page.locator('.ayah')).toHaveCount(6);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // NFR-6: the pager controls are at least 44px.
  const step = await page.getByTestId('page-next').boundingBox();
  expect(step?.height ?? 0).toBeGreaterThanOrEqual(44);
});
