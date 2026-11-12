import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  defaultImportAction,
  parseExportFileName,
  readImportFiles,
  type DecodedAudio,
} from '../../src/recording/import';
import type { Clip, QuranData } from '../../src/types';

const data: QuranData = JSON.parse(
  readFileSync(new URL('../../public/quran.json', import.meta.url), 'utf8'),
);

const MODIFIED = Date.UTC(2026, 10, 10, 9, 0);

function file(name: string, type = '', lastModified = MODIFIED): File {
  return new File([new Uint8Array(32)], name, { type, lastModified });
}

const decode = async (): Promise<DecodedAudio> => ({ durationMs: 4_321, channels: 1 });

function clip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: '2:2',
    page: 2,
    surah: 2,
    ayahStart: 1,
    ayahEnd: 5,
    mimeType: 'audio/webm;codecs=opus',
    bytes: 32,
    durationMs: 4_321,
    createdAt: MODIFIED,
    updatedAt: MODIFIED,
    displayName: 'p002-s002-al-baqarah-a001-005.webm',
    ...overrides,
  };
}

describe('parseExportFileName', () => {
  it('reads the exported page and surah from the default name', () => {
    expect(parseExportFileName('p002-s002-al-baqarah-a001-005.m4a')).toEqual({
      page: 2,
      surah: 2,
    });
  });

  it('still finds the ids exportFileName appends after a rename', () => {
    expect(parseExportFileName('Bacaan-Ali-p002-s002.webm')).toEqual({ page: 2, surah: 2 });
    expect(parseExportFileName('Ali-p001-s001-p002-s002.webm')).toEqual({ page: 2, surah: 2 });
  });

  it('does not guess when the exported token is missing or malformed', () => {
    expect(parseExportFileName('Bacaan Ali.webm')).toBeNull();
    expect(parseExportFileName('p2-s2.webm')).toBeNull();
    expect(parseExportFileName('p002-s002abc.webm')).toBeNull();
    expect(parseExportFileName('xp002-s002.webm')).toBeNull();
  });
});

describe('readImportFiles', () => {
  it('fills duration, channel, dates and the slice range from the file', async () => {
    const entries = await readImportFiles(
      [file('p002-s002-al-baqarah-a001-005.m4a', 'audio/mp4')],
      data,
      decode,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe('candidate');
    if (entries[0]?.kind !== 'candidate') return;
    expect(entries[0].clip).toMatchObject({
      id: '2:2',
      page: 2,
      surah: 2,
      ayahStart: 1,
      ayahEnd: 5,
      mimeType: 'audio/mp4;codecs=mp4a.40.2',
      bytes: 32,
      durationMs: 4_321,
      createdAt: MODIFIED,
      updatedAt: MODIFIED,
      displayName: 'p002-s002-al-baqarah-a001-005.m4a',
      channels: 1,
    });
  });

  it('infers a recorder MIME type when the browser leaves file.type empty', async () => {
    const entries = await readImportFiles(
      [file('p002-s002-al-baqarah.webm', '', MODIFIED)],
      data,
      decode,
    );

    expect(entries[0]?.kind).toBe('candidate');
    if (entries[0]?.kind !== 'candidate') return;
    expect(entries[0].clip.mimeType).toBe('audio/webm');
  });

  it('rejects a MIME type the recorder cannot produce', async () => {
    const entries = await readImportFiles(
      [
        file('p002-s002-al-baqarah.webm', 'text/plain'),
        file('p002-s002-al-baqarah.m4a', 'audio/mp4;codecs=opus'),
      ],
      data,
      decode,
    );

    expect(entries.map((entry) => [entry.kind, entry.kind === 'rejected' ? entry.problem : ''])).toEqual([
      ['rejected', 'unsupported'],
      ['rejected', 'unsupported'],
    ]);
  });

  it('rejects a file without a page/surah token instead of guessing', async () => {
    const entries = await readImportFiles(
      [file('Bacaan Ali.webm', 'audio/webm')],
      data,
      decode,
    );

    expect(entries[0]).toMatchObject({ kind: 'rejected', problem: 'unrecognised' });
  });

  it('rejects a slice that does not exist on the named page', async () => {
    const entries = await readImportFiles(
      [file('p002-s001-al-fatihah.webm', 'audio/webm')],
      data,
      decode,
    );

    expect(entries[0]).toMatchObject({ kind: 'rejected', problem: 'not-on-page' });
  });

  it('rejects audio that cannot be decoded', async () => {
    const entries = await readImportFiles(
      [file('p002-s002-al-baqarah.webm', 'audio/webm')],
      data,
      async () => {
        throw new DOMException('bad audio', 'EncodingError');
      },
    );

    expect(entries[0]).toMatchObject({ kind: 'rejected', problem: 'corrupt' });
  });

  it('keeps only the newest selected file for the same slice', async () => {
    const entries = await readImportFiles(
      [
        file('p002-s002-lama.webm', 'audio/webm', MODIFIED),
        file('p002-s002-baru.webm', 'audio/webm', MODIFIED + 1_000),
      ],
      data,
      decode,
    );

    expect(entries[0]).toMatchObject({ kind: 'rejected', problem: 'duplicate' });
    expect(entries[1]?.kind).toBe('candidate');
    if (entries[1]?.kind !== 'candidate') return;
    expect(entries[1].clip.displayName).toBe('p002-s002-baru.webm');
  });
});

describe('defaultImportAction', () => {
  it('imports a slice with no local clip', () => {
    expect(defaultImportAction(undefined, clip())).toBe('import');
  });

  it('replaces only when the incoming updatedAt is newer', () => {
    const existing = clip({ updatedAt: MODIFIED });
    expect(defaultImportAction(existing, clip({ updatedAt: MODIFIED + 1 }))).toBe('replace');
    expect(defaultImportAction(existing, clip({ updatedAt: MODIFIED }))).toBe('keep');
    expect(defaultImportAction(existing, clip({ updatedAt: MODIFIED - 1 }))).toBe('keep');
  });
});
