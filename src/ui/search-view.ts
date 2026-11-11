import { loadQuran, surah } from '../data/quran';
import { searchQuran, type PageHit } from '../data/search';
import { pageHref } from '../router';
import { currentLanguage, fill, t } from '../strings';
import type { QuranData } from '../types';
import { el } from './dom';
import { libraryLink } from './library-view';
import { surahIndex } from './surah-index';

/**
 * Returning from a page re-renders this screen from scratch, so the last query
 * is kept here rather than lost (the hash only carries the page number).
 */
let lastQuery = '';

export function renderSearch(target: HTMLElement): void {
  const input = el('input', {
    class: 'search-input',
    attrs: {
      type: 'search',
      inputmode: 'text',
      autocomplete: 'off',
      enterkeyhint: 'search',
      'aria-label': t('searchLabel'),
      placeholder: t('searchPlaceholder'),
      'data-testid': 'search-input',
    },
  });
  input.value = lastQuery;

  const state = el('p', {
    class: 'state',
    attrs: { 'data-testid': 'search-state', 'aria-live': 'polite' },
  });
  const results = el('ul', { class: 'results', attrs: { 'data-testid': 'results' } });

  const form = el(
    'form',
    { class: 'search', attrs: { role: 'search' } },
    input,
    el('button', { class: 'search-button', attrs: { type: 'submit' }, text: t('searchButton') }),
  );

  const indexSlot = el('div');

  // The surah index comes first, and the search box sits below it: browsing
  // needs no typing, and a query's results still land right under the box.
  target.append(
    indexSlot,
    form,
    state,
    results,
    el('div', { class: 'view-row library-row' }, libraryLink()),
  );

  let data: QuranData | null = null;

  function paint(): void {
    if (!data) return;
    const query = input.value.trim();
    results.replaceChildren();

    if (query === '') {
      state.textContent = t('searchHint');
      return;
    }

    const { pages, pageError } = searchQuran(data, query);
    // Out-of-range wins over "no result": the input was wrong, not empty.
    if (pageError) state.textContent = t('searchErrorPage');
    else if (pages.length === 0) state.textContent = fill(t('searchEmpty'), { query });
    else state.textContent = '';

    for (const hit of pages) results.append(resultRow(data, hit));
  }

  input.addEventListener('input', () => {
    lastQuery = input.value;
    paint();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!data) return;
    // Enter opens the page when the query is unambiguous.
    const hits = searchQuran(data, input.value).pages;
    const only = hits.length === 1 ? hits[0] : undefined;
    if (only) window.location.hash = pageHref(only.page);
  });

  state.textContent = t('loading');

  void loadQuran()
    .then((loaded) => {
      data = loaded;
      paint();
      // Below the results on purpose: typing still lands above the index.
      indexSlot.replaceChildren(surahIndex(loaded, currentLanguage()));
    })
    .catch(() => {
      state.textContent = t('loadError');
    });
}

function resultRow(data: QuranData, hit: PageHit): HTMLLIElement {
  // FR-1.3: the page number plus every surah present on it.
  const names = hit.slices.map((slice) => surah(data, slice.surah).nameId).join(' · ');

  return el(
    'li',
    { class: 'result-item' },
    el(
      'a',
      { class: 'result', attrs: { href: pageHref(hit.page), 'data-testid': 'result' } },
      el('span', { class: 'result-page', text: fill(t('resultPage'), { page: hit.page }) }),
      el('span', { class: 'result-surahs', text: names }),
    ),
  );
}
