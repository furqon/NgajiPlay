import type { PageSlice, QuranData } from '../types';
import { findSurahs, pageCount, slicesOnPage, surah } from './quran';

export interface PageHit {
  page: number;
  slices: PageSlice[];
}

export interface SearchResult {
  /** Pages to open, nearest page number first. */
  pages: PageHit[];
  /** True when the query was a number outside 1–604 (FR-1.1). */
  pageError: boolean;
}

/**
 * Page on which a surah begins. Page ranges are stored as global ayah offsets,
 * so the lookup is a binary search over the 604 pages rather than a scan.
 */
export function surahStartPage(data: QuranData, number: number): number {
  const target = surah(data, number).start;

  let low = 0;
  let high = data.pages.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    const candidate = data.pages[middle];
    if (candidate && candidate.from <= target) low = middle;
    else high = middle - 1;
  }

  const found = data.pages[low];
  if (!found) throw new RangeError(`no page contains ayah offset ${target}`);
  return found.number;
}

/**
 * One search box for both searches (FR-1.1, FR-1.2). A number is read as a
 * page *and* as a surah number, because both are valid and the two hits are
 * shown as separate rows instead of guessing which one was meant.
 */
export function searchQuran(data: QuranData, query: string): SearchResult {
  const trimmed = query.trim();
  if (trimmed === '') return { pages: [], pageError: false };

  const hits = new Set<number>();
  let pageError = false;

  if (/^\d+$/.test(trimmed)) {
    const number = Number(trimmed);
    if (number < 1 || number > pageCount) pageError = true;
    else hits.add(number);
  }

  for (const match of findSurahs(data, trimmed)) {
    hits.add(surahStartPage(data, match.n));
  }

  return {
    pages: [...hits].sort((a, b) => a - b).map((number) => ({ page: number, slices: slicesOnPage(data, number) })),
    pageError,
  };
}
