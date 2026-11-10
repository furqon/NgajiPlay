export type Language = 'id' | 'en';

export const strings: Record<Language, Record<'tagline' | 'ready' | 'firstLoad' | 'offline' | 'noSw', string>> = {
  id: {
    tagline: 'Rekam bacaan Al-Qur’an anak, lalu putar ulang sambil melihat halamannya.',
    ready: 'Siap dipakai offline',
    firstLoad: 'Buka sekali lagi dengan internet untuk menyiapkan mode offline',
    offline: 'Sedang offline',
    noSw: 'Mode offline tidak tersedia di browser ini',
  },
  en: {
    tagline: 'Record your child’s recitation, then play it back on the page itself.',
    ready: 'Ready offline',
    firstLoad: 'Open once more with a connection to enable offline mode',
    offline: 'You are offline',
    noSw: 'Offline mode is not available in this browser',
  },
};

/**
 * Indonesian is always the default (REQ §4), regardless of browser locale.
 * Phase 7 replaces this with the persisted switcher value.
 */
export function currentLanguage(): Language {
  return 'id';
}

export function t(key: keyof (typeof strings)['id'], language: Language = currentLanguage()): string {
  return strings[language][key];
}
