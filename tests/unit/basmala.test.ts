import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BASMALA, shouldSplitBasmala, splitBasmala } from '../../src/data/basmala';
import type { QuranData } from '../../src/types';

const data: QuranData = JSON.parse(
  readFileSync(new URL('../../public/quran.json', import.meta.url), 'utf8'),
);

const ayah = (surah: number, number: number): string => {
  const text = data.surahs[surah - 1]?.ayahs[number - 1];
  if (text === undefined) throw new Error(`missing ${surah}:${number}`);
  return text;
};

describe('splitBasmala', () => {
  it('treats 1:1 as the basmala itself', () => {
    const split = splitBasmala(ayah(1, 1), ayah(1, 1));
    expect(split.basmala).toBe(ayah(1, 1));
    expect(split.body).toBe('');
  });

  it('strips the basmala from 2:1 and keeps the ayah', () => {
    const text = ayah(2, 1);
    const split = splitBasmala(text, DEFAULT_BASMALA);
    expect(split.basmala).not.toBeNull();
    expect(split.body.length).toBeGreaterThan(0);
    // The body is exactly the ayah minus the matched prefix.
    expect(split.body).toBe(text.slice(split.basmala?.length ?? 0).trimStart());
  });

  it('leaves surah 9 alone, which has no basmala', () => {
    const text = ayah(9, 1);
    expect(splitBasmala(text, DEFAULT_BASMALA)).toEqual({ basmala: null, body: text });
  });

  it('leaves 27:30 alone, where the basmala is mid-verse', () => {
    const text = ayah(27, 30);
    expect(splitBasmala(text, DEFAULT_BASMALA)).toEqual({ basmala: null, body: text });
  });

  it('splits all 112 prefixed surahs, including 95 and 97', () => {
    const prefixed: number[] = [];
    for (let surah = 2; surah <= 114; surah += 1) {
      if (surah === 9) continue;
      const split = splitBasmala(ayah(surah, 1), DEFAULT_BASMALA);
      if (split.basmala !== null) prefixed.push(surah);
    }
    expect(prefixed).toHaveLength(112);
    expect(prefixed).toContain(95);
    expect(prefixed).toContain(97);
  });

  it('needs the diacritic-insensitive match: a literal prefix fails on 95 and 97', () => {
    // Regression guard for REQ §8: those two surahs carry an extra shadda, so a
    // naive startsWith() comparison splits only 110 of the 112.
    const literal = [95, 97].filter((surah) => ayah(surah, 1).startsWith(DEFAULT_BASMALA));
    expect(literal).toEqual([]);
  });

  it('does not split a word that merely starts with the same letters', () => {
    const text = `${DEFAULT_BASMALA.replace(' ', '')}extra`;
    expect(splitBasmala(text, DEFAULT_BASMALA).basmala).toBeNull();
  });
});

describe('shouldSplitBasmala', () => {
  it('applies to ayah 1 of every surah except 1 and 9', () => {
    expect(shouldSplitBasmala(1, 1)).toBe(false);
    expect(shouldSplitBasmala(9, 1)).toBe(false);
    expect(shouldSplitBasmala(2, 1)).toBe(true);
    expect(shouldSplitBasmala(114, 1)).toBe(true);
    expect(shouldSplitBasmala(2, 2)).toBe(false);
  });
});
