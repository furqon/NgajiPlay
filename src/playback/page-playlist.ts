import { pageCount } from '../data/quran';
import type { Clip } from '../types';

export interface PageSelection {
  pages: number[];
  invalid: string[];
}

export function parsePageSelection(input: string): PageSelection {
  const tokens = input.trim().split(/[\s,]+/).filter(Boolean);
  const pages: number[] = [];
  const invalid: string[] = [];

  for (const token of tokens) {
    if (!/^\d+$/.test(token)) {
      invalid.push(token);
      continue;
    }

    const page = Number(token);
    if (page < 1 || page > pageCount) {
      invalid.push(token);
      continue;
    }

    if (!pages.includes(page)) pages.push(page);
  }

  pages.sort((a, b) => a - b);
  return { pages, invalid };
}

export function clampPlaylistRepeat(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(99, Math.max(1, Math.trunc(value)));
}

export function pageQueue(clips: readonly Clip[], pages: readonly number[]): Clip[] {
  const selected = new Set(pages);
  return clips
    .filter((clip) => selected.has(clip.page))
    .sort(
      (a, b) => a.page - b.page || a.surah - b.surah || a.ayahStart - b.ayahStart,
    );
}
