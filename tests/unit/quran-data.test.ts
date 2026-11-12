import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ayahText,
  ayahsOnPage,
  findSurahs,
  juzEndPage,
  juzForPage,
  juzStartPage,
  page,
  slicesOnPage,
  startPageOfSurah,
  surah,
} from '../../src/data/quran';
import type { QuranData } from '../../src/types';

const data: QuranData = JSON.parse(
  readFileSync(new URL('../../public/quran.json', import.meta.url), 'utf8'),
);

describe('generated quran.json', () => {
  it('carries the verified counts and licence', () => {
    expect(data.surahs).toHaveLength(114);
    expect(data.pages).toHaveLength(604);
    expect(data.meta.ayahCount).toBe(6236);
    expect(data.meta.pageCount).toBe(604);
    expect(data.meta.license).toBe('Creative Commons Attribution 3.0');
  });

  it('ships the Tanzil copyright block verbatim (FR-7.5)', () => {
    expect(data.meta.copyright).toContain('PLEASE DO NOT REMOVE OR CHANGE THIS COPYRIGHT BLOCK');
    expect(data.meta.copyright).toContain('Tanzil Quran Text (Uthmani, Version 1.1)');
    expect(data.meta.copyright).toContain('tanzil.net');
  });

  it('keeps every ayah reachable exactly once across the 604 pages', () => {
    let total = 0;
    for (let number = 1; number <= 604; number += 1) {
      const slices = slicesOnPage(data, number);
      expect(slices.length, `page ${number} has no slices`).toBeGreaterThan(0);
      for (const slice of slices) {
        total += slice.ayahEnd - slice.ayahStart + 1;
        expect(slice.ayahStart).toBeLessThanOrEqual(slice.ayahEnd);
      }
    }
    expect(total).toBe(6236);
  });

  it('matches known printed Madani pages', () => {
    expect(page(data, 1).slices).toEqual([{ surah: 1, ayahStart: 1, ayahEnd: 7 }]);
    expect(page(data, 2).slices).toEqual([{ surah: 2, ayahStart: 1, ayahEnd: 5 }]);
    expect(page(data, 604).slices).toEqual([
      { surah: 112, ayahStart: 1, ayahEnd: 4 },
      { surah: 113, ayahStart: 1, ayahEnd: 5 },
      { surah: 114, ayahStart: 1, ayahEnd: 6 },
    ]);
  });

  it('returns ayahs in mushaf order for a page', () => {
    const ayahs = ayahsOnPage(data, 2);
    expect(ayahs).toHaveLength(5);
    expect(ayahs[0]).toMatchObject({ surah: 2, ayah: 1 });
    expect(ayahs[4]).toMatchObject({ surah: 2, ayah: 5 });
  });

  it('finds surahs by number, Indonesian name and English name (FR-1.2)', () => {
    expect(findSurahs(data, '2').map((entry) => entry.n)).toEqual([2]);
    expect(findSurahs(data, 'al-baqarah').map((entry) => entry.n)).toEqual([2]);
    expect(findSurahs(data, 'baqarah').map((entry) => entry.n)).toEqual([2]);
    expect(findSurahs(data, 'The Cow').map((entry) => entry.n)).toEqual([2]);
    expect(findSurahs(data, 'yasin').map((entry) => entry.n)).toEqual([36]);
    expect(findSurahs(data, 'An-Nas').map((entry) => entry.n)).toContain(114);
    // "An-Nas" must not drag in Yunus, whose transliteration merely contains "nas".
    expect(findSurahs(data, 'An-Nas').map((entry) => entry.n)).not.toContain(10);
    expect(findSurahs(data, '0')).toEqual([]);
    expect(findSurahs(data, '999')).toEqual([]);
    expect(findSurahs(data, '   ')).toEqual([]);
  });

  it('finds the page every surah opens on, which the index links to', () => {
    expect(startPageOfSurah(data, 1)).toBe(1);
    expect(startPageOfSurah(data, 2)).toBe(2);
    expect(startPageOfSurah(data, 114)).toBe(604);

    // Every surah resolves, its first ayah really is on that page, and the
    // index can only march forward through the mushaf.
    let previous = 0;
    for (const entry of data.surahs) {
      const start = startPageOfSurah(data, entry.n);
      expect(start, `surah ${entry.n}`).toBeGreaterThanOrEqual(previous);
      previous = start;
      const first = slicesOnPage(data, start).find((slice) => slice.surah === entry.n);
      expect(first?.ayahStart, `surah ${entry.n} starts at ayah 1`).toBe(1);
    }
  });

  it('maps the 30 juz onto contiguous Madani page ranges (10C.2)', () => {
    expect(juzStartPage(1)).toBe(1);
    expect(juzStartPage(15)).toBe(282);
    expect(juzStartPage(30)).toBe(582);
    expect(juzEndPage(1)).toBe(21);
    expect(juzEndPage(30)).toBe(604);
    expect(juzForPage(2)).toBe(1);
    expect(juzForPage(604)).toBe(30);

    // Every juz owns every one of its pages, with no gap between neighbours.
    let previousEnd = 0;
    for (let juz = 1; juz <= 30; juz += 1) {
      expect(juzStartPage(juz), `juz ${juz} starts where the last one ended`).toBe(
        previousEnd + 1,
      );
      for (let number = juzStartPage(juz); number <= juzEndPage(juz); number += 1) {
        expect(juzForPage(number), `page ${number}`).toBe(juz);
      }
      previousEnd = juzEndPage(juz);
    }
    expect(previousEnd).toBe(604);

    expect(() => juzStartPage(0)).toThrow(RangeError);
    expect(() => juzStartPage(31)).toThrow(RangeError);
    expect(() => juzForPage(605)).toThrow(RangeError);
  });

  it('rejects out-of-range lookups instead of returning undefined', () => {
    expect(() => surah(data, 115)).toThrow(RangeError);
    expect(() => page(data, 605)).toThrow(RangeError);
    expect(() => ayahText(data, 1, 8)).toThrow(RangeError);
  });

  it('keeps the last ayah of the mushaf on the last page', () => {
    const last = page(data, 604).slices.at(-1);
    expect(last).toEqual({ surah: 114, ayahStart: 1, ayahEnd: 6 });
    expect(ayahText(data, 114, 6)).toBe(data.surahs[113]?.ayahs[5]);
  });
});
