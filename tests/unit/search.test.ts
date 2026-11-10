import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { page } from '../../src/data/quran';
import { searchQuran, surahStartPage } from '../../src/data/search';
import type { QuranData } from '../../src/types';

const data: QuranData = JSON.parse(
  readFileSync(new URL('../../public/quran.json', import.meta.url), 'utf8'),
);

describe('surahStartPage', () => {
  it('maps known surahs to the page they begin on', () => {
    expect(surahStartPage(data, 1)).toBe(1);
    expect(surahStartPage(data, 2)).toBe(2);
    expect(surahStartPage(data, 9)).toBe(187);
    expect(surahStartPage(data, 114)).toBe(604);
  });

  it('lands on a page whose slice opens that surah', () => {
    for (let number = 1; number <= 114; number += 1) {
      const start = surahStartPage(data, number);
      const slices = page(data, start).slices;
      expect(slices, `surah ${number} should start on page ${start}`).toContainEqual({
        surah: number,
        ayahStart: 1,
        ayahEnd: expect.any(Number),
      });
    }
  });
});

describe('searchQuran', () => {
  it('reads a page number, and a number that is also a surah as both', () => {
    const result = searchQuran(data, '100');
    expect(result.pageError).toBe(false);
    // 100 is page 100 and also surah 100 (Al-'Adiyat), which begins on p599.
    expect(result.pages.map((hit) => hit.page)).toEqual([100, 599]);
    expect(result.pages[0]?.slices.length).toBeGreaterThan(0);

    // 300 cannot be a surah number, so it is one row.
    expect(searchQuran(data, '300').pages.map((hit) => hit.page)).toEqual([300]);
  });

  it('reads a small number as both page and surah, deduped when they coincide', () => {
    // Surah 2 begins on page 2, so one row is enough.
    expect(searchQuran(data, '2').pages.map((hit) => hit.page)).toEqual([2]);
    // 114 is both page 114 and An-Nas, which begins on page 604.
    expect(searchQuran(data, '114').pages.map((hit) => hit.page)).toEqual([114, 604]);
  });

  it('finds surahs by number and by both names', () => {
    expect(searchQuran(data, '18').pages.map((hit) => hit.page)).toEqual([18, 293]);
    expect(searchQuran(data, 'Al-Baqarah').pages.map((hit) => hit.page)).toEqual([2]);
    expect(searchQuran(data, 'fatihah').pages.map((hit) => hit.page)).toEqual([1]);
    expect(searchQuran(data, 'The Cave').pages.map((hit) => hit.page)).toEqual([293]);
  });

  it('rejects page numbers outside 1–604 instead of returning a hit', () => {
    for (const query of ['0', '605', '9999']) {
      const result = searchQuran(data, query);
      expect(result.pageError, `${query} should be rejected`).toBe(true);
      expect(result.pages).toEqual([]);
    }
  });

  it('separates “no match” from “invalid input” and ignores blank input', () => {
    const unknown = searchQuran(data, 'zzzz');
    expect(unknown.pages).toEqual([]);
    expect(unknown.pageError).toBe(false);

    const blank = searchQuran(data, '   ');
    expect(blank.pages).toEqual([]);
    expect(blank.pageError).toBe(false);
  });

  it('only returns pages that exist and have slices', () => {
    for (const query of ['1', '604', 'nas', 'kahf', '18']) {
      for (const hit of searchQuran(data, query).pages) {
        expect(hit.page).toBeGreaterThanOrEqual(1);
        expect(hit.page).toBeLessThanOrEqual(604);
        expect(hit.slices.length).toBeGreaterThan(0);
      }
    }
  });
});
