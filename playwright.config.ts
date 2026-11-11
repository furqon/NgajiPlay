import { defineConfig } from '@playwright/test';

const PREVIEW_PORT = 4173;
const DEV_PORT = 5173;
const previewURL = `http://localhost:${PREVIEW_PORT}`;
const devURL = `http://localhost:${DEV_PORT}`;

// Only Edge is installed on this machine, so no browser download is needed.
// Set PW_CHANNEL=chromium after `npx playwright install chromium` elsewhere.
const channel = process.env.PW_CHANNEL ?? 'msedge';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  use: {
    channel,
    trace: 'retain-on-failure',
    permissions: ['microphone'],
    launchOptions: {
      // Chromium's fake capture device is real enough to exercise getUserMedia,
      // MediaRecorder, IndexedDB and decoding; headless has no microphone.
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  projects: [
    // The shipped build: manifest, service worker, offline reload.
    { name: 'shell', testMatch: /shell\.spec\.ts/, use: { baseURL: previewURL } },
    // The dev server: source modules can be imported into the page, so real
    // IndexedDB and real data files are exercised without duplicating logic.
    {
      name: 'data',
      testMatch: /(data|ui|record|library|player|follow|i18n|install)\.spec\.ts/,
      use: { baseURL: devURL },
    },
  ],
  webServer: [
    {
      command: `npm run preview -- --port ${PREVIEW_PORT} --strictPort`,
      url: previewURL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `npm run dev -- --port ${DEV_PORT} --strictPort`,
      url: devURL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
