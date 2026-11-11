import type { AyahRef, PageSlice, QuranData, QuranPage, Surah } from '../types';

let loadPromise: Promise<QuranData> | null = null;

/**
 * Loads the generated Quran data once per session and caches the promise, so
 * every caller shares one fetch. The file is precached, so this resolves
 * offline after the first load (FR-7.2).
 */
export function loadQuran(): Promise<QuranData> {
  // BASE_URL so the same build works at / and at a Pages project subpath.
  loadPromise ??= fetch(`${import.meta.env.BASE_URL}quran.json`).then(async (response) => {
    if (!response.ok) {
      throw new Error(`quran.json failed to load: ${response.status}`);
    }
    const data = (await response.json()) as QuranData;
    if (!Array.isArray(data.surahs) || data.surahs.length !== 114) {
      throw new Error('quran.json is missing the 114 surahs');
    }
    if (!Array.isArray(data.pages) || data.pages.length !== 604) {
      throw new Error('quran.json is missing the 604 pages');
    }
    return data;
  });

  return loadPromise;
}

export const pageCount = 604;
export const surahCount = 114;

/** Surah by number, 1–114. */
export function surah(data: QuranData, number: number): Surah {
  const found = data.surahs[number - 1];
  if (!found) throw new RangeError(`surah ${number} is out of range`);
  return found;
}

/** Page by number, 1–604, with its slices in order. */
export function page(data: QuranData, number: number): QuranPage {
  const found = data.pages[number - 1];
  if (!found) throw new RangeError(`page ${number} is out of range`);
  return {
    number: found.number,
    slices: found.slices.map(([surahNumber, ayahStart, ayahEnd]) => ({
      surah: surahNumber,
      ayahStart,
      ayahEnd,
    })),
  };
}

export function slicesOnPage(data: QuranData, number: number): PageSlice[] {
  return page(data, number).slices;
}

/** Every ayah on a page, in mushaf order (FR-1.4). */
export function ayahsOnPage(data: QuranData, number: number): AyahRef[] {
  const ayahs: AyahRef[] = [];
  for (const slice of slicesOnPage(data, number)) {
    for (let ayah = slice.ayahStart; ayah <= slice.ayahEnd; ayah += 1) {
      ayahs.push({ surah: slice.surah, ayah, text: ayahText(data, slice.surah, ayah) });
    }
  }
  return ayahs;
}

/** Text of one ayah, exactly as vendored (FR-1.4, no character changes). */
export function ayahText(data: QuranData, surahNumber: number, ayah: number): string {
  const entry = surah(data, surahNumber);
  const text = entry.ayahs[ayah - 1];
  if (text === undefined) throw new RangeError(`ayah ${surahNumber}:${ayah} is out of range`);
  return text;
}

/** The page a surah opens on: the page that holds its first ayah. */
export function startPageOfSurah(data: QuranData, number: number): number {
  const entry = surah(data, number);
  const found = data.pages.find((item) => item.from <= entry.start && entry.start <= item.to);
  if (!found) throw new RangeError(`surah ${number} starts on no page`);
  return found.number;
}

/** Finds surahs by number or by Indonesian/English name (FR-1.2). */
export function findSurahs(data: QuranData, query: string): Surah[] {
  const trimmed = query.trim();
  if (trimmed === '') return [];

  if (/^\d+$/.test(trimmed)) {
    const number = Number(trimmed);
    if (number < 1 || number > surahCount) return [];
    return [surah(data, number)];
  }

  // Transliterations differ in punctuation and articles ("Ta-Ha" / "Taha",
  // "Al-'Ankabut" / "Ankabut"), so compare folded, article-stripped forms and
  // match from the start of the name.
  const fold = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
      .replace(/^(asy|al|an|as|at|ar|ad|az)/, '');

  const needle = fold(trimmed);
  if (needle === '') return [];

  return data.surahs.filter((entry) => {
    const candidates = [entry.nameId, entry.nameEn, entry.nameMeaning];
    return candidates.some((name) => fold(name).startsWith(needle));
  });
}

/** Only used by tests and the size check; keeps the module honest about its source. */
export async function quranMeta(): Promise<QuranData['meta']> {
  return (await loadQuran()).meta;
}
