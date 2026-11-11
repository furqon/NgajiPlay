import { loadQuran, pageCount, slicesOnPage, surah } from '../data/quran';
import { sharedPlayer, type PlayerState } from '../playback/player';
import { pageHref } from '../router';
import { clipId, clipsOnPage } from '../store/db';
import { fill, t } from '../strings';
import type { Clip, QuranData } from '../types';
import { el } from './dom';
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
  target.append(backLink(), el('p', { class: 'state', text: t('loading') }));

  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
    target.replaceChildren(backLink(), missingPage(pageNumber));
    return;
  }

  try {
    const data = await loadQuran();
    if (!isCurrent()) return;
    const article = mushaf(data, pageNumber);
    target.replaceChildren(
      backLink(),
      pager(pageNumber),
      article,
      sliceList(target, data, pageNumber, isCurrent),
    );

    // FR-6.3: mark the playing clip's ayah range, and keep following the player
    // so the mark moves with the track and disappears with the queue.
    const player = sharedPlayer();
    paintPlayingAyahs(article, pageNumber, player.state);
    const unsubscribe = player.subscribe((state) => {
      if (!isCurrent()) {
        unsubscribe();
        return;
      }
      paintPlayingAyahs(article, pageNumber, state);
    });
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

/**
 * Paint the ayah range of the clip playing on this page. Ayah spans are shared
 * with the recorder panel, so only this page's article is marked.
 */
function paintPlayingAyahs(
  article: HTMLElement,
  pageNumber: number,
  state: PlayerState,
): void {
  const clip = state.clip?.page === pageNumber ? state.clip : null;

  for (const node of article.querySelectorAll<HTMLElement>('[data-ayah]')) {
    const playing =
      clip !== null &&
      Number(node.dataset.surah) === clip.surah &&
      Number(node.dataset.ayah) >= clip.ayahStart &&
      Number(node.dataset.ayah) <= clip.ayahEnd;

    if (playing) node.dataset.ayahPlaying = 'true';
    else delete node.dataset.ayahPlaying;
  }
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
  const player = sharedPlayer();
  /** What this page can play, in playlist order — the queue for its play buttons. */
  const playable = new Map<number, Clip>();
  const queue = (): Clip[] =>
    [...playable.values()].sort(
      (a, b) => a.surah - b.surah || a.ayahStart - b.ayahStart,
    );

  const setRecorded = (surahNumber: number, recorded: boolean, clip?: Clip): void => {
    const row = rows.get(surahNumber);
    if (!row) return;
    row.dataset.recorded = String(recorded);
    const badge = row.querySelector<HTMLElement>('.badge');
    if (badge) {
      badge.dataset.state = recorded ? 'recorded' : 'empty';
      badge.textContent = recorded ? t('recorded') : t('notRecorded');
    }
    const play = row.querySelector<HTMLButtonElement>('[data-testid="slice-play"]');
    if (play) play.hidden = !recorded;
    if (clip) playable.set(clip.surah, clip);
  };

  const paintPlaying = (state: PlayerState): void => {
    for (const play of section.querySelectorAll<HTMLButtonElement>(
      '[data-testid="slice-play"]',
    )) {
      const active = state.clip?.id === clipId(pageNumber, Number(play.dataset.surah));
      play.textContent = active && state.playing ? '\u275a\u275a' : '\u25b6';
      play.setAttribute(
        'aria-label',
        (active && state.playing ? play.dataset.pauseLabel : play.dataset.playLabel) ?? '',
      );
      play.closest('[data-testid="slice"]')?.setAttribute('data-playing', String(active));
    }
  };

  const unsubscribe = player.subscribe((state) => {
    if (!isCurrent()) {
      unsubscribe();
      return;
    }
    paintPlaying(state);
  });

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

    const playLabel = fill(t('playSliceLabel'), {
      surah: name,
      from: slice.ayahStart,
      to: slice.ayahEnd,
    });
    // A second, small target: replay this recording without opening the library.
    const play = el('button', {
      class: 'slice-play',
      attrs: {
        type: 'button',
        'data-testid': 'slice-play',
        'data-surah': slice.surah,
        'data-play-label': playLabel,
        'data-pause-label': t('playerPause'),
        'aria-label': playLabel,
        hidden: true,
      },
      text: '\u25b6',
    });

    const row = el(
      'li',
      {
        class: 'slice',
        attrs: {
          'data-testid': 'slice',
          'data-surah': slice.surah,
          'data-recorded': 'false',
          'data-playing': 'false',
        },
      },
      button,
      play,
    );

    button.addEventListener('click', () => {
      openRecorder({
        host,
        mount: section,
        data,
        page: pageNumber,
        slice,
        onSaved: (clip: Clip) => setRecorded(clip.surah, true, clip),
      });
    });

    play.addEventListener('click', () => {
      const id = clipId(pageNumber, slice.surah);
      if (player.state.clip?.id === id) player.toggle();
      else void player.play(queue(), id);
    });

    rows.set(slice.surah, row);
    list.append(row);
  }

  // The list paints immediately; recorded state arrives from IndexedDB after.
  void clipsOnPage(pageNumber)
    .then((found) => {
      if (!isCurrent()) return;
      for (const clip of found) setRecorded(clip.surah, true, clip);
      paintPlaying(player.state);
    })
    .catch(() => {
      // Leaving every slice as "not recorded" is wrong only readably, not
      // destructively; Phase 7 adds the designed storage-error state.
    });

  return section;
}
