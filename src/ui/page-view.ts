import { splitBasmala, shouldSplitBasmala } from '../data/basmala';
import { ayahText, loadQuran, pageCount, slicesOnPage, surah } from '../data/quran';
import { pageHref } from '../router';
import { clipsOnPage } from '../store/db';
import { fill, t } from '../strings';
import type { PageSlice, QuranData } from '../types';
import { el } from './dom';
import { ayahMedallion } from './format';

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
  target.append(backLink(), el('p', { class: 'state', text: t('loading') }));

  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
    target.replaceChildren(backLink(), missingPage(pageNumber));
    return;
  }

  try {
    const data = await loadQuran();
    if (!isCurrent()) return;
    target.replaceChildren(
      backLink(),
      pager(pageNumber),
      mushaf(data, pageNumber),
      sliceList(data, pageNumber, isCurrent),
    );
  } catch {
    if (!isCurrent()) return;
    target.replaceChildren(backLink(), el('p', { class: 'state', text: t('loadError') }));
  }
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
    article.append(...sliceText(data, slice));
  }

  return article;
}

/**
 * One slice as it sits on the page: a surah header band when the surah starts
 * here, the basmala split off ayah 1, then every ayah inline so the paragraph
 * justifies the way a printed page does.
 */
function sliceText(data: QuranData, slice: PageSlice): HTMLElement[] {
  const nodes: HTMLElement[] = [];

  if (slice.ayahStart === 1) nodes.push(surahHeader(data, slice.surah));

  const ayahs: HTMLElement[] = [];
  for (let ayah = slice.ayahStart; ayah <= slice.ayahEnd; ayah += 1) {
    let text = ayahText(data, slice.surah, ayah);

    // The basmala is stored inside 1:1, so it is separated at render time only;
    // the data stays verbatim (REQ §8.1).
    if (ayah === 1 && shouldSplitBasmala(slice.surah, 1)) {
      const split = splitBasmala(text);
      if (split.basmala) {
        nodes.push(el('p', { class: 'basmala', attrs: { 'data-testid': 'basmala' }, text: split.basmala }));
        text = split.body;
      }
    }

    ayahs.push(ayahSpan(slice.surah, ayah, text));
  }

  const paragraph = el('p', { class: 'ayahs' });
  ayahs.forEach((node) => {
    // A literal space, not CSS margin: justification has to see the gap.
    if (paragraph.childNodes.length > 0) paragraph.append(' ');
    paragraph.append(node);
  });
  nodes.push(paragraph);

  return nodes;
}

function ayahSpan(surahNumber: number, ayah: number, text: string): HTMLElement {
  return el(
    'span',
    {
      class: 'ayah',
      attrs: {
        id: `a-${surahNumber}-${ayah}`,
        'data-surah': surahNumber,
        'data-ayah': ayah,
      },
    },
    text,
    el('span', {
      class: 'ayah-mark',
      attrs: { 'aria-hidden': 'true' },
      text: ayahMedallion(ayah),
    }),
  );
}

function surahHeader(data: QuranData, number: number): HTMLElement {
  const entry = surah(data, number);

  return el(
    'header',
    { class: 'surah-header', attrs: { 'data-testid': 'surah-header', 'data-surah': number } },
    el('p', { class: 'surah-name-ar', text: entry.nameAr }),
    el('p', {
      class: 'surah-name-latin',
      attrs: { dir: 'ltr' },
      text: `${fill(t('surahStartLabel'), { number })} · ${entry.nameId}`,
    }),
  );
}

function sliceList(data: QuranData, pageNumber: number, isCurrent: () => boolean): HTMLElement {
  const list = el('ul', { class: 'slice-list', attrs: { 'data-testid': 'slice-list' } });

  for (const slice of slicesOnPage(data, pageNumber)) {
    list.append(
      el(
        'li',
        {
          class: 'slice',
          attrs: { 'data-testid': 'slice', 'data-surah': slice.surah, 'data-recorded': 'false' },
        },
        el('span', { class: 'slice-name', text: surah(data, slice.surah).nameId }),
        el('span', { class: 'slice-range', text: fill(t('sliceAyat'), { from: slice.ayahStart, to: slice.ayahEnd }) }),
        el('span', {
          class: 'badge',
          attrs: { 'data-state': 'empty' },
          text: t('notRecorded'),
        }),
      ),
    );
  }

  // The list paints immediately; recorded state arrives from IndexedDB after.
  void clipsOnPage(pageNumber)
    .then((clips) => {
      if (!isCurrent()) return;
      const recorded = new Set(clips.map((clip) => clip.surah));

      for (const row of list.querySelectorAll<HTMLElement>('[data-testid="slice"]')) {
        const hasClip = recorded.has(Number(row.dataset.surah));
        row.dataset.recorded = String(hasClip);
        const badge = row.querySelector<HTMLElement>('.badge');
        if (badge) {
          badge.dataset.state = hasClip ? 'recorded' : 'empty';
          badge.textContent = hasClip ? t('recorded') : t('notRecorded');
        }
      }
    })
    .catch(() => {
      // Leaving every slice as "not recorded" is wrong only readably, not
      // destructively; Phase 7 adds the designed storage-error state.
    });

  return el(
    'section',
    { class: 'slices' },
    el('h2', { text: t('slicesHeading') }),
    list,
  );
}
