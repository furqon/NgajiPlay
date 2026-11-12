import { clearBackups, getClip, listBackups, putBackup } from '../store/db';
import type { BackupRecord, BackupState, Clip } from '../types';
import { driveClient, resetDriveCache, type DriveFile, type DriveTransport } from './client';
import { DriveAuthError, DriveNetworkError } from './errors';
import {
  clearGoogleDriveSession,
  isGoogleDriveConnected,
  signOutGoogleDrive,
} from './oauth';

export interface BackupContext {
  transport: DriveTransport;
  isConnected: () => boolean;
  isOnline: () => boolean;
}

export type BackupStatus = 'none' | BackupState;

export interface RestoreProgress {
  done: number;
  total: number;
}

const defaultContext: BackupContext = {
  transport: driveClient,
  isConnected: isGoogleDriveConnected,
  isOnline: () => navigator.onLine,
};

const listeners = new Set<() => void>();
let running: Promise<void> | null = null;

export function onBackupChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function backupStatus(clip: Clip, record?: BackupRecord): BackupStatus {
  if (!record) return 'none';
  if (record.state === 'uploaded') {
    return record.clipUpdatedAt === clip.updatedAt ? 'uploaded' : 'none';
  }
  return record.state;
}

export async function queueBackup(
  ids: readonly string[],
  context: BackupContext = defaultContext,
): Promise<void> {
  const now = Date.now();
  const unique = [...new Set(ids)];
  const previous = new Map((await listBackups()).map((record) => [record.id, record]));

  for (const id of unique) {
    const clip = await getClip(id);
    if (!clip) continue;
    await putBackup({
      id,
      state: 'pending',
      fileId: previous.get(id)?.fileId,
      clipUpdatedAt: clip.updatedAt,
      updatedAt: now,
    });
  }

  notify();
  await processBackupQueue(context);
}

export function processBackupQueue(
  context: BackupContext = defaultContext,
): Promise<void> {
  running ??= run(context).finally(() => {
    running = null;
  });
  return running;
}

async function run(context: BackupContext): Promise<void> {
  if (!context.isOnline() || !context.isConnected()) return;

  const pending = (await listBackups())
    .filter((record) => record.state === 'pending')
    .sort((a, b) => a.updatedAt - b.updatedAt);

  for (const record of pending) {
    if (!context.isOnline()) return;

    const clip = await getClip(record.id);
    if (!clip) continue;

    try {
      const fileId = await context.transport.uploadClip(clip, clip.blob, record.fileId);
      await putBackup({
        id: clip.id,
        state: 'uploaded',
        fileId,
        clipUpdatedAt: clip.updatedAt,
        updatedAt: Date.now(),
      });
      notify();
    } catch (error) {
      if (error instanceof DriveAuthError) {
        clearGoogleDriveSession();
        resetDriveCache();
        notify();
        return;
      }
      if (error instanceof DriveNetworkError) return;

      await putBackup({
        ...record,
        state: 'failed',
        clipUpdatedAt: clip.updatedAt,
        updatedAt: Date.now(),
        error: error instanceof Error ? error.message : 'Google Drive upload failed',
      });
      notify();
    }
  }
}

export async function restoreDriveFiles(
  context: BackupContext = defaultContext,
  onProgress?: (progress: RestoreProgress) => void,
): Promise<File[]> {
  const files = await context.transport.listClips();
  const restored: File[] = [];

  for (const [index, file] of files.entries()) {
    const blob = await context.transport.downloadFile(file);
    restored.push(toFile(file, blob));
    onProgress?.({ done: index + 1, total: files.length });
  }

  return restored;
}

function toFile(file: DriveFile, blob: Blob): File {
  const type = file.mimeType || blob.type || 'application/octet-stream';
  const parsed = file.modifiedTime ? Date.parse(file.modifiedTime) : Number.NaN;
  return new File([blob], file.name, {
    type,
    lastModified: Number.isFinite(parsed) ? parsed : Date.now(),
  });
}

export async function disconnectDrive(): Promise<void> {
  await signOutGoogleDrive();
  resetDriveCache();
  await clearBackups();
  notify();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void processBackupQueue();
  });
}
