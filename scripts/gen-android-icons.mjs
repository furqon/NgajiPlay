// Renders the ngajiPlay mark into the Android project's launcher icons and
// splash screens. Run with `npm run icons:android` after `npx cap add android`.
// Output is committed, so a normal build does not need a browser installed.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const DEEP = '#0e4a3c';
const CREAM = '#f6efdf';

/** The same mark as `scripts/gen-icons.mjs`, at any canvas size. */
function markSvg({ size, circle, background = true }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
  ${background ? `<rect width="512" height="512" fill="${DEEP}"/>` : ''}
  <circle cx="256" cy="256" r="${circle}" fill="${CREAM}"/>
  <path d="M218 176 L346 256 L218 336 Z" fill="${DEEP}" stroke="${DEEP}" stroke-width="26" stroke-linejoin="round"/>
</svg>`;
}

const res = new URL('../android/app/src/main/res/', import.meta.url);

// Launcher densities: mdpi is the 1x baseline, xxxhdpi the 4x one.
const densities = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];

// The adaptive foreground is 108dp; the mark must stay inside the 66dp circle
// Android guarantees to be visible whatever shape the launcher masks it to.
const foregrounds = [
  ['mdpi', 108],
  ['hdpi', 162],
  ['xhdpi', 216],
  ['xxhdpi', 324],
  ['xxxhdpi', 432],
];

/** Width and height straight out of the PNG IHDR chunk. */
function pngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const splashFiles = [];
for (const entry of await readdir(res, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith('drawable')) continue;
  const files = await readdir(new URL(`${entry.name}/`, res));
  for (const file of files) {
    if (file === 'splash.png') splashFiles.push(`${entry.name}/${file}`);
  }
}

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' });

async function render(html, width, height, outUrl) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;line-height:0;overflow:hidden">${html}</body></html>`, {
    waitUntil: 'load',
  });
  await writeFile(outUrl, await page.screenshot({ type: 'png' }));
  await page.close();
}

try {
  for (const [density, size] of densities) {
    const png = new URL(`mipmap-${density}/ic_launcher.png`, res);
    await render(markSvg({ size, circle: 176 }), size, size, png);
    await writeFile(new URL(`mipmap-${density}/ic_launcher_round.png`, res), await readFile(png));
    console.log(`mipmap-${density} launcher ${size}x${size}`);
  }

  for (const [density, size] of foregrounds) {
    await render(markSvg({ size, circle: 150, background: false }), size, size, new URL(`mipmap-${density}/ic_launcher_foreground.png`, res));
    console.log(`mipmap-${density} foreground ${size}x${size}`);
  }

  // Splash screens keep each file's existing pixel size, so the aspect ratios
  // the template chose still match every orientation and density.
  for (const relative of splashFiles) {
    const url = new URL(relative, res);
    const { width, height } = pngSize(await readFile(url));
    const mark = Math.round(Math.min(width, height) * 0.42);
    await render(
      `<div style="width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center;background:${DEEP}">
        ${markSvg({ size: mark, circle: 176, background: false })}
      </div>`,
      width,
      height,
      url,
    );
    console.log(`${relative} ${width}x${height}`);
  }
} finally {
  await browser.close();
}
