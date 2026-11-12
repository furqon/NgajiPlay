import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAll,
  clearBackups,
  clipCount,
  clipId,
  deleteBackup,
  deleteClip,
  getBackup,
  getClip,
  getSetting,
  listBackups,
  listClips,
  openDatabase,
  putBackup,
  putClip,
  setSetting,
} from '../../src/store/db';
import type { Clip } from '../../src/types';

const makeClip = (page: number, surah: number, overrides: Partial<Clip> = {}): Clip => ({
  id: clipId(page, surah),
  page,
  surah,
  ayahStart: 1,
  ayahEnd: 7,
  mimeType: 'audio/webm;codecs=opus',
  bytes: 12,
  durationMs: 4200,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  displayName: `p${String(page).padStart(3, '0')}-s${String(surah).padStart(3, '0')}`,
  ...overrides,
});

beforeEach(async () => {
  await clearAll();
});

describe('schema', () => {
  it('creates the clips, settings and backups stores (REQ §6)', async () => {
    const db = await openDatabase();
    const stores = Array.from(db.objectStoreNames);
    expect(stores).toContain('clips');
    expect(stores).toContain('settings');
    expect(stores).toContain('backups');
  });
});

describe('clips', () => {
  it('round-trips a clip and its audio blob', async () => {
    const blob = new Blob(['audio-bytes'], { type: 'audio/webm;codecs=opus' });
    await putClip(makeClip(2, 1), blob);

    const record = await getClip(clipId(2, 1));
    expect(record).toBeDefined();
    expect(record?.page).toBe(2);
    expect(record?.surah).toBe(1);
    expect(record?.blob.size).toBe(blob.size);
    expect(await clipCount()).toBe(1);
  });

  it('lists clips in playlist order regardless of insert order (FR-4.1)', async () => {
    const blob = new Blob(['x']);
    await putClip(makeClip(9, 2), blob);
    await putClip(makeClip(2, 2), blob);
    await putClip(makeClip(2, 1), blob);

    const ids = (await listClips()).map((clip) => clip.id);
    expect(ids).toEqual(['2:1', '2:2', '9:2']);
  });

  it('replaces the clip for the same slice instead of duplicating (FR-2.9)', async () => {
    await putClip(makeClip(2, 1, { displayName: 'first' }), new Blob(['one']));
    await putClip(makeClip(2, 1, { displayName: 'second' }), new Blob(['two']));

    const clips = await listClips();
    expect(clips).toHaveLength(1);
    expect(clips[0]?.displayName).toBe('second');
    expect((await getClip(clipId(2, 1)))?.blob.size).toBe(3);
  });

  it('omits the blob from the library listing', async () => {
    await putClip(makeClip(2, 1), new Blob(['x']));
    const [clip] = await listClips();
    expect(clip).toBeDefined();
    expect(Object.hasOwn(clip as object, 'blob')).toBe(false);
  });

  it('deletes a clip (FR-4.3)', async () => {
    await putClip(makeClip(2, 1), new Blob(['x']));
    await deleteClip(clipId(2, 1));
    expect(await getClip(clipId(2, 1))).toBeUndefined();
    expect(await clipCount()).toBe(0);
  });
});

describe('settings', () => {
  it('returns the fallback until a value is written', async () => {
    expect(await getSetting('language', 'id')).toBe('id');
    await setSetting('language', 'en');
    expect(await getSetting('language', 'id')).toBe('en');
  });

  it('stores structured values', async () => {
    await setSetting('repeat', { mode: 'one', count: 3 });
    expect(await getSetting('repeat', null)).toEqual({ mode: 'one', count: 3 });
  });
});

describe('backups', () => {
  it('round-trips Drive state by clip id and replaces updates', async () => {
    await putBackup({
      id: '2:2',
      state: 'pending',
      clipUpdatedAt: 100,
      updatedAt: 110,
    });
    expect((await getBackup('2:2'))?.state).toBe('pending');

    await putBackup({
      id: '2:2',
      state: 'uploaded',
      fileId: 'file-1',
      clipUpdatedAt: 100,
      updatedAt: 120,
    });
    const records = await listBackups();
    expect(records).toHaveLength(1);
    expect(records[0]?.fileId).toBe('file-1');
    expect(records[0]?.state).toBe('uploaded');
  });

  it('deletes one backup and clears all of them', async () => {
    await putBackup({ id: '1:1', state: 'failed', clipUpdatedAt: 1, updatedAt: 2 });
    await putBackup({ id: '2:2', state: 'uploaded', fileId: 'f', clipUpdatedAt: 1, updatedAt: 2 });
    await deleteBackup('1:1');
    expect(await getBackup('1:1')).toBeUndefined();
    expect(await listBackups()).toHaveLength(1);

    await clearBackups();
    expect(await listBackups()).toHaveLength(0);
  });
});
