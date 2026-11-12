import { page as quranPage } from '../data/quran';
import { clipId } from '../store/db';
import type { Clip, QuranData } from '../types';
import { extensionFor, type RecordingExtension } from './clip';

export const IMPORT_ACCEPT = 'audio/*,.m4a,.mp4,.webm,.ogg';

const IMPORT_EXTENSIONS = new Set<RecordingExtension>(['m4a', 'mp4', 'webm', 'ogg']);
const IMPORT_MIME_TYPES = new Set([
  'audio/mp4',
  'video/mp4',
  'audio/webm',
  'video/webm',
  'audio/ogg',
  'video/ogg',
]);
const INFERRED_MIME: Record<'m4a' | 'mp4' | 'webm' | 'ogg', string> = {
  m4a: 'audio/mp4;codecs=mp4a.40.2',
  mp4: 'audio/mp4',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
};

export interface ParsedImportName {
  page: number;
  surah: number;
}

export type ImportProblem =
  | 'unrecognised'
  | 'unsupported'
  | 'not-on-page'
  | 'corrupt'
  | 'duplicate';

export interface ImportCandidate {
  kind: 'candidate';
  file: File;
  clip: Clip;
}

export interface ImportRejection {
  kind: 'rejected';
  file: File;
  problem: ImportProblem;
  page?: number;
  surah?: number;
}

export type ImportEntry = ImportCandidate | ImportRejection;

export interface DecodedAudio {
  durationMs: number;
  channels?: number;
}

export type AudioDecoder = (blob: Blob) => Promise<DecodedAudio>;

export function parseExportFileName(name: string): ParsedImportName | null {
  const pattern = /p(\d{3})-s(\d{3})(?=[^a-z0-9]|$)/gi;
  let match: RegExpExecArray | null;
  let found: ParsedImportName | null = null;

  while ((match = pattern.exec(name)) !== null) {
    const before = match.index === 0 ? '' : name[match.index - 1];
    if (before && /[a-z0-9]/i.test(before)) continue;
    found = { page: Number(match[1]), surah: Number(match[2]) };
  }

  return found;
}

export function defaultImportAction(
  existing: Clip | undefined,
  incoming: Clip,
): 'import' | 'replace' | 'keep' {
  if (!existing) return 'import';
  return incoming.updatedAt > existing.updatedAt ? 'replace' : 'keep';
}

export async function decodeAudioFile(blob: Blob): Promise<DecodedAudio> {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    return {
      durationMs: Math.round(buffer.duration * 1_000),
      channels: buffer.numberOfChannels,
    };
  } finally {
    await context.close();
  }
}

export async function readImportFiles(
  files: Iterable<File>,
  data: QuranData,
  decode: AudioDecoder = decodeAudioFile,
): Promise<ImportEntry[]> {
  const entries: ImportEntry[] = [];

  for (const file of files) {
    const prepared = prepare(file, data);
    if (prepared.kind === 'rejected') {
      entries.push(prepared);
      continue;
    }

    try {
      const decoded = await decode(file);
      if (!Number.isFinite(decoded.durationMs) || decoded.durationMs < 1) {
        entries.push(reject(file, 'corrupt', prepared.page, prepared.surah));
        continue;
      }
      entries.push({
        kind: 'candidate',
        file,
        clip: {
          id: clipId(prepared.page, prepared.surah),
          page: prepared.page,
          surah: prepared.surah,
          ayahStart: prepared.ayahStart,
          ayahEnd: prepared.ayahEnd,
          mimeType: prepared.mimeType,
          bytes: file.size,
          durationMs: Math.round(decoded.durationMs),
          createdAt: file.lastModified,
          updatedAt: file.lastModified,
          displayName: file.name,
          channels: decoded.channels,
        },
      });
    } catch {
      entries.push(reject(file, 'corrupt', prepared.page, prepared.surah));
    }
  }

  return dropOlderDuplicates(entries);
}

interface PreparedFile {
  kind: 'prepared';
  page: number;
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  mimeType: string;
}

function prepare(file: File, data: QuranData): PreparedFile | ImportRejection {
  const identity = parseExportFileName(file.name);
  if (!identity) return reject(file, 'unrecognised');

  const extension = extensionOf(file.name);
  if (!extension || !IMPORT_EXTENSIONS.has(extension)) {
    return reject(file, 'unsupported', identity.page, identity.surah);
  }

  const mimeType = importMimeType(file, extension);
  if (!mimeType) return reject(file, 'unsupported', identity.page, identity.surah);

  try {
    const slice = quranPage(data, identity.page).slices.find(
      (item) => item.surah === identity.surah,
    );
    if (!slice) return reject(file, 'not-on-page', identity.page, identity.surah);
    return {
      kind: 'prepared',
      page: identity.page,
      surah: identity.surah,
      ayahStart: slice.ayahStart,
      ayahEnd: slice.ayahEnd,
      mimeType,
    };
  } catch {
    return reject(file, 'not-on-page', identity.page, identity.surah);
  }
}

function importMimeType(file: File, extension: RecordingExtension): string | null {
  if (!(extension in INFERRED_MIME)) return null;
  const declared = file.type.trim();
  if (declared === '') return INFERRED_MIME[extension as keyof typeof INFERRED_MIME];

  const base = declared.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!IMPORT_MIME_TYPES.has(base)) return null;

  const derived = extensionFor(declared);
  if (derived === extension) return declared;
  if (extension === 'm4a' && derived === 'mp4' && !/codecs=/i.test(declared)) {
    return INFERRED_MIME.m4a;
  }

  return null;
}

function extensionOf(name: string): RecordingExtension | null {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  const extension = match?.[1]?.toLowerCase();
  if (!extension || !IMPORT_EXTENSIONS.has(extension as RecordingExtension)) return null;
  return extension as RecordingExtension;
}

function reject(
  file: File,
  problem: ImportProblem,
  page?: number,
  surah?: number,
): ImportRejection {
  return { kind: 'rejected', file, problem, page, surah };
}

function dropOlderDuplicates(entries: ImportEntry[]): ImportEntry[] {
  const best = new Map<string, number>();

  for (const [index, entry] of entries.entries()) {
    if (entry.kind !== 'candidate') continue;
    const previous = best.get(entry.clip.id);
    if (previous === undefined) {
      best.set(entry.clip.id, index);
      continue;
    }
    const previousEntry = entries[previous];
    if (
      previousEntry?.kind === 'candidate' &&
      entry.clip.updatedAt > previousEntry.clip.updatedAt
    ) {
      entries[previous] = reject(
        previousEntry.file,
        'duplicate',
        previousEntry.clip.page,
        previousEntry.clip.surah,
      );
      best.set(entry.clip.id, index);
    } else {
      entries[index] = reject(entry.file, 'duplicate', entry.clip.page, entry.clip.surah);
    }
  }

  return entries;
}
