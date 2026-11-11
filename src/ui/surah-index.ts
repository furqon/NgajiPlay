import { startPageOfSurah } from '../data/quran';
import { pageHref } from '../router';
import { t, type Language } from '../strings';
import type { QuranData } from '../types';
import { el } from './dom';

/**
 * All 114 surahs, each linking to the page it opens on, so the mushaf can be
 * browsed without typing anything. Capped and scrollable: the search results
 * must stay the first thing under the box.
 */
export function surahIndex(data: QuranData, language: Language): HTMLElement {
  const list = el('ol', { class: 'surah-grid' });

  for (const entry of data.surahs) {
    list.append(
      el(
        'li',
        {},
        el(
          'a',
          {
            class: 'surah-link',
            attrs: {
              href: pageHref(startPageOfSurah(data, entry.n)),
              'data-testid': 'surah-link',
              'data-surah': entry.n,
            },
          },
          el('span', { class: 'surah-number', text: String(entry.n) }),
          el('span', {
            class: 'surah-name',
            text: language === 'id' ? entry.nameId : entry.nameEn,
          }),
        ),
      ),
    );
  }

  return el(
    'section',
    { class: 'surah-index', attrs: { 'data-testid': 'surah-index' } },
    el('h2', { class: 'surah-index-title', text: t('surahIndexTitle') }),
    list,
  );
}
