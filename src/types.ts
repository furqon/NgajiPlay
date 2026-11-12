/** One surah with its ayah texts, in mushaf order. */
export interface Surah {
  n: number;
  nameId: string;
  nameEn: string;
  nameMeaning: string;
  nameAr: string;
  ayahCount: number;
  /** Global 0-based offset of this surah's first ayah. */
  start: number;
  ayahs: string[];
}

/** A surah's portion of one page: exactly one clip per slice (REQ §4). */
export interface PageSlice {
  surah: number;
  ayahStart: number;
  ayahEnd: number;
}

export interface QuranPage {
  number: number;
  slices: PageSlice[];
}

export interface QuranMeta {
  source: string;
  license: string;
  url: string;
  hash: string;
  ayahCount: number;
  pageCount: number;
  /** Verbatim Tanzil copyright block, shipped with the data (FR-7.5). */
  copyright: string;
}

/** Raw shape of the generated public/quran.json. */
export interface QuranData {
  meta: QuranMeta;
  surahs: Surah[];
  /** Page slices arrive as [surah, firstAyah, lastAyah] tuples. */
  pages: Array<{ number: number; from: number; to: number; slices: Array<[number, number, number]> }>;
}

export interface AyahRef {
  surah: number;
  ayah: number;
  text: string;
}

/** A saved recording. `id` is always `${page}:${surah}` — one clip per slice. */
export interface Clip {
  id: string;
  page: number;
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  mimeType: string;
  bytes: number;
  durationMs: number;
  createdAt: number;
  updatedAt: number;
  displayName: string;
  /** Real channel count from track.getSettings() (REQ §8.3). */
  channels?: number;
}

export interface ClipRecord extends Clip {
  blob: Blob;
}

export type BackupState = 'pending' | 'uploaded' | 'failed';

/** Local Drive state keyed by clip id. It survives re-recording the same slice. */
export interface BackupRecord {
  id: string;
  state: BackupState;
  fileId?: string;
  clipUpdatedAt: number;
  updatedAt: number;
  error?: string;
}

export interface Settings {
  language: 'id' | 'en';
  repeatMode: 'off' | 'one' | 'all' | 'count';
  repeatCount: number;
  lastClipId: string | null;
  lastPositionMs: number;
  googleClientId?: string;
}
