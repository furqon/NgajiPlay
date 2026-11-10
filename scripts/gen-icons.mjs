// Renders the ngajiPlay mark to the PNG sizes the manifest and iOS need.
// Run with `npm run icons`. Output is committed, so a normal build does not
// need a browser installed.
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const DEEP = '#0e4a3c';
const CREAM = '#f6efdf';

/** @param {{ circle?: number, withBackground?: boolean }} options */
function markSvg({ circle = 176, withBackground = true } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  ${withBackground ? `<rect width="512" height="512" fill="${DEEP}"/>` : ''}
  <circle cx="256" cy="256" r="${circle}" fill="${CREAM}"/>
  <path d="M218 176 L346 256 L218 336 Z" fill="${DEEP}" stroke="${DEEP}" stroke-width="26" stroke-linejoin="round"/>
</svg>`;
}

const targets = [
  // name, size, svg options
  ['icon-192.png', 192, { circle: 176 }],
  ['icon-512.png', 512, { circle: 176 }],
  // Maskable icons are cropped to a circle by Android: keep the mark inside the
  // central 80% safe zone.
  ['icon-maskable-512.png', 512, { circle: 150 }],
  ['apple-touch-icon.png', 180, { circle: 176 }],
];

const outDir = new URL('../public/icons/', import.meta.url);
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' });
try {
  for (const [name, size, options] of targets) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<html><body style="margin:0;line-height:0">${markSvg({ ...options })}</body></html>`,
      { waitUntil: 'load' },
    );
    const png = await page.screenshot({ type: 'png' });
    await writeFile(new URL(name, outDir), png);
    console.log(`${name} ${size}x${size} ${png.length} B`);
    await page.close();
  }
} finally {
  await browser.close();
}

// Scalable favicon uses the same geometry, drawn on a transparent page so it
// works on both light and dark browser chrome.
await writeFile(new URL('../public/favicon.svg', import.meta.url), `${markSvg()}\n`);
console.log('favicon.svg written');
