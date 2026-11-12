import { juzEndPage, juzStartPage } from '../data/quran';
import { pageHref } from '../router';
import { t, type Language } from '../strings';
import type { QuranData } from '../types';
import { el } from './dom';

/**
 * Find the opening surah for a juz by looking at the first page's first slice.
 */
function openingSurahName(data: QuranData, juz: number, lang: Language): string {
  const pageEntry = data.pages[juzStartPage(juz) - 1];
  if (!pageEntry) return '';
  const firstSurahNum = pageEntry.slices[0]?.[0];
  if (firstSurahNum == null) return '';
  const surahEntry = data.surahs[firstSurahNum - 1];
  if (!surahEntry) return '';
  return lang === 'id' ? surahEntry.nameId : surahEntry.nameEn;
}

/**
 * Juz 1–30, browseable, each card linking to the first page of that juz. The
 * page ranges come from the same mapping the reader uses for its Juz header.
 */
export function juzIndex(data: QuranData, language: Language): HTMLElement {
  const list = el('ol', { class: 'surah-grid', attrs: { 'data-testid': 'juz-index' } });

  for (let juz = 1; juz <= 30; juz += 1) {
    const startPg = juzStartPage(juz);
    const endPg = juzEndPage(juz);
    const surahName = openingSurahName(data, juz, language);

    list.append(
      el(
        'li',
        {},
        el(
          'a',
          {
            class: 'surah-link',
            attrs: {
              href: pageHref(startPg),
              'data-testid': 'juz-link',
              'data-juz': juz,
            },
          },
          el('span', { class: 'surah-number', text: String(juz) }),
          el(
            'span',
            { class: 'surah-name' },
            document.createTextNode(surahName ? `${surahName} ` : ''),
            el('span', { class: 'juz-range', text: `Hal. ${startPg}–${endPg}` }),
          ),
        ),
      ),
    );
  }

  return el(
    'section',
    { class: 'surah-index' },
    el('h2', { class: 'surah-index-title', text: t('juzIndexTitle') }),
    list,
  );
}
