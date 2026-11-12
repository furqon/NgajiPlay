import { expect, test } from '@playwright/test';

/**
 * FR-7.1: Android/Chrome gets a one-tap install, iPhone/iPad gets the Share-sheet
 * path. The prompt is simulated, because a headless browser never offers one.
 */

test('the install icon appears only when the browser offers a prompt, and uses it', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __prompted: number };
    w.__prompted = 0;

    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    };
    event.prompt = () => {
      w.__prompted += 1;
      return Promise.resolve();
    };
    event.userChoice = Promise.resolve({ outcome: 'accepted' });

    // The app subscribes after loading the stored language from IndexedDB.
    setTimeout(() => window.dispatchEvent(event), 600);
  });

  await page.goto('/');

  // Nothing is offered yet, so nothing is shown.
  await expect(page.getByTestId('install')).toBeHidden();

  const install = page.getByTestId('install');
  await expect(install).toBeVisible();
  await expect(install).toHaveAttribute('aria-label', 'Pasang aplikasi');

  await install.click();
  expect(await page.evaluate(() => (window as unknown as { __prompted: number }).__prompted)).toBe(
    1,
  );
  await expect(install).toBeHidden();
});

test('without a prompt the icon stays hidden and the how-to explains the menu', async ({
  page,
}) => {
  await page.goto('/#/settings');

  await expect(page.getByTestId('install')).toBeHidden();

  await page.getByTestId('how-to-open').click();
  await expect(page.getByTestId('install-guidance')).toContainText('Pasang aplikasi');
  await expect(page.getByTestId('install-guidance')).toContainText('Android');
});

test.describe('iPhone', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });

  test('iPhone users are told the Share-sheet way instead', async ({ page }) => {
    await page.goto('/#/settings');
    await page.getByTestId('how-to-open').click();

    await expect(page.getByTestId('install-guidance')).toContainText('Tambah ke Layar Utama');
    await expect(page.getByTestId('install')).toBeHidden();
  });
});
