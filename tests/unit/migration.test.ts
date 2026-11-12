import { beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, getClip, openDatabase } from '../../src/store/db';

const DB_NAME = 'ngajiplay';
const CREATED = Date.UTC(2026, 10, 10, 9, 0);

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('deleteDatabase failed'));
    request.onblocked = () => reject(new Error('deleteDatabase blocked'));
  });
}

function seedVersionOne(): Promise<void> {
  return seedVersion(1);
}

function seedVersionTwo(): Promise<void> {
  return seedVersion(2);
}

function seedVersion(version: 1 | 2): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version);
    request.onupgradeneeded = () => {
      const db = request.result;
      const clips = db.createObjectStore('clips', { keyPath: 'id' });
      clips.createIndex('by-page', 'page');
      clips.createIndex('by-surah', 'surah');
      db.createObjectStore('settings', { keyPath: 'key' });
    };
    request.onerror = () => reject(request.error ?? new Error(`open v${version} failed`));
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('clips', 'readwrite');
      transaction.objectStore('clips').put({
        id: '2:2',
        page: 2,
        surah: 2,
        ayahStart: 1,
        ayahEnd: 5,
        mimeType: 'audio/webm;codecs=opus',
        bytes: 5,
        durationMs: 1_000,
        createdAt: CREATED,
        ...(version === 2 ? { updatedAt: CREATED + 5 } : {}),
        displayName: 'p002-s002-al-baqarah.webm',
        blob: new Blob(['audio'], { type: 'audio/webm;codecs=opus' }),
      });
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('seed failed'));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('seed aborted'));
    };
  });
}

beforeEach(async () => {
  await closeDatabase();
  await deleteDatabase();
});

describe('schema migration', () => {
  it('upgrades version 1 clips with updatedAt = createdAt and adds backups', async () => {
    await seedVersionOne();

    const db = await openDatabase();
    expect(db.version).toBe(3);
    expect(Array.from(db.objectStoreNames)).toContain('backups');

    const record = await getClip('2:2');
    expect(record).toBeDefined();
    expect(record?.updatedAt).toBe(CREATED);
    expect(record?.displayName).toBe('p002-s002-al-baqarah.webm');
    expect(record?.blob.size).toBe(5);
  });

  it('keeps version 2 clips and adds the backups store', async () => {
    await seedVersionTwo();

    const db = await openDatabase();
    expect(db.version).toBe(3);
    expect(Array.from(db.objectStoreNames)).toContain('backups');

    const record = await getClip('2:2');
    expect(record?.updatedAt).toBe(CREATED + 5);
  });
});
