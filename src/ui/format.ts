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
