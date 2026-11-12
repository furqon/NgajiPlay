import { expect, test, type Page } from '@playwright/test';
import { elapsedSeconds } from './helpers';

const DB_MODULE = '/src/store/db.ts';
const EXPORT_MODULE = '/src/recording/export.ts';
const CLIENT_ID = 'fake.apps.googleusercontent.com';

interface ExportedClip {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

interface DriveState {
  files: Array<{
    id: string;
    name: string;
    mimeType: string;
    modifiedTime: string;
  }>;
  mimeType: string;
  buffer: Buffer;
}

test.use({ viewport: { width: 390, height: 752 } });

async function installFakeGoogle(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const target = window as unknown as { google?: unknown };
    target.google = {
      accounts: {
        oauth2: {
          initTokenClient: (config: { callback: (response: unknown) => void }) => ({
            requestAccessToken: () => {
              setTimeout(() => {
                config.callback({
                  access_token: 'fake-access-token',
                  expires_in: 3_600,
                  scope:
                    'openid email https://www.googleapis.com/auth/drive.file',
                });
              }, 0);
            },
          }),
        },
      },
    };
  });
}

async function seedClip(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const db = await import(/* @vite-ignore */ modulePath);
    await db.clearAll();
    const blob = new Blob([new Uint8Array(2_048)], { type: 'audio/webm;codecs=opus' });
    await db.putClip(
      {
        id: '2:2',
        page: 2,
        surah: 2,
        ayahStart: 1,
        ayahEnd: 5,
        mimeType: 'audio/webm;codecs=opus',
        bytes: blob.size,
        durationMs: 4_000,
        createdAt: Date.UTC(2026, 10, 10, 9, 0),
        updatedAt: Date.UTC(2026, 10, 10, 9, 0),
        displayName: 'p002-s002.webm',
      },
      blob,
    );
  }, DB_MODULE);
}

async function recordClip(page: Page): Promise<ExportedClip> {
  await page.goto('/#/p/2');
  await page.getByTestId('record').first().click();
  await page.getByTestId('record-start').click();
  await expect(page.getByTestId('record-stop')).toBeVisible();
  await page.waitForTimeout(1_300);
  await page.getByTestId('record-stop').click();
  await expect(page.getByTestId('record-preview')).toBeVisible();
  await page.getByTestId('record-save').click();
  await expect(page.getByTestId('recorder-status')).toHaveText('Rekaman tersimpan.');

  const exported = await page.evaluate(
    async ({ dbPath, exportPath }) => {
      const db = await import(/* @vite-ignore */ dbPath);
      const record = await db.getClip('2:2');
      const exp = await import(/* @vite-ignore */ exportPath);
      return {
        name: exp.exportFileName(record),
        mimeType: record.mimeType as string,
        bytes: Array.from(new Uint8Array(await record.blob.arrayBuffer())),
      };
    },
    { dbPath: DB_MODULE, exportPath: EXPORT_MODULE },
  );

  return {
    name: exported.name,
    mimeType: exported.mimeType,
    buffer: Buffer.from(exported.bytes),
  };
}

async function fakeDrive(page: Page, clip: ExportedClip): Promise<DriveState> {
  const state: DriveState = {
    files: [],
    mimeType: clip.mimeType,
    buffer: clip.buffer,
  };

  await page.route('https://openidconnect.googleapis.com/**', (route) =>
    route.fulfill({ json: { email: 'penguji@example.com' } }),
  );

  await page.route('https://www.googleapis.com/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === '/drive/v3/files') {
      if (request.method() === 'GET') {
        const query = url.searchParams.get('q') ?? '';
        if (query.includes("name='ngajiPlay'")) {
          return route.fulfill({ json: { files: [{ id: 'folder-1' }] } });
        }
        return route.fulfill({ json: { files: state.files } });
      }
      if (request.method() === 'POST') {
        return route.fulfill({ json: { id: 'folder-1' } });
      }
    }

    if (url.pathname.startsWith('/upload/drive/v3/files') && request.method() === 'POST') {
      const body = request.postDataBuffer()?.toString('latin1') ?? '';
      const name = /"name":"([^"]+)"/.exec(body)?.[1] ?? 'unknown';
      state.files = [
        {
          id: 'drive-1',
          name,
          mimeType: state.mimeType,
          modifiedTime: new Date().toISOString(),
        },
      ];
      return route.fulfill({ json: { id: 'drive-1' } });
    }

    if (
      url.pathname === '/drive/v3/files/drive-1' &&
      url.searchParams.get('alt') === 'media'
    ) {
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': state.mimeType },
        body: state.buffer,
      });
    }

    return route.fulfill({
      status: 404,
      body: `Unexpected Google API request: ${request.method()} ${url}`,
    });
  });

  return state;
}

async function saveClientId(page: Page, clientId: string): Promise<void> {
  await page.goto('/#/settings');
  await page.getByTestId('google-client-id').fill(clientId);
  await page.getByTestId('google-client-id-save').click();
}

test('keeps Drive off by default and makes the client ID configurable in Settings', async ({
  page,
}) => {
  let googleRequests = 0;
  page.on('request', (request) => {
    if (
      request.url().startsWith('https://accounts.google.com/') ||
      request.url().startsWith('https://www.googleapis.com/') ||
      request.url().startsWith('https://openidconnect.googleapis.com/')
    ) {
      googleRequests += 1;
    }
  });

  await page.goto('/#/library');
  await expect(page.getByTestId('settings-link')).toBeVisible();
  await expect(page.getByTestId('drive')).toBeVisible();
  await expect(page.getByTestId('drive-open-settings')).toBeVisible();
  await expect(page.getByTestId('drive-connect')).toHaveCount(0);
  expect(googleRequests).toBe(0);

  await page.getByTestId('drive-open-settings').click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByTestId('settings-google')).toBeVisible();

  await page.getByTestId('google-client-id').fill('not-a-client-id');
  await page.getByTestId('google-client-id-save').click();
  await expect(page.getByTestId('settings-status')).toHaveText(
    'Client ID harus berakhiran .apps.googleusercontent.com.',
  );

  await page.getByTestId('google-client-id').fill(CLIENT_ID);
  await page.getByTestId('google-client-id-save').click();
  await expect(page.getByTestId('settings-status')).toHaveText('Client ID disimpan.');

  await page.goto('/#/library');
  await expect(page.getByTestId('drive-connect')).toBeVisible();
});

test('queues an explicit backup while offline and retries when the connection returns', async ({
  page,
}) => {
  await installFakeGoogle(page);
  const dummy: ExportedClip = {
    name: 'p002-s002.webm',
    mimeType: 'audio/webm;codecs=opus',
    buffer: Buffer.from('audio'),
  };
  await fakeDrive(page, dummy);
  await seedClip(page);
  await saveClientId(page, CLIENT_ID);

  await page.goto('/#/library');
  await page.getByTestId('drive-connect').click();
  await expect(page.getByTestId('drive-connected')).toBeVisible();

  await page.context().setOffline(true);
  await expect(page.getByTestId('drive-offline')).toHaveText(
    'Sambungkan internet untuk memakai Google Drive.',
  );
  await page.getByTestId('drive-backup-all').click();
  await expect(page.getByTestId('drive-status')).toContainText(
    'Cadangan selesai: 0 terunggah, 0 gagal, 1 menunggu.',
  );
  await expect(page.getByTestId('clip-backup-status')).toHaveAttribute(
    'data-state',
    'pending',
  );

  await page.context().setOffline(false);
  await expect(page.getByTestId('clip-backup-status')).toHaveAttribute(
    'data-state',
    'uploaded',
  );
});

test('backs up to a fake Drive, then restores into a fresh library and plays it', async ({
  page,
}) => {
  await installFakeGoogle(page);
  const clip = await recordClip(page);
  const drive = await fakeDrive(page, clip);

  await saveClientId(page, CLIENT_ID);
  await expect(page.getByTestId('settings-status')).toHaveText('Client ID disimpan.');

  await page.goto('/#/library');
  await expect(page.getByTestId('drive-connect')).toBeVisible();
  await page.getByTestId('drive-connect').click();

  await expect(page.getByTestId('drive-connected')).toContainText('penguji@example.com');
  await expect(page.getByTestId('drive-connected')).toHaveAttribute(
    'data-scope',
    /drive\.file/,
  );

  await page.getByTestId('drive-backup-all').click();
  await expect(page.getByTestId('drive-status')).toContainText('Cadangan selesai');
  await expect(page.getByTestId('clip-backup-status')).toHaveAttribute(
    'data-state',
    'uploaded',
  );
  expect(drive.files).toHaveLength(1);
  expect(drive.files[0]?.name).toBe(clip.name);

  await page.evaluate(
    async ({ modulePath, clientId }) => {
      const db = await import(/* @vite-ignore */ modulePath);
      await db.clearAll();
      await db.setSetting('googleClientId', clientId);
    },
    { modulePath: DB_MODULE, clientId: CLIENT_ID },
  );
  await page.reload();
  await page.goto('/#/library');

  await expect(page.getByTestId('library-empty')).toBeVisible();
  await expect(page.getByTestId('drive-connect')).toBeVisible();
  await page.getByTestId('drive-connect').click();
  await expect(page.getByTestId('drive-connected')).toBeVisible();

  await page.getByTestId('drive-restore').click();
  await expect(page.getByTestId('import-panel')).toBeVisible();
  await expect(page.getByTestId('import-row')).toHaveCount(1);
  await expect(page.getByTestId('import-row-new')).toBeVisible();
  await expect(page.getByTestId('import-row-meta')).toContainText(clip.name);

  await page.getByTestId('import-apply').click();
  await expect(page.getByTestId('import-outcome')).toHaveText('Diimpor');
  await expect(page.getByTestId('clip-name')).toHaveText(clip.name);

  await page.getByTestId('clip-play').click();
  await expect(page.getByTestId('player-title')).toHaveText(clip.name);
  await expect.poll(() => elapsedSeconds(page), { timeout: 6_000 }).toBeGreaterThan(0);
});
