import { describe, expect, it } from 'vitest';
import { arabicDigits, ayahMedallion } from '../../src/ui/format';

describe('arabicDigits', () => {
  it('maps every digit to its Arabic-Indic form', () => {
    expect(arabicDigits(0)).toBe('٠');
    expect(arabicDigits(1234567890)).toBe('١٢٣٤٥٦٧٨٩٠');
    expect(arabicDigits(604)).toBe('٦٠٤');
  });

  it('leaves non-digits alone', () => {
    expect(arabicDigits('2:255')).toBe('٢:٢٥٥');
  });
});

describe('ayahMedallion', () => {
  it('keeps the enclosing mark and the digits adjacent', () => {
    // A separator would stop U+06DD from wrapping the number (REQ §8.2).
    expect(ayahMedallion(1)).toBe('\u06DD\u0661');
    expect(ayahMedallion(286)).toHaveLength(4);
    expect(ayahMedallion(286).startsWith('\u06DD')).toBe(true);
  });
});
