import { describe, expect, it } from 'vitest';
import {
  CODEC_PREFERENCES,
  defaultClipName,
  extensionFor,
  pickMimeType,
  surahSlug,
} from '../../src/recording/clip';

describe('pickMimeType', () => {
  it('prefers AAC-in-MP4, and never asks for bare audio/mp4', () => {
    expect(CODEC_PREFERENCES[0]).toBe('audio/mp4;codecs=mp4a.40.2');
    expect(CODEC_PREFERENCES).not.toContain('audio/mp4');
    expect(pickMimeType(() => true)).toBe('audio/mp4;codecs=mp4a.40.2');
  });

  it('falls back to Opus in WebM, then to nothing', () => {
    expect(pickMimeType((type) => type.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
    expect(pickMimeType(() => false)).toBeNull();
  });
});

describe('extensionFor', () => {
  it('derives the extension from the real codec', () => {
    expect(extensionFor('audio/mp4;codecs=mp4a.40.2')).toBe('m4a');
    // Chromium's answer to bare audio/mp4 is Opus in MP4 — not an .m4a (REQ §8.3).
    expect(extensionFor('audio/mp4;codecs=opus')).toBe('mp4');
    expect(extensionFor('audio/mp4')).toBe('mp4');
    expect(extensionFor('audio/webm;codecs=opus')).toBe('webm');
    expect(extensionFor('audio/webm')).toBe('webm');
  });

  it('is case-insensitive and honest about unknown types', () => {
    expect(extensionFor('AUDIO/MP4;CODECS=MP4A.40.2')).toBe('m4a');
    expect(extensionFor('audio/x-made-up')).toBe('bin');
  });
});

describe('surahSlug', () => {
  it('produces a filename-safe transliteration', () => {
    expect(surahSlug('Al-Fatihah')).toBe('al-fatihah');
    expect(surahSlug("Al-'Adiyat")).toBe('al-adiyat');
    expect(surahSlug('An-Nas')).toBe('an-nas');
    expect(surahSlug('  Quraysh ')).toBe('quraysh');
    expect(surahSlug('?!')).toBe('surah');
  });
});

describe('defaultClipName', () => {
  const base = {
    page: 42,
    surah: 1,
    ayahStart: 1,
    ayahEnd: 7,
    surahName: 'Al-Fatihah',
  } as const;

  it('matches FR-3.1 exactly', () => {
    expect(defaultClipName({ ...base, extension: 'm4a' })).toBe(
      'p042-s001-al-fatihah-a001-007.m4a',
    );
  });

  it('pads every number to three digits and uses the real extension', () => {
    expect(
      defaultClipName({
        page: 604,
        surah: 114,
        ayahStart: 1,
        ayahEnd: 6,
        surahName: 'An-Nas',
        extension: 'webm',
      }),
    ).toBe('p604-s114-an-nas-a001-006.webm');

    expect(
      defaultClipName({
        page: 5,
        surah: 2,
        ayahStart: 255,
        ayahEnd: 255,
        surahName: 'Al-Baqarah',
        extension: 'mp4',
      }),
    ).toBe('p005-s002-al-baqarah-a255-255.mp4');
  });
});
