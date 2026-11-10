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
