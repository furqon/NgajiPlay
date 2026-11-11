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
  recordSliceLabel: 'Rekam {surah} ayat {from}–{to}',
  playSliceLabel: 'Putar {surah} ayat {from}–{to}',
  recorderLabel: 'Perekam',
  recorderTitle: 'Rekam {surah} · Ayat {from}–{to}',
  recorderReady: 'Tekan mulai, lalu bacakan ayat di atas sampai selesai.',
  recorderPreparing: 'Menyiapkan mikrofon…',
  recorderRecording: 'Sedang merekam. Bacakan ayat di atas sampai selesai.',
  recorderPreview: 'Dengarkan dulu, lalu simpan kalau sudah pas.',
  recorderSaving: 'Menyimpan…',
  recorderSaved: 'Rekaman tersimpan.',
  recorderCapWarning: 'Hampir 10 menit. Rekaman berhenti otomatis.',
  recorderCapReached: 'Rekaman berhenti di batas 10 menit.',
  recordStart: 'Mulai merekam',
  recordStop: 'Berhenti',
  recordSave: 'Simpan',
  recordRetake: 'Rekam ulang',
  recordDiscard: 'Buang',
  recordClose: 'Tutup',
  recordRetry: 'Coba lagi',
  recordReplace: 'Ganti',
  recordCancel: 'Batal',
  recordConfirmReplace: 'Ayat ini sudah punya rekaman. Ganti dengan yang baru?',
  recordDenied:
    'Akses mikrofon ditolak. Izinkan mikrofon untuk situs ini di pengaturan browser, lalu coba lagi.',
  recordNoMic: 'Mikrofon tidak ditemukan di perangkat ini. Sambungkan mikrofon lalu coba lagi.',
  recordUnsupported:
    'Browser ini tidak bisa merekam dalam format yang bisa disimpan. Coba Chrome atau Safari terbaru.',
  recordFailed: 'Rekaman gagal disimpan. Coba lagi.',
  recordQuota: 'Penyimpanan tidak cukup: rekaman ini butuh {need} MB, tersedia {free} MB.',
  recordMeta: 'Durasi {time} · {size} KB',
  recordTimer: 'Durasi rekaman',
  recordPreview: 'Pratinjau rekaman',
  libraryOpen: 'Perpustakaan',
  libraryTitle: 'Perpustakaan',
  libraryTagline: 'Rekaman hanya tersimpan di perangkat ini. Ekspor sebagai cadangan.',
  libraryLoading: 'Memuat rekaman…',
  libraryEmpty: 'Belum ada rekaman. Buka halaman, lalu ketuk bagian surah untuk mulai merekam.',
  libraryLoadError: 'Rekaman gagal dimuat. Coba muat ulang halaman.',
  libraryCount: '{count} rekaman',
  clipMeta: 'Halaman {page} · {surah} · Ayat {from}–{to}',
  clipStats: '{time} · {size} · {date}',
  clipRename: 'Ubah nama',
  clipRenameLabel: 'Nama rekaman',
  clipRenameSave: 'Simpan nama',
  clipDelete: 'Hapus',
  clipDeleteConfirm: 'Hapus rekaman ini? Berkas audio ikut terhapus dari perangkat.',
  clipExport: 'Ekspor',
  clipExportAll: 'Ekspor semua ({count})',
  clipExporting: 'Mengekspor {done} dari {total}…',
  clipExported:
    'Unduhan dimulai. Browser mungkin meminta izin mengunduh beberapa berkas sekaligus.',
  clipExportFailed: 'Ekspor gagal. Coba lagi.',
  clipRenameFailed: 'Nama gagal diubah. Coba lagi.',
  clipDeleteFailed: 'Rekaman gagal dihapus. Coba lagi.',
  storageUsed: 'Terpakai {used} dari kuota {quota}.',
  storageFree: '{free} masih tersedia untuk rekaman baru.',
  storageUnknown: 'Browser ini tidak melaporkan kuota penyimpanan.',
  storagePersistOn: 'Browser sudah berkomitmen menyimpan rekaman.',
  storagePersistOff:
    'Browser bisa menghapus rekaman saat penyimpanan penuh. Ekspor sebagai cadangan.',
  playerLabel: 'Pemutar rekaman',
  playerPage: 'Halaman {page}',
  playerPlay: 'Putar',
  playerPause: 'Jeda',
  playerPrevious: 'Rekaman sebelumnya',
  playerNext: 'Rekaman berikutnya',
  playerRepeatMode: 'Mode ulangan',
  playerRepeatOff: 'Ulangi: nonaktif',
  playerRepeatOne: 'Ulangi: satu',
  playerRepeatAll: 'Ulangi: semua',
  playerRepeatCount: 'Ulangi: {count}×',
  playerRemainingLabel: 'Sisa {time}',
  followPage: 'Buka halaman yang diputar',
  followAyah: 'Kembali ke ayat yang diputar',
  languageLabel: 'Bahasa',
  aboutOpen: 'Tentang',
  aboutTitle: 'Tentang ngajiPlay',
  aboutTagline:
    'Aplikasi kecil untuk mengulang bacaan Al-Qur’an anak langsung di halaman Madani.',
  aboutQuranTitle: 'Teks Al-Qur’an',
  aboutQuranBody: 'Teks Arab dan batas halaman Madani berasal dari {source}.',
  aboutCopyrightLabel: 'Pemberitahuan hak cipta dari Tanzil:',
  aboutTanzilLink: 'Buka tanzil.net',
  aboutFontTitle: 'Huruf Arab',
  aboutFontBody:
    'Amiri Quran oleh Khaled Hosny, dengan lisensi SIL Open Font License 1.1. Berkas huruf di sini hanya memuat huruf yang dipakai teks Al-Qur’an.',
  aboutFontLicense: 'Baca lisensi OFL',
  aboutPrivacyTitle: 'Rekaman dan privasi',
  aboutPrivacyBody:
    'Rekaman hanya tersimpan di perangkat ini. Tidak ada akun, iklan, atau telemetri; berkas hanya keluar lewat ekspor yang Anda minta sendiri.',
  aboutLoadError: 'Teks lisensi gagal dimuat. Periksa koneksi lalu muat ulang.',
  hintTitle: 'Cara pakai',
  hintStep1: 'Cari halaman atau surah yang sedang dibaca.',
  hintStep2: 'Ketuk bagian surah, lalu rekam bacaan anak.',
  hintStep3: 'Putar ulang: halaman ikut berpindah dan ayat yang dibaca ditandai.',
  hintClose: 'Tutup',
  surahIndexTitle: 'Semua surah',
  playerLoadFailed: 'Rekaman ini gagal diputar. Coba pilih lagi dari perpustakaan.',
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
  recordSliceLabel: 'Record {surah} ayah {from}–{to}',
  playSliceLabel: 'Play {surah} ayah {from}–{to}',
  recorderLabel: 'Recorder',
  recorderTitle: 'Record {surah} · Ayah {from}–{to}',
  recorderReady: 'Press start, then recite the ayahs above to the end.',
  recorderPreparing: 'Opening the microphone…',
  recorderRecording: 'Recording. Recite the ayahs above to the end.',
  recorderPreview: 'Listen first, then save it if it sounds right.',
  recorderSaving: 'Saving…',
  recorderSaved: 'Recording saved.',
  recorderCapWarning: 'Almost 10 minutes. Recording stops automatically.',
  recorderCapReached: 'Recording stopped at the 10-minute limit.',
  recordStart: 'Start recording',
  recordStop: 'Stop',
  recordSave: 'Save',
  recordRetake: 'Record again',
  recordDiscard: 'Discard',
  recordClose: 'Close',
  recordRetry: 'Try again',
  recordReplace: 'Replace',
  recordCancel: 'Cancel',
  recordConfirmReplace: 'This slice already has a recording. Replace it with the new one?',
  recordDenied:
    'Microphone access was denied. Allow the microphone for this site in your browser settings, then try again.',
  recordNoMic: 'No microphone was found on this device. Connect one and try again.',
  recordUnsupported:
    'This browser cannot record audio in a format that can be saved. Try the latest Chrome or Safari.',
  recordFailed: 'The recording could not be saved. Try again.',
  recordQuota: 'Not enough storage: this recording needs {need} MB, {free} MB available.',
  recordMeta: 'Length {time} · {size} KB',
  recordTimer: 'Recording length',
  recordPreview: 'Recording preview',
  libraryOpen: 'Library',
  libraryTitle: 'Library',
  libraryTagline: 'Recordings stay on this device only. Export them as a backup.',
  libraryLoading: 'Loading recordings…',
  libraryEmpty: 'No recordings yet. Open a page, then tap a surah part to start recording.',
  libraryLoadError: 'The recordings could not be loaded. Try reloading the page.',
  libraryCount: '{count} recordings',
  clipMeta: 'Page {page} · {surah} · Ayah {from}–{to}',
  clipStats: '{time} · {size} · {date}',
  clipRename: 'Rename',
  clipRenameLabel: 'Recording name',
  clipRenameSave: 'Save name',
  clipDelete: 'Delete',
  clipDeleteConfirm: 'Delete this recording? The audio file is removed from this device.',
  clipExport: 'Export',
  clipExportAll: 'Export all ({count})',
  clipExporting: 'Exporting {done} of {total}…',
  clipExported: 'Downloads started. The browser may ask permission for several files at once.',
  clipExportFailed: 'The export failed. Try again.',
  clipRenameFailed: 'The name could not be changed. Try again.',
  clipDeleteFailed: 'The recording could not be deleted. Try again.',
  storageUsed: 'Using {used} of a {quota} quota.',
  storageFree: '{free} still free for new recordings.',
  storageUnknown: 'This browser does not report a storage quota.',
  storagePersistOn: 'The browser has committed to keeping your recordings.',
  storagePersistOff:
    'The browser may evict recordings when storage runs low. Export them as a backup.',
  playerLabel: 'Recording player',
  playerPage: 'Page {page}',
  playerPlay: 'Play',
  playerPause: 'Pause',
  playerPrevious: 'Previous recording',
  playerNext: 'Next recording',
  playerRepeatMode: 'Repeat mode',
  playerRepeatOff: 'Repeat: off',
  playerRepeatOne: 'Repeat: one',
  playerRepeatAll: 'Repeat: all',
  playerRepeatCount: 'Repeat: {count}×',
  playerRemainingLabel: '{time} left',
  followPage: 'Open the playing page',
  followAyah: 'Back to the playing ayah',
  languageLabel: 'Language',
  aboutOpen: 'About',
  aboutTitle: 'About ngajiPlay',
  aboutTagline: 'A small app for replaying a child’s recitation on the Madani page itself.',
  aboutQuranTitle: 'The Quran text',
  aboutQuranBody: 'The Arabic text and the Madani page boundaries come from {source}.',
  aboutCopyrightLabel: 'Copyright notice from Tanzil:',
  aboutTanzilLink: 'Open tanzil.net',
  aboutFontTitle: 'Arabic typeface',
  aboutFontBody:
    'Amiri Quran by Khaled Hosny, under the SIL Open Font License 1.1. The font file here carries only the glyphs the Quran text needs.',
  aboutFontLicense: 'Read the OFL licence',
  aboutPrivacyTitle: 'Recordings and privacy',
  aboutPrivacyBody:
    'Recordings stay on this device only. No accounts, no ads, no telemetry; a file leaves only through an export you ask for.',
  aboutLoadError: 'The licence text could not be loaded. Check the connection and reload.',
  hintTitle: 'How it works',
  hintStep1: 'Find the page or surah being read.',
  hintStep2: 'Tap a surah part, then record the recitation.',
  hintStep3: 'Play it back: the page follows and the ayahs being read are marked.',
  hintClose: 'Close',
  surahIndexTitle: 'All surahs',
  playerLoadFailed: 'This recording could not be played. Pick it again from the library.',
  loading: 'Loading…',
  loadError: 'The Quran data failed to load. Check the connection and reload.',
  pageMissing: 'Page {page} does not exist. Madani pages run from 1 to 604.',
  pageTitle: 'Page {page} · ngajiPlay',
};

export const strings: Record<Language, Record<StringKey, string>> = { id, en };

export const LANGUAGES: readonly Language[] = ['id', 'en'];

// Indonesian is the default whatever the browser locale says (REQ §4); the
// stored choice is applied before the first paint by `initLanguage()`.
let language: Language = 'id';
const listeners = new Set<(language: Language) => void>();

export function currentLanguage(): Language {
  return language;
}

/** Switches the dictionary and tells every mounted view to repaint (FR-7.3). */
export function applyLanguage(next: Language): void {
  if (next === language) return;
  language = next;
  for (const listener of listeners) listener(next);
}

export function onLanguageChange(listener: (language: Language) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
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
