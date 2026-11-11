import { getSetting, setSetting } from './store/db';
import { applyLanguage, type Language } from './strings';

const KEY = 'language';

export function isLanguage(value: unknown): value is Language {
  return value === 'id' || value === 'en';
}

/**
 * Reads the saved choice before the first paint, so the app never flashes
 * Indonesian at someone who chose English (FR-7.3).
 */
export async function initLanguage(): Promise<Language> {
  let stored: Language = 'id';
  try {
    const value = await getSetting<unknown>(KEY, 'id');
    if (isLanguage(value)) stored = value;
  } catch {
    // An unreadable store means the default, not a broken start.
  }

  applyLanguage(stored);
  document.documentElement.lang = stored;
  return stored;
}

export async function switchLanguage(next: Language): Promise<void> {
  applyLanguage(next);
  document.documentElement.lang = next;
  try {
    await setSetting(KEY, next);
  } catch {
    // The choice still applies for this session; persistence is best-effort.
  }
}
