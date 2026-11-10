const ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'] as const;

/** Arabic-Indic digits, as the Madani mushaf prints ayah numbers. */
export function arabicDigits(value: number | string): string {
  return String(value).replace(/\d/g, (digit) => ARABIC_INDIC[Number(digit)] ?? digit);
}

/**
 * U+06DD is an *enclosing* mark: the digits must follow it with no separator
 * for the ornament to wrap them, which is why they are one string (REQ §8.2).
 */
export function ayahMedallion(ayah: number): string {
  return `\u06DD${arabicDigits(ayah)}`;
}

/** `0:04`, `9:59` — minutes and padded seconds, so the digits do not jump. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Rounded up, so a 400-byte clip never reads "0 KB". */
export function formatKilobytes(bytes: number): string {
  return String(Math.max(1, Math.ceil(bytes / 1024)));
}

/** `1,2 MB` — one decimal, Indonesian comma, growing a unit only when it helps. */
export function formatFileSize(bytes: number): string {
  const kilobyte = 1024;
  const megabyte = kilobyte * 1024;
  const gigabyte = megabyte * 1024;

  if (bytes >= gigabyte) return `${(bytes / gigabyte).toFixed(1).replace('.', ',')} GB`;
  if (bytes >= megabyte) return `${(bytes / megabyte).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.ceil(bytes / kilobyte))} KB`;
}

/** `10 Nov 2026` in the app's language, used by the library (FR-4.1). */
export function formatDate(ms: number, language: 'id' | 'en' = 'id'): string {
  return new Date(ms).toLocaleDateString(language === 'id' ? 'id-ID' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
