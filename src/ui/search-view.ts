import { loadQuran, surah } from '../data/quran';
import { searchQuran, type PageHit } from '../data/search';
import { pageHref } from '../router';
import { currentLanguage, fill, t } from '../strings';
import type { QuranData } from '../types';
import { el } from './dom';
import { juzIndex } from './juz-index';
import { pagePlaylist } from './page-playlist';
import { surahIndex } from './surah-index';

const TAB_KEY = 'ngajiPlay.searchTab';
type TabId = 'surah' | 'juz' | 'latihan';

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

  const hint = el(
    'span',
    {
      class: 'search-hint',
      attrs: {
        role: 'img',
        'data-testid': 'search-hint',
        'aria-label': t('searchHint'),
        title: t('searchHint'),
      },
    },
    el('span', { class: 'search-hint-mark', attrs: { 'aria-hidden': 'true' }, text: 'i' }),
  );

  const searchButton = el('button', {
    class: 'search-button',
    attrs: { type: 'submit', 'data-testid': 'search-button' },
    text: t('searchButton'),
  });

  const form = el(
    'form',
    { class: 'search', attrs: { role: 'search' } },
    input,
    searchButton,
    hint,
  );

  // Page-jump chip: shown when query is a valid page number 1–604
  const pageChip = el('div', { class: 'page-jump-chip', attrs: { hidden: true } });

  const state = el('p', {
    class: 'state',
    attrs: { 'data-testid': 'search-state', 'aria-live': 'polite' },
  });
  const results = el('ul', { class: 'results', attrs: { 'data-testid': 'results' } });

  // --- Tabs ---
  const activeTab = (): TabId => {
    const stored = sessionStorage.getItem(TAB_KEY);
    if (stored === 'juz' || stored === 'latihan') return stored;
    return 'surah';
  };

  const tabSurah = el('button', {
    class: 'search-tab',
    attrs: { type: 'button', 'data-testid': 'tab-surah', 'aria-selected': 'true' },
    text: t('searchTabSurah'),
  });
  const tabJuz = el('button', {
    class: 'search-tab',
    attrs: { type: 'button', 'data-testid': 'tab-juz', 'aria-selected': 'false' },
    text: t('searchTabJuz'),
  });
  const tabLatihan = el('button', {
    class: 'search-tab',
    attrs: { type: 'button', 'data-testid': 'tab-latihan', 'aria-selected': 'false' },
    text: t('searchTabLatihan'),
  });

  const tabBar = el(
    'div',
    { class: 'search-tabs', attrs: { role: 'tablist', 'data-testid': 'search-tabs' } },
    tabSurah,
    tabJuz,
    tabLatihan,
  );

  const tabContent = el('div', { class: 'search-tab-content' });

  // Assembled DOM order: form → pageChip → state → results → tabBar → tabContent
  target.append(form, pageChip, state, results, tabBar, tabContent);

  let data: QuranData | null = null;

  function renderTabContent(): void {
    if (!data) return;
    const tab = activeTab();
    tabSurah.setAttribute('aria-selected', tab === 'surah' ? 'true' : 'false');
    tabJuz.setAttribute('aria-selected', tab === 'juz' ? 'true' : 'false');
    tabLatihan.setAttribute('aria-selected', tab === 'latihan' ? 'true' : 'false');

    if (tab === 'surah') {
      tabContent.replaceChildren(surahIndex(data, currentLanguage()));
    } else if (tab === 'juz') {
      tabContent.replaceChildren(juzIndex(data, currentLanguage()));
    } else {
      tabContent.replaceChildren(pagePlaylist());
    }
  }

  function switchTab(id: TabId): void {
    sessionStorage.setItem(TAB_KEY, id);
    renderTabContent();
  }

  tabSurah.addEventListener('click', () => switchTab('surah'));
  tabJuz.addEventListener('click', () => switchTab('juz'));
  tabLatihan.addEventListener('click', () => switchTab('latihan'));

  function paint(): void {
    if (!data) return;
    const query = input.value.trim();
    results.replaceChildren();

    // Page-jump chip
    const asNum = Number(query);
    if (query !== '' && Number.isInteger(asNum) && asNum >= 1 && asNum <= 604) {
      const chipLink = el('a', {
        class: 'page-jump-link',
        attrs: { href: pageHref(asNum) },
        text: fill(t('pageJumpChip'), { page: asNum }),
      });
      pageChip.replaceChildren(chipLink);
      pageChip.removeAttribute('hidden');
    } else {
      pageChip.replaceChildren();
      pageChip.setAttribute('hidden', '');
    }

    if (query === '') {
      state.textContent = '';
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
      renderTabContent();
      // Restore previously selected tab
      renderTabContent();
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
