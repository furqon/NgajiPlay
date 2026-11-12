import type { BackupRecord, Clip, ClipRecord } from '../types';
import { StorageQuotaError, isQuotaExceeded } from './storage';

const DB_NAME = 'ngajiplay';
const DB_VERSION = 3;
const CLIPS = 'clips';
const SETTINGS = 'settings';
const BACKUPS = 'backups';

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

export async function closeDatabase(): Promise<void> {
  const pending = dbPromise;
  dbPromise = null;
  if (!pending) return;
  const db = await pending;
  db.close();
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
  }

  if (oldVersion < 2 && transaction) {
    const store = transaction.objectStore(CLIPS);
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current) return;
      const clip = current.value as Clip;
      if (typeof clip.updatedAt !== 'number') {
        current.update({ ...clip, updatedAt: clip.createdAt });
      }
      current.continue();
    };
  }

  if (oldVersion < 3) {
    db.createObjectStore(BACKUPS, { keyPath: 'id' });
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

/** Metadata without the blob, so list views never hold audio in memory. */
function toClip({ blob: _blob, ...clip }: ClipRecord): Clip {
  return clip;
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

  return records.map(toClip).sort((a, b) => a.surah - b.surah);
}

/** Metadata for every clip, in playlist order (FR-4.1), without holding blobs. */
export async function listClips(): Promise<Clip[]> {
  const db = await openDatabase();
  const transaction = db.transaction(CLIPS, 'readonly');
  const records = await request<ClipRecord[]>(
    transaction.objectStore(CLIPS).getAll() as IDBRequest<ClipRecord[]>,
  );

  return records
    .map(toClip)
    .sort((a, b) => a.page - b.page || a.surah - b.surah || a.ayahStart - b.ayahStart);
}

/**
 * Changes only the display name (FR-4.2). The blob is never rewritten, and the
 * deterministic id keeps the clip bound to its slice.
 */
export function renameClip(id: string, displayName: string): Promise<Clip | undefined> {
  return openDatabase().then(
    (db) =>
      new Promise<Clip | undefined>((resolve, reject) => {
        const transaction = db.transaction(CLIPS, 'readwrite');
        const store = transaction.objectStore(CLIPS);
        let updated: Clip | undefined;

        // Chained from onsuccess rather than awaited: an await would let the
        // transaction go inactive in stricter engines.
        store.get(id).onsuccess = (event) => {
          const record = (event.target as IDBRequest<ClipRecord | undefined>).result;
          if (!record) return;
          const renamed: ClipRecord = { ...record, displayName };
          store.put(renamed);
          updated = toClip(renamed);
        };
        transaction.oncomplete = () => resolve(updated);
        transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB rename failed'));
        transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB rename aborted'));
      }),
  );
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

export async function getBackup(id: string): Promise<BackupRecord | undefined> {
  const db = await openDatabase();
  const transaction = db.transaction(BACKUPS, 'readonly');
  return request<BackupRecord | undefined>(
    transaction.objectStore(BACKUPS).get(id) as IDBRequest<BackupRecord | undefined>,
  );
}

export async function listBackups(): Promise<BackupRecord[]> {
  const db = await openDatabase();
  const transaction = db.transaction(BACKUPS, 'readonly');
  return request<BackupRecord[]>(
    transaction.objectStore(BACKUPS).getAll() as IDBRequest<BackupRecord[]>,
  );
}

export async function putBackup(backup: BackupRecord): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(BACKUPS, 'readwrite');
  transaction.objectStore(BACKUPS).put(backup);
  await committed(transaction);
}

export async function deleteBackup(id: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(BACKUPS, 'readwrite');
  transaction.objectStore(BACKUPS).delete(id);
  await committed(transaction);
}

export async function clearBackups(): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(BACKUPS, 'readwrite');
  transaction.objectStore(BACKUPS).clear();
  await committed(transaction);
}

/** Used by tests and by "clear library" flows. */
export async function clearAll(): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction([CLIPS, SETTINGS, BACKUPS], 'readwrite');
  transaction.objectStore(CLIPS).clear();
  transaction.objectStore(SETTINGS).clear();
  transaction.objectStore(BACKUPS).clear();
  await committed(transaction);
}
