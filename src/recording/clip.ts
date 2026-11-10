/**
 * Codec-exact container preference (REQ §4). Bare `audio/mp4` is never
 * requested: Chromium answers it with Opus-in-MP4, and naming that `.m4a`
 * would mislead players and the device gallery (REQ §8.3, trap 1).
 */
export const CODEC_PREFERENCES = ['audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus'] as const;

export type RecordingExtension = 'm4a' | 'mp4' | 'webm' | 'ogg' | 'bin';

/** First supported type, or null when the browser can record none of them. */
export function pickMimeType(isSupported: (type: string) => boolean): string | null {
  return CODEC_PREFERENCES.find((type) => isSupported(type)) ?? null;
}

/**
 * The extension must describe what was actually written (FR-3.1): AAC in MP4 is
 * an `.m4a`, but Opus in MP4 is not — it keeps `.mp4`.
 */
export function extensionFor(mimeType: string): RecordingExtension {
  const type = mimeType.toLowerCase();
  const codecs = /codecs=([^;]+)/.exec(type)?.[1]?.trim() ?? '';

  if (type.startsWith('audio/mp4') || type.startsWith('video/mp4')) {
    return codecs.includes('mp4a') ? 'm4a' : 'mp4';
  }
  if (type.startsWith('audio/webm') || type.startsWith('video/webm')) return 'webm';
  if (type.startsWith('audio/ogg') || type.startsWith('video/ogg')) return 'ogg';
  if (type.startsWith('audio/mpeg')) return 'm4a';

  // Never reached with the types in CODEC_PREFERENCES; a wrong extension would
  // be worse than an honest one.
  return 'bin';
}

/** Lowercase, diacritic-free, hyphenated form of a surah name. */
export function surahSlug(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug === '' ? 'surah' : slug;
}

const pad3 = (value: number): string => String(value).padStart(3, '0');

export interface ClipNameParts {
  page: number;
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  surahName: string;
  extension: RecordingExtension;
}

/** `p042-s001-al-fatihah-a001-007.m4a`, the default display name (FR-3.1). */
export function defaultClipName(parts: ClipNameParts): string {
  const { page, surah, ayahStart, ayahEnd, surahName, extension } = parts;
  return `p${pad3(page)}-s${pad3(surah)}-${surahSlug(surahName)}-a${pad3(ayahStart)}-${pad3(ayahEnd)}.${extension}`;
}
