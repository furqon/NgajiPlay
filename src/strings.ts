export type Language = 'id' | 'en';

// Indonesian is the default (REQ §4). Every key must exist in both languages;
// the `en` object is typed against the Indonesian one to enforce that.
const id = {
  tagline: 'Rekam bacaan Al-Qur’an anak, lalu putar ulang sambil melihat halamannya.',
  ready: 'Siap dipakai offline',
  firstLoad: 'Buka sekali lagi dengan internet untuk menyiapkan mode offline',
  offline: 'Sedang offline',
  noSw: 'Mode offline tidak tersedia di browser ini',
  searchLabel: 'Cari halaman atau surah',
  searchPlaceholder: 'Contoh: 100, 2, Al-Baqarah',
  searchButton: 'Cari',
  searchHint: 'Ketik nomor halaman 1–604 atau nama surah.',
  searchErrorPage: 'Nomor halaman harus 1 sampai 604.',
  searchEmpty: 'Tidak ada halaman atau surah yang cocok dengan “{query}”.',
  resultPage: 'Halaman {page}',
  pageLabel: 'Halaman {page} dari {total}',
  pageNav: 'Navigasi halaman',
  previousPage: 'Halaman sebelumnya',
  nextPage: 'Halaman berikutnya',
  backToSearch: 'Cari halaman',
  surahStartLabel: 'Surah {number}',
  slicesHeading: 'Bagian halaman ini',
  sliceAyat: 'Ayat {from}–{to}',
  recorded: 'Sudah direkam',
  notRecorded: 'Belum direkam',
  loading: 'Memuat…',
  loadError: 'Data Al-Qur’an gagal dimuat. Periksa koneksi lalu muat ulang.',
  pageMissing: 'Halaman {page} tidak ada. Halaman Madani hanya 1 sampai 604.',
  pageTitle: 'Halaman {page} · ngajiPlay',
} as const;

export type StringKey = keyof typeof id;

const en: Record<StringKey, string> = {
  tagline: 'Record your child’s recitation, then play it back on the page itself.',
  ready: 'Ready offline',
  firstLoad: 'Open once more with a connection to enable offline mode',
  offline: 'You are offline',
  noSw: 'Offline mode is not available in this browser',
  searchLabel: 'Search a page or surah',
  searchPlaceholder: 'For example: 100, 2, Al-Baqarah',
  searchButton: 'Search',
  searchHint: 'Type a page number from 1 to 604, or a surah name.',
  searchErrorPage: 'A page number must be between 1 and 604.',
  searchEmpty: 'No page or surah matches “{query}”.',
  resultPage: 'Page {page}',
  pageLabel: 'Page {page} of {total}',
  pageNav: 'Page navigation',
  previousPage: 'Previous page',
  nextPage: 'Next page',
  backToSearch: 'Search a page',
  surahStartLabel: 'Surah {number}',
  slicesHeading: 'Parts of this page',
  sliceAyat: 'Ayah {from}–{to}',
  recorded: 'Recorded',
  notRecorded: 'Not recorded',
  loading: 'Loading…',
  loadError: 'The Quran data failed to load. Check the connection and reload.',
  pageMissing: 'Page {page} does not exist. Madani pages run from 1 to 604.',
  pageTitle: 'Page {page} · ngajiPlay',
};

export const strings: Record<Language, Record<StringKey, string>> = { id, en };

/**
 * Indonesian is always the default (REQ §4), regardless of browser locale.
 * Phase 7 replaces this with the persisted switcher value.
 */
export function currentLanguage(): Language {
  return 'id';
}

export function t(key: StringKey, language: Language = currentLanguage()): string {
  return strings[language][key];
}

/** Fills `{name}` placeholders so numbers and queries never enter the dictionary. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    key in values ? String(values[key]) : placeholder,
  );
}
