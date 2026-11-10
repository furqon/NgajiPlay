import type { Clip } from '../types';
import { extensionFor } from './clip';

// Characters Windows, macOS or Android reject or reinterpret in a filename.
const UNSAFE = /[<>:"/\\|?*]/;

const isUnsafe = (char: string): boolean =>
  (char.codePointAt(0) ?? 0) < 0x20 || UNSAFE.test(char);
const KNOWN_EXTENSION = /\.(m4a|mp4|webm|ogg|bin)$/i;
const MAX_STEM = 80;

const pad3 = (value: number): string => String(value).padStart(3, '0');

/**
 * A display name is user input and ends up as a filename, so it must survive
 * Windows, macOS and Android without a silent rename (FR-3.3).
 */
export function sanitiseFileName(name: string): string {
  return [...name]
    .map((char) => (isUnsafe(char) ? '-' : char))
    .join('')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[.\s-]+|[.\s-]+$/g, '')
    .slice(0, MAX_STEM)
    .replace(/[.\s-]+$/g, '');
}

/**
 * Sanitised display name plus page and surah for uniqueness, with the extension
 * of the real codec. The default name already starts with `pNNN-sNNN-`, so it is
 * not doubled.
 */
export function exportFileName(clip: Clip): string {
  const prefix = `p${pad3(clip.page)}-s${pad3(clip.surah)}`;
  const extension = extensionFor(clip.mimeType);
  const stem = sanitiseFileName(clip.displayName.replace(KNOWN_EXTENSION, ''));
  const unique = stem === '' ? prefix : stem.startsWith(prefix) ? stem : `${stem}-${prefix}`;

  return `${unique}.${extension}`;
}

/**
 * One download per clip (FR-4.4). A per-file `<a download>` keeps this a static
 * app with no archive library, and the browser's own download UI names and
 * stores the file.
 */
export function downloadClip(clip: Clip, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = exportFileName(clip);
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
