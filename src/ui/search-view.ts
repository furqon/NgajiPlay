import { loadQuran, surah } from '../data/quran';
import { searchQuran, type PageHit } from '../data/search';
import { pageHref } from '../router';
import { clipCount, getSetting, setSetting } from '../store/db';
import { fill, t } from '../strings';
import type { QuranData } from '../types';
import { el } from './dom';
import { libraryLink } from './library-view';

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

  const hintSlot = el('div');

  target.append(
    el('p', { class: 'tagline', attrs: { 'data-testid': 'tagline' }, text: t('tagline') }),
    hintSlot,
    el('div', { class: 'view-row library-row' }, libraryLink()),
    form,
    state,
    results,
  );

  void loadHint(hintSlot);

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
    })
    .catch(() => {
      state.textContent = t('loadError');
    });
}

const HINT_KEY = 'hintDismissed';

/**
 * First-run guidance, for someone who has never recorded anything: what the
 * app wants from them, in the order it happens. It disappears once there is a
 * recording to look at, and never comes back after being dismissed.
 */
async function loadHint(slot: HTMLElement): Promise<void> {
  try {
    if (await getSetting(HINT_KEY, false)) return;
    if ((await clipCount()) > 0) return;
    slot.replaceChildren(firstRunHint());
  } catch {
    // A store we cannot read is not a reason to explain a flow we cannot honour.
  }
}

function firstRunHint(): HTMLElement {
  const dismiss = el('button', {
    class: 'hint-dismiss',
    attrs: { type: 'button', 'data-testid': 'hint-dismiss' },
    text: t('hintDismiss'),
  });
  const card = el(
    'section',
    { class: 'hint', attrs: { 'data-testid': 'first-run-hint' } },
    el('h2', { class: 'hint-title', text: t('hintTitle') }),
    el(
      'ol',
      { class: 'hint-steps' },
      el('li', { text: t('hintStep1') }),
      el('li', { text: t('hintStep2') }),
      el('li', { text: t('hintStep3') }),
    ),
    dismiss,
  );

  dismiss.addEventListener('click', () => {
    card.remove();
    void setSetting(HINT_KEY, true).catch(() => undefined);
  });

  return card;
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
