import { loadQuran, pageCount, slicesOnPage, surah } from '../data/quran';
import { pageHref } from '../router';
import { clipsOnPage } from '../store/db';
import { fill, t } from '../strings';
import type { Clip, QuranData } from '../types';
import { el } from './dom';
import { libraryLink } from './library-view';
import { sliceNodes } from './mushaf';
import { openRecorder } from './record-panel';

/**
 * Renders one Madani page (FR-1.4) plus its recordable slices (FR-1.5).
 * `isCurrent` lets an async load bail out when the user has already navigated
 * away, so a slow response cannot overwrite a newer page.
 */
export async function renderPage(
  target: HTMLElement,
  pageNumber: number,
  isCurrent: () => boolean,
): Promise<void> {
  target.append(navRow(), el('p', { class: 'state', text: t('loading') }));

  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
    target.replaceChildren(navRow(), missingPage(pageNumber));
    return;
  }

  try {
    const data = await loadQuran();
    if (!isCurrent()) return;
    target.replaceChildren(
      navRow(),
      pager(pageNumber),
      mushaf(data, pageNumber),
      sliceList(target, data, pageNumber, isCurrent),
    );
  } catch {
    if (!isCurrent()) return;
    target.replaceChildren(navRow(), el('p', { class: 'state', text: t('loadError') }));
  }
}

/** Search on the left, the library on the right, both 44px tall. */
function navRow(): HTMLElement {
  return el('div', { class: 'view-row' }, backLink(), libraryLink());
}

function backLink(): HTMLElement {
  return el(
    'a',
    {
      class: 'back',
      attrs: { href: '#/', 'data-testid': 'back', 'aria-label': t('backToSearch') },
    },
    el('span', { attrs: { 'aria-hidden': 'true' }, text: '‹' }),
    el('span', { text: t('backToSearch') }),
  );
}

function missingPage(pageNumber: number): HTMLElement {
  return el(
    'div',
    { class: 'empty', attrs: { 'data-testid': 'page-error' } },
    el('p', { text: fill(t('pageMissing'), { page: Number.isFinite(pageNumber) ? pageNumber : '—' }) }),
    el('a', { class: 'result', attrs: { href: '#/' }, text: t('backToSearch') }),
  );
}

/** Previous/next links; the ends of the mushaf render as disabled text (FR-1.6). */
function pager(pageNumber: number): HTMLElement {
  return el(
    'nav',
    { class: 'pager', attrs: { 'aria-label': t('pageNav') } },
    step(pageNumber - 1, 'prev'),
    el('span', {
      class: 'pager-label',
      attrs: { 'data-testid': 'page-number' },
      text: fill(t('pageLabel'), { page: pageNumber, total: pageCount }),
    }),
    step(pageNumber + 1, 'next'),
  );
}

function step(pageNumber: number, direction: 'prev' | 'next'): HTMLElement {
  const label = t(direction === 'prev' ? 'previousPage' : 'nextPage');
  const glyph = direction === 'prev' ? '‹' : '›';

  if (pageNumber < 1 || pageNumber > pageCount) {
    return el('span', {
      class: 'step',
      attrs: { 'aria-disabled': 'true', 'data-testid': `page-${direction}` },
      text: glyph,
    });
  }

  return el('a', {
    class: 'step',
    attrs: { href: pageHref(pageNumber), 'aria-label': label, 'data-testid': `page-${direction}` },
    text: glyph,
  });
}

function mushaf(data: QuranData, pageNumber: number): HTMLElement {
  const article = el('article', {
    class: 'mushaf',
    attrs: { dir: 'rtl', lang: 'ar', 'data-testid': 'mushaf' },
  });

  for (const slice of slicesOnPage(data, pageNumber)) {
    article.append(...sliceNodes(data, slice));
  }

  return article;
}

/**
 * The recordable slices. Each row is one button, so the whole row is the touch
 * target (NFR-6) and tapping it opens the recorder for that slice (FR-2.2).
 */
function sliceList(
  host: HTMLElement,
  data: QuranData,
  pageNumber: number,
  isCurrent: () => boolean,
): HTMLElement {
  const list = el('ul', { class: 'slice-list', attrs: { 'data-testid': 'slice-list' } });
  const section = el(
    'section',
    { class: 'slices' },
    el('h2', { text: t('slicesHeading') }),
    list,
  );
  const rows = new Map<number, HTMLElement>();

  const setRecorded = (surahNumber: number, recorded: boolean): void => {
    const row = rows.get(surahNumber);
    if (!row) return;
    row.dataset.recorded = String(recorded);
    const badge = row.querySelector<HTMLElement>('.badge');
    if (badge) {
      badge.dataset.state = recorded ? 'recorded' : 'empty';
      badge.textContent = recorded ? t('recorded') : t('notRecorded');
    }
  };

  for (const slice of slicesOnPage(data, pageNumber)) {
    const name = surah(data, slice.surah).nameId;
    const button = el(
      'button',
      {
        class: 'slice-record',
        attrs: {
          type: 'button',
          'data-testid': 'record',
          'aria-label': fill(t('recordSliceLabel'), {
            surah: name,
            from: slice.ayahStart,
            to: slice.ayahEnd,
          }),
        },
      },
      el('span', { class: 'slice-name', text: name }),
      el('span', {
        class: 'slice-range',
        text: fill(t('sliceAyat'), { from: slice.ayahStart, to: slice.ayahEnd }),
      }),
      el('span', { class: 'badge', attrs: { 'data-state': 'empty' }, text: t('notRecorded') }),
    );

    const row = el(
      'li',
      {
        class: 'slice',
        attrs: { 'data-testid': 'slice', 'data-surah': slice.surah, 'data-recorded': 'false' },
      },
      button,
    );

    button.addEventListener('click', () => {
      openRecorder({
        host,
        mount: section,
        data,
        page: pageNumber,
        slice,
        onSaved: (clip: Clip) => setRecorded(clip.surah, true),
      });
    });

    rows.set(slice.surah, row);
    list.append(row);
  }

  // The list paints immediately; recorded state arrives from IndexedDB after.
  void clipsOnPage(pageNumber)
    .then((clips) => {
      if (!isCurrent()) return;
      const recorded = new Set(clips.map((clip) => clip.surah));
      for (const surahNumber of rows.keys()) {
        if (recorded.has(surahNumber)) setRecorded(surahNumber, true);
      }
    })
    .catch(() => {
      // Leaving every slice as "not recorded" is wrong only readably, not
      // destructively; Phase 7 adds the designed storage-error state.
    });

  return section;
}
