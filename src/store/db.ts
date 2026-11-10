import type { Clip, ClipRecord } from '../types';
import { StorageQuotaError, isQuotaExceeded } from './storage';

const DB_NAME = 'ngajiplay';
const DB_VERSION = 1;
const CLIPS = 'clips';
const SETTINGS = 'settings';

/** One clip per page + surah slice (REQ §4), so the key is derived, not random. */
export function clipId(page: number, surah: number): string {
  return `${page}:${surah}`;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDatabase(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      migrate(db, request.transaction, event.oldVersion);
    };
    request.onsuccess = () => {
      const db = request.result;
      // Let a newer version take over in another tab instead of blocking it.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('indexedDB.open failed'));
    request.onblocked = () => reject(new Error('indexedDB.open is blocked by another tab'));
  });

  return dbPromise;
}

/**
 * Schema migrations. Every future version gets its own branch here; existing
 * branches must never change once shipped.
 */
export function migrate(db: IDBDatabase, transaction: IDBTransaction | null, oldVersion: number): void {
  if (oldVersion < 1) {
    const clips = db.createObjectStore(CLIPS, { keyPath: 'id' });
    clips.createIndex('by-page', 'page');
    clips.createIndex('by-surah', 'surah');
    db.createObjectStore(SETTINGS, { keyPath: 'key' });
    void transaction;
  }
}

function request<T>(source: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    source.onsuccess = () => resolve(source.result);
    source.onerror = () => reject(source.error ?? new Error('IndexedDB request failed'));
  });
}

function committed(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/** Saves a clip and its audio. Re-saving the same slice replaces it (FR-2.9). */
export async function putClip(clip: Clip, blob: Blob): Promise<Clip> {
  const db = await openDatabase();
  const record: ClipRecord = { ...clip, blob };
  const transaction = db.transaction(CLIPS, 'readwrite');

  try {
    transaction.objectStore(CLIPS).put(record);
    await committed(transaction);
    return clip;
  } catch (error) {
    if (isQuotaExceeded(error)) throw new StorageQuotaError(blob.size, 0);
    throw error;
  }
}

export async function getClip(id: string): Promise<ClipRecord | undefined> {
  const db = await openDatabase();
  const transaction = db.transaction(CLIPS, 'readonly');
  return request<ClipRecord | undefined>(transaction.objectStore(CLIPS).get(id) as IDBRequest<ClipRecord | undefined>);
}

/** Metadata for the clips on one page, using the by-page index (FR-1.5). */
export async function clipsOnPage(page: number): Promise<Clip[]> {
  const db = await openDatabase();
  const transaction = db.transaction(CLIPS, 'readonly');
  const records = await request<ClipRecord[]>(
    transaction.objectStore(CLIPS).index('by-page').getAll(page) as IDBRequest<ClipRecord[]>,
  );

  return records.map(({ blob: _blob, ...clip }) => clip).sort((a, b) => a.surah - b.surah);
}

/** Metadata for every clip, in playlist order (FR-4.1), without holding blobs. */
export async function listClips(): Promise<Clip[]> {
  const db = await openDatabase();
  const transaction = db.transaction(CLIPS, 'readonly');
  const records = await request<ClipRecord[]>(
    transaction.objectStore(CLIPS).getAll() as IDBRequest<ClipRecord[]>,
  );

  return records
    .map(({ blob: _blob, ...clip }) => clip)
    .sort((a, b) => a.page - b.page || a.surah - b.surah || a.ayahStart - b.ayahStart);
}

export async function deleteClip(id: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(CLIPS, 'readwrite');
  transaction.objectStore(CLIPS).delete(id);
  await committed(transaction);
}

export async function clipCount(): Promise<number> {
  const db = await openDatabase();
  const transaction = db.transaction(CLIPS, 'readonly');
  return request<number>(transaction.objectStore(CLIPS).count());
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await openDatabase();
  const transaction = db.transaction(SETTINGS, 'readonly');
  const record = await request<{ key: string; value: T } | undefined>(
    transaction.objectStore(SETTINGS).get(key) as IDBRequest<{ key: string; value: T } | undefined>,
  );
  return record?.value ?? fallback;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(SETTINGS, 'readwrite');
  transaction.objectStore(SETTINGS).put({ key, value });
  await committed(transaction);
}

/** Used by tests and by "clear library" flows. */
export async function clearAll(): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction([CLIPS, SETTINGS], 'readwrite');
  transaction.objectStore(CLIPS).clear();
  transaction.objectStore(SETTINGS).clear();
  await committed(transaction);
}
