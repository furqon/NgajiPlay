import { beforeEach, describe, expect, it } from 'vitest';
import {
  backupStatus,
  processBackupQueue,
  queueBackup,
  restoreDriveFiles,
  type BackupContext,
} from '../../src/drive/backup';
import type { DriveFile, DriveTransport } from '../../src/drive/client';
import { DriveNetworkError } from '../../src/drive/errors';
import { clearAll, getBackup, putClip } from '../../src/store/db';
import type { Clip } from '../../src/types';

const CREATED = Date.UTC(2026, 10, 10, 9, 0);

function clip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: '2:2',
    page: 2,
    surah: 2,
    ayahStart: 1,
    ayahEnd: 5,
    mimeType: 'audio/webm;codecs=opus',
    bytes: 12,
    durationMs: 4_321,
    createdAt: CREATED,
    updatedAt: CREATED,
    displayName: 'p002-s002-al-baqarah-a001-005.webm',
    ...overrides,
  };
}

interface Upload {
  clip: Clip;
  bytes: number;
  fileId?: string;
}

function transport(
  uploads: Upload[],
  options: { fail?: (count: number) => Error | null; files?: DriveFile[] } = {},
): DriveTransport {
  let count = 0;
  return {
    async uploadClip(item, blob, fileId) {
      count += 1;
      const failure = options.fail?.(count);
      if (failure) throw failure;
      uploads.push({ clip: item, bytes: blob.size, fileId });
      return fileId ?? `drive-${count}`;
    },
    async listClips() {
      return options.files ?? [];
    },
    async downloadFile(file) {
      return new Blob([`audio:${file.id}`], { type: file.mimeType });
    },
  };
}

function context(overrides: Partial<BackupContext> = {}): BackupContext {
  return {
    transport: transport([]),
    isConnected: () => true,
    isOnline: () => true,
    ...overrides,
  };
}

beforeEach(async () => {
  await clearAll();
});

describe('backupStatus', () => {
  it('only calls an upload current when the clip has not changed', () => {
    expect(backupStatus(clip())).toBe('none');
    expect(
      backupStatus(clip({ updatedAt: CREATED + 1 }), {
        id: '2:2',
        state: 'uploaded',
        fileId: 'drive-1',
        clipUpdatedAt: CREATED,
        updatedAt: CREATED + 1,
      }),
    ).toBe('none');
    expect(
      backupStatus(clip(), {
        id: '2:2',
        state: 'uploaded',
        fileId: 'drive-1',
        clipUpdatedAt: CREATED,
        updatedAt: CREATED + 1,
      }),
    ).toBe('uploaded');
    expect(
      backupStatus(clip(), {
        id: '2:2',
        state: 'failed',
        clipUpdatedAt: CREATED,
        updatedAt: CREATED + 1,
      }),
    ).toBe('failed');
  });
});

describe('upload queue', () => {
  it('stores the Drive id and updates the same file on the next backup', async () => {
    await putClip(clip(), new Blob(['first']));
    const uploads: Upload[] = [];
    const ctx = context({ transport: transport(uploads) });

    await queueBackup(['2:2'], ctx);
    expect(uploads).toHaveLength(1);
    expect((await getBackup('2:2'))?.fileId).toBe('drive-1');
    expect((await getBackup('2:2'))?.state).toBe('uploaded');

    const next = clip({ updatedAt: CREATED + 5 });
    await putClip(next, new Blob(['second']));
    await queueBackup(['2:2'], ctx);

    expect(uploads[1]?.fileId).toBe('drive-1');
    expect(uploads[1]?.bytes).toBe(6);
    expect((await getBackup('2:2'))?.clipUpdatedAt).toBe(CREATED + 5);
  });

  it('leaves an explicitly queued clip pending while offline, then retries online', async () => {
    await putClip(clip(), new Blob(['audio']));
    const uploads: Upload[] = [];
    const ctx = context({ transport: transport(uploads) });

    await queueBackup(['2:2'], { ...ctx, isOnline: () => false });
    expect((await getBackup('2:2'))?.state).toBe('pending');
    expect(uploads).toHaveLength(0);

    await processBackupQueue(ctx);
    expect((await getBackup('2:2'))?.state).toBe('uploaded');
    expect(uploads).toHaveLength(1);
  });

  it('marks a real failure and lets the user retry it', async () => {
    await putClip(clip(), new Blob(['audio']));
    const uploads: Upload[] = [];
    const ctx = context({
      transport: transport(uploads, {
        fail: (count) => (count === 1 ? new Error('quota exceeded') : null),
      }),
    });

    await queueBackup(['2:2'], ctx);
    expect((await getBackup('2:2'))?.state).toBe('failed');
    expect((await getBackup('2:2'))?.error).toContain('quota');

    await queueBackup(['2:2'], ctx);
    expect((await getBackup('2:2'))?.state).toBe('uploaded');
  });

  it('keeps a network failure pending for the online retry', async () => {
    await putClip(clip(), new Blob(['audio']));
    const ctx = context({
      transport: transport([], { fail: () => new DriveNetworkError() }),
    });

    await queueBackup(['2:2'], ctx);
    expect((await getBackup('2:2'))?.state).toBe('pending');
    expect((await getBackup('2:2'))?.error).toBeUndefined();
  });

  it('does not upload until the user queues a clip', async () => {
    await putClip(clip(), new Blob(['audio']));
    const uploads: Upload[] = [];
    await processBackupQueue(context({ transport: transport(uploads) }));
    expect(uploads).toHaveLength(0);
    expect(await getBackup('2:2')).toBeUndefined();
  });
});

describe('restore', () => {
  it('turns Drive files into import-ready File objects and reports progress', async () => {
    const files: DriveFile[] = [
      {
        id: 'file-1',
        name: 'p002-s002.webm',
        mimeType: 'audio/webm;codecs=opus',
        modifiedTime: new Date(CREATED).toISOString(),
      },
      {
        id: 'file-2',
        name: 'p001-s001.m4a',
        mimeType: 'audio/mp4',
        modifiedTime: new Date(CREATED + 1).toISOString(),
      },
    ];
    const progress: Array<{ done: number; total: number }> = [];
    const restored = await restoreDriveFiles(
      context({ transport: transport([], { files }) }),
      (value) => progress.push(value),
    );

    expect(restored).toHaveLength(2);
    expect(restored[0]?.name).toBe('p002-s002.webm');
    expect(restored[0]?.type).toBe('audio/webm;codecs=opus');
    expect(restored[0]?.lastModified).toBe(CREATED);
    expect(await restored[1]?.text()).toBe('audio:file-2');
    expect(progress).toEqual([
      { done: 1, total: 2 },
      { done: 2, total: 2 },
    ]);
  });
});
