import { getSetting, setSetting } from '../store/db';
import type { ClipRecord } from '../types';
import { exportFileName } from './export';

const FOLDER_KEY = 'saveFolder';

interface PermissionCapable {
  queryPermission?(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
}

interface DirectoryPickerWindow {
  showDirectoryPicker?(options?: {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: FileSystemHandle | string;
  }): Promise<FileSystemDirectoryHandle>;
}

export interface FolderSaveProgress {
  done: number;
  total: number;
  fileName: string;
}

export type FolderSaveOutcome =
  | { status: 'saved'; folderName: string; files: number }
  | { status: 'cancelled' }
  | { status: 'unsupported' }
  | { status: 'denied' }
  | { status: 'failed'; fileName?: string };

export function canSaveToFolder(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as Window & DirectoryPickerWindow).showDirectoryPicker === 'function'
  );
}

export async function getRememberedFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return (await getSetting<FileSystemDirectoryHandle | null>(FOLDER_KEY, null)) ?? null;
  } catch {
    return null;
  }
}

export async function forgetFolder(): Promise<void> {
  try {
    await setSetting<FileSystemDirectoryHandle | null>(FOLDER_KEY, null);
  } catch {
    // Remembering the folder is best-effort; the picker still works.
  }
}

async function rememberFolder(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    await setSetting(FOLDER_KEY, handle);
  } catch {
    // Some engines refuse to structured-clone a handle; the picker still works.
  }
}

async function canWrite(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const capable = handle as FileSystemDirectoryHandle & PermissionCapable;
  if (!capable.queryPermission) return true;

  try {
    let state = await capable.queryPermission({ mode: 'readwrite' });
    if (state === 'prompt' && capable.requestPermission) {
      state = await capable.requestPermission({ mode: 'readwrite' });
    }
    return state === 'granted';
  } catch {
    return false;
  }
}

async function chooseFolder(): Promise<FileSystemDirectoryHandle | null> {
  const remembered = await getRememberedFolder();
  if (remembered && (await canWrite(remembered))) return remembered;

  const picker = (window as Window & DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) return null;

  const picked = await picker({ id: 'ngajiplay-clips', mode: 'readwrite' });
  await rememberFolder(picked);
  return picked;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isDenied(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'SecurityError')
  );
}

async function writeFile(
  directory: FileSystemDirectoryHandle,
  fileName: string,
  blob: Blob,
): Promise<void> {
  const file = await directory.getFileHandle(fileName, { create: true });
  const writable = await file.createWritable();

  try {
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    try {
      await writable.abort();
    } catch {
      // The stream is already closed or unusable.
    }
    throw error;
  }
}

export async function saveRecordingsToFolder(
  records: readonly ClipRecord[],
  onProgress?: (progress: FolderSaveProgress) => void,
): Promise<FolderSaveOutcome> {
  if (!canSaveToFolder()) return { status: 'unsupported' };
  if (records.length === 0) return { status: 'failed' };

  let directory: FileSystemDirectoryHandle | null;
  try {
    directory = await chooseFolder();
  } catch (error) {
    if (isAbort(error)) return { status: 'cancelled' };
    if (isDenied(error)) return { status: 'denied' };
    return { status: 'failed' };
  }
  if (!directory) return { status: 'cancelled' };

  let fileName = '';
  try {
    for (const [index, record] of records.entries()) {
      fileName = exportFileName(record);
      onProgress?.({ done: index, total: records.length, fileName });
      await writeFile(directory, fileName, record.blob);
      onProgress?.({ done: index + 1, total: records.length, fileName });
    }
    return { status: 'saved', folderName: directory.name, files: records.length };
  } catch {
    return { status: 'failed', fileName };
  }
}
