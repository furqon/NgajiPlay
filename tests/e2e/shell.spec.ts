import { expect, test, type Page } from '@playwright/test';

/** Waits until a service worker controls the page (the shell calls clients.claim). */
async function waitForController(page: Page): Promise<void> {
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, undefined, {
    timeout: 20_000,
  });
}

/** Reads width and height straight out of the PNG IHDR chunk. */
function pngSize(buffer: Buffer): { width: number; height: number } {
  expect(buffer.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('shell renders as a secure, installable document', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');

  await expect(page).toHaveTitle('ngajiPlay');
  await expect(page.getByRole('heading', { name: 'ngajiPlay' })).toBeVisible();
  await expect(page.getByTestId('search-input')).toBeVisible();

  // Microphone, service workers and installability all require a secure context.
  expect(await page.evaluate(() => window.isSecureContext)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('id');

  // The manifest must be linked, or the browser will not offer installation.
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');

  expect(errors).toEqual([]);
});

test('manifest is valid and every icon matches its declared size', async ({ page, request }) => {
  await page.goto('/');

  const response = await request.get('/manifest.webmanifest');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/manifest+json');

  const manifest = await response.json();
  expect(manifest.name).toBe('ngajiPlay');
  expect(manifest.short_name).toBe('ngajiPlay');
  expect(manifest.start_url).toBe('/');
  expect(manifest.display).toBe('standalone');
  expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  expect(Array.isArray(manifest.icons)).toBe(true);

  // Chromium needs a 192px and a 512px icon before it offers installation.
  const sizes = new Set(manifest.icons.map((icon: { sizes: string }) => icon.sizes));
  expect(sizes.has('192x192')).toBe(true);
  expect(sizes.has('512x512')).toBe(true);
  expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(true);

  for (const icon of manifest.icons as Array<{ src: string; sizes: string; type: string }>) {
    const iconResponse = await request.get(icon.src);
    expect(iconResponse.status(), `${icon.src} should exist`).toBe(200);
    expect(iconResponse.headers()['content-type']).toContain('image/png');

    const actual = pngSize(await iconResponse.body());
    const [declaredWidth, declaredHeight] = icon.sizes.split('x').map(Number);
    expect(actual, `${icon.src} declared ${icon.sizes}`).toEqual({
      width: declaredWidth,
      height: declaredHeight,
    });
  }
});

test('service worker installs and the shell reports itself ready offline', async ({ page }) => {
  await page.goto('/');
  await waitForController(page);
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  // The dot says nothing on its own; the sentence is its tooltip and its name.
  await expect(page.getByTestId('status')).toHaveAttribute('title', 'Siap dipakai offline');
  await expect(page.getByTestId('status')).toHaveAttribute('aria-label', 'Siap dipakai offline');

  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names[0] ?? '');
    const requests = await cache.keys();
    return requests.map((request) => new URL(request.url).pathname);
  });

  // The shell and its hashed assets must be precached, not fetched later.
  expect(cached).toContain('/index.html');
  expect(cached.some((path) => path.endsWith('.js'))).toBe(true);
  expect(cached.some((path) => path.endsWith('.css'))).toBe(true);
  expect(cached).toContain('/icons/icon-192.png');
});

test('reloads from the cache with the network switched off', async ({ context, page }) => {
  await page.goto('/');
  await waitForController(page);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'ngajiPlay' })).toBeVisible();
    await expect(page.getByTestId('search-input')).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('fits a 390px phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // NFR-6: touch targets are at least 44px tall.
  const statusBox = await page.getByTestId('status').boundingBox();
  expect(statusBox?.height ?? 0).toBeGreaterThanOrEqual(44);
});
