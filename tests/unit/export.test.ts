import { describe, expect, it } from 'vitest';
import { exportFileName, sanitiseFileName } from '../../src/recording/export';
import type { Clip } from '../../src/types';

const AAC = 'audio/mp4;codecs=mp4a.40.2';
const OPUS_MP4 = 'audio/mp4;codecs=opus';
const WEBM = 'audio/webm;codecs=opus';

function clip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: '2:2',
    page: 2,
    surah: 2,
    ayahStart: 1,
    ayahEnd: 5,
    mimeType: AAC,
    bytes: 12_000,
    durationMs: 4_000,
    createdAt: 1_760_000_000_000,
    displayName: 'p002-s002-al-baqarah-a001-005.m4a',
    ...overrides,
  };
}

describe('sanitiseFileName', () => {
  it('replaces characters that a filesystem would reject', () => {
    expect(sanitiseFileName('Bacaan <Ali>: "halaman"/2\\ayat|1?*')).toBe(
      'Bacaan-Ali-halaman-2-ayat-1',
    );
  });

  it('collapses whitespace and repeated dashes into one dash', () => {
    expect(sanitiseFileName('  Ngaji   Ali  --  pagi ')).toBe('Ngaji-Ali-pagi');
  });

  it('drops leading and trailing dots, spaces and dashes (Windows rejects trailing dots)', () => {
    expect(sanitiseFileName('.. Bacaan Ali. ')).toBe('Bacaan-Ali');
  });

  it('drops control characters instead of keeping them', () => {
    expect(sanitiseFileName('Bacaan\u0007Ali\u001f')).toBe('Bacaan-Ali');
  });

  it('keeps non-Latin letters, which are valid on every target platform', () => {
    expect(sanitiseFileName('سورة الفاتحة')).toBe('سورة-الفاتحة');
  });

  it('returns an empty string when nothing usable is left', () => {
    expect(sanitiseFileName(' <>:"/\\|?* ')).toBe('');
  });

  it('caps the length so long display names stay writable', () => {
    expect(sanitiseFileName('a'.repeat(200)).length).toBe(80);
  });
});

describe('exportFileName', () => {
  it('keeps the deterministic name for an AAC clip', () => {
    expect(exportFileName(clip())).toBe('p002-s002-al-baqarah-a001-005.m4a');
  });

  it('uses the extension of the real codec, not the requested one', () => {
    expect(exportFileName(clip({ mimeType: OPUS_MP4 }))).toBe(
      'p002-s002-al-baqarah-a001-005.mp4',
    );
    expect(exportFileName(clip({ mimeType: WEBM }))).toBe('p002-s002-al-baqarah-a001-005.webm');
  });

  it('adds page and surah for uniqueness after a rename (FR-3.3)', () => {
    expect(exportFileName(clip({ displayName: 'Bacaan Ali' }))).toBe('Bacaan-Ali-p002-s002.m4a');
  });

  it('sanitises a renamed clip rather than passing the raw text to the download', () => {
    expect(exportFileName(clip({ displayName: 'Ali/Bacaan: "pagi"' }))).toBe(
      'Ali-Bacaan-pagi-p002-s002.m4a',
    );
  });

  it('does not duplicate the ids when the display name already carries them', () => {
    expect(exportFileName(clip({ displayName: 'p002-s002-al-baqarah-a001-005.WEBM' }))).toBe(
      'p002-s002-al-baqarah-a001-005.m4a',
    );
  });

  it('falls back to the ids when the display name sanitises to nothing', () => {
    expect(exportFileName(clip({ displayName: '///' }))).toBe('p002-s002.m4a');
  });

  it('keeps the extension of the codec even when the display name lies about it', () => {
    expect(exportFileName(clip({ displayName: 'p002-s002-pagi.mp4', mimeType: WEBM }))).toBe(
      'p002-s002-pagi.webm',
    );
  });

  it('pads page and surah so files sort in mushaf order', () => {
    expect(exportFileName(clip({ page: 7, surah: 3, displayName: 'Ngaji' }))).toBe(
      'Ngaji-p007-s003.m4a',
    );
  });
});
