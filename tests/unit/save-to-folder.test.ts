import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canSaveToFolder,
  saveRecordingsToFolder,
  type FolderSaveOutcome,
} from '../../src/recording/save-to-folder';
import { clearAll } from '../../src/store/db';
import type { ClipRecord } from '../../src/types';

const CREATED = 1_760_000_000_000;

function clip(overrides: Partial<ClipRecord> = {}): ClipRecord {
  return {
    id: '2:2',
    page: 2,
    surah: 2,
    ayahStart: 1,
    ayahEnd: 5,
    mimeType: 'audio/mp4;codecs=mp4a.40.2',
    bytes: 4,
    durationMs: 1_000,
    createdAt: CREATED,
    updatedAt: CREATED,
    displayName: 'p002-s002-al-baqarah-a001-005.m4a',
    blob: new Blob([new Uint8Array(4)], { type: 'audio/mp4' }),
    ...overrides,
  };
}

interface FakeDirectory {
  kind: 'directory';
  name: string;
  queryPermission(): Promise<PermissionState>;
  requestPermission(): Promise<PermissionState>;
  getFileHandle(name: string): Promise<unknown>;
}

function fakeDirectory(name: string, written: string[]): FakeDirectory {
  return {
    kind: 'directory',
    name,
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    getFileHandle: async (fileName) => ({
      kind: 'file',
      name: fileName,
      createWritable: async () => ({
        write: async (data: Blob) => {
          expect(data).toBeInstanceOf(Blob);
          written.push(fileName);
        },
        close: async () => {},
        abort: async () => {},
      }),
    }),
  };
}

beforeEach(async () => {
  await clearAll();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('canSaveToFolder', () => {
  it('is false when the browser has no directory picker', () => {
    vi.stubGlobal('window', {});
    expect(canSaveToFolder()).toBe(false);
  });

  it('is true when the directory picker exists', () => {
    vi.stubGlobal('window', { showDirectoryPicker: async () => fakeDirectory('Drive', []) });
    expect(canSaveToFolder()).toBe(true);
  });
});

describe('saveRecordingsToFolder', () => {
  it('reports unsupported instead of pretending a download is a folder save', async () => {
    vi.stubGlobal('window', {});
    const outcome: FolderSaveOutcome = await saveRecordingsToFolder([clip()]);
    expect(outcome).toEqual({ status: 'unsupported' });
  });

  it('treats a dismissed picker as a silent cancel', async () => {
    vi.stubGlobal('window', {
      showDirectoryPicker: async () => {
        throw new DOMException('dismissed', 'AbortError');
      },
    });
    expect(await saveRecordingsToFolder([clip()])).toEqual({ status: 'cancelled' });
  });

  it('reports a denied permission separately from a general failure', async () => {
    vi.stubGlobal('window', {
      showDirectoryPicker: async () => {
        throw new DOMException('denied', 'NotAllowedError');
      },
    });
    expect(await saveRecordingsToFolder([clip()])).toEqual({ status: 'denied' });
  });

  it('writes each clip under the same exported filename and reports the folder', async () => {
    const written: string[] = [];
    vi.stubGlobal('window', {
      showDirectoryPicker: async () => fakeDirectory('Drive', written),
    });

    const outcome = await saveRecordingsToFolder([
      clip(),
      clip({
        id: '1:1',
        page: 1,
        surah: 1,
        displayName: 'Bacaan Ali',
        mimeType: 'audio/webm;codecs=opus',
      }),
    ]);

    expect(outcome).toEqual({ status: 'saved', folderName: 'Drive', files: 2 });
    expect(written).toEqual([
      'p002-s002-al-baqarah-a001-005.m4a',
      'Bacaan-Ali-p001-s001.webm',
    ]);
  });
});
