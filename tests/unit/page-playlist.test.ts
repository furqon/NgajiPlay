import { describe, expect, it } from 'vitest';
import {
  clampPlaylistRepeat,
  pageQueue,
  parsePageSelection,
} from '../../src/playback/page-playlist';
import type { Clip } from '../../src/types';

function clip(id: string, page: number, surah: number, ayahStart = 1): Clip {
  return {
    id,
    page,
    surah,
    ayahStart,
    ayahEnd: ayahStart + 3,
    mimeType: 'audio/webm;codecs=opus',
    bytes: 2048,
    durationMs: 2_000,
    createdAt: 0,
    updatedAt: 0,
    displayName: `Rekaman ${id}`,
  };
}

describe('parsePageSelection', () => {
  it('reads comma- and space-separated pages in ascending order', () => {
    expect(parsePageSelection('507, 506')).toEqual({ pages: [506, 507], invalid: [] });
    expect(parsePageSelection('506 507')).toEqual({ pages: [506, 507], invalid: [] });
    expect(parsePageSelection(' 506 ,  507 ')).toEqual({ pages: [506, 507], invalid: [] });
  });

  it('drops duplicate pages', () => {
    expect(parsePageSelection('506, 506, 507')).toEqual({ pages: [506, 507], invalid: [] });
  });

  it('reports text and pages outside 1–604 instead of guessing', () => {
    expect(parsePageSelection('0, 605, abc, 506')).toEqual({
      pages: [506],
      invalid: ['0', '605', 'abc'],
    });
  });

  it('treats an empty box as no selection', () => {
    expect(parsePageSelection('   ')).toEqual({ pages: [], invalid: [] });
  });
});

describe('clampPlaylistRepeat', () => {
  it('keeps the repeat count between 1 and 99', () => {
    expect(clampPlaylistRepeat(2)).toBe(2);
    expect(clampPlaylistRepeat(3.9)).toBe(3);
    expect(clampPlaylistRepeat(0)).toBe(1);
    expect(clampPlaylistRepeat(-5)).toBe(1);
    expect(clampPlaylistRepeat(1_000)).toBe(99);
    expect(clampPlaylistRepeat(Number.NaN)).toBe(1);
  });
});

describe('pageQueue', () => {
  it('keeps only the chosen pages, in fixed playlist order', () => {
    const clips = [
      clip('507:57', 507, 57, 3),
      clip('1:1', 1, 1),
      clip('506:56', 506, 56, 2),
      clip('506:54', 506, 54, 1),
      clip('507:57a', 507, 57, 1),
    ];

    expect(pageQueue(clips, [507, 506]).map((item) => item.id)).toEqual([
      '506:54',
      '506:56',
      '507:57a',
      '507:57',
    ]);
  });

  it('returns an empty queue when nothing on those pages is recorded', () => {
    expect(pageQueue([clip('1:1', 1, 1)], [506, 507])).toEqual([]);
  });
});
