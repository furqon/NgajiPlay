import { loadQuran, surah } from '../data/quran';
import { sharedPlayer, type PlayerState, type RepeatMode } from '../playback/player';
import { pageHref } from '../router';
import { fill, t } from '../strings';
import type { QuranData } from '../types';
import { el } from './dom';
import { formatDuration } from './format';

/**
 * The now-playing bar (FR-5.3). It lives outside `#view`, so re-rendering a
 * page never tears down the controls or the audio they drive.
 */
export function mountPlayerBar(): void {
  if (document.querySelector('[data-testid="player"]')) return;

  const player = sharedPlayer();
  let data: QuranData | null = null;

  const title = el('span', {
    class: 'player-title',
    attrs: { 'data-testid': 'player-title', dir: 'auto' },
  });
  const meta = el('a', {
    class: 'player-meta',
    attrs: { 'data-testid': 'player-meta' },
  });
  const status = el('p', {
    class: 'player-status',
    attrs: { 'data-testid': 'player-status', 'aria-live': 'polite' },
  });

  const repeat = button(t('playerRepeatMode'), 'player-repeat', 'player-button');
  const previous = button(t('playerPrevious'), 'player-prev', 'player-button', '‹');
  const toggle = button(t('playerPlay'), 'player-toggle', 'player-button player-toggle');
  const next = button(t('playerNext'), 'player-next', 'player-button', '›');
  const elapsed = el('span', { attrs: { 'data-testid': 'player-elapsed' } });
  const remaining = el('span', {
    attrs: { 'data-testid': 'player-remaining', 'aria-live': 'off' },
  });

  const bar = el(
    'section',
    {
      class: 'player',
      attrs: { 'data-testid': 'player', 'aria-label': t('playerLabel'), hidden: true },
    },
    el(
      'div',
      { class: 'player-inner' },
      el('div', { class: 'player-head' }, title, meta),
      status,
      el(
        'div',
        { class: 'player-controls' },
        repeat,
        previous,
        toggle,
        next,
        el('span', { class: 'player-time' }, elapsed, el('span', { text: ' · ' }), remaining),
      ),
    ),
  );

  document.body.append(bar);

  const wire = (element: HTMLButtonElement, listener: () => void): void => {
    element.addEventListener('click', listener);
  };
  wire(repeat, () => player.cycleRepeat());
  wire(previous, () => player.previous());
  wire(toggle, () => player.toggle());
  wire(next, () => player.next());

  const render = (state: PlayerState): void => {
    const clip = state.clip;
    bar.hidden = !clip;
    document.body.classList.toggle('has-player', Boolean(clip));
    if (!clip) return;

    const name = data ? surah(data, clip.surah).nameId : '';
    title.textContent = clip.displayName;
    meta.textContent = name
      ? fill(t('clipMeta'), {
          page: clip.page,
          surah: name,
          from: clip.ayahStart,
          to: clip.ayahEnd,
        })
      : fill(t('playerPage'), { page: clip.page });
    meta.setAttribute('href', pageHref(clip.page));

    elapsed.textContent = formatDuration(state.positionMs);
    const left = Math.max(0, state.durationMs - state.positionMs);
    const leftText = formatDuration(left);
    remaining.textContent = `−${leftText}`;
    remaining.setAttribute('aria-label', fill(t('playerRemainingLabel'), { time: leftText }));

    toggle.textContent = state.playing ? t('playerPause') : t('playerPlay');
    repeat.textContent = repeatLabel(state.repeat);
    status.textContent = state.status === 'error' ? t('playerLoadFailed') : '';

    updateMediaSession(state, name);
  };

  player.subscribe(render);

  void loadQuran()
    .then((loaded) => {
      data = loaded;
      render(player.state);
    })
    .catch(() => {
      // The bar still works with page numbers only.
    });
}

function button(
  label: string,
  testId: string,
  className: string,
  glyph?: string,
): HTMLButtonElement {
  const element = el(
    'button',
    {
      class: className,
      attrs: { type: 'button', 'data-testid': testId, 'aria-label': label },
    },
    ...(glyph ? [el('span', { attrs: { 'aria-hidden': 'true' }, text: glyph })] : []),
  );
  if (!glyph) element.textContent = label;
  return element;
}

let mediaWired = false;

/** Best-effort lock-screen metadata (FR-5.6): never breaks playback. */
function updateMediaSession(state: PlayerState, surahName: string): void {
  const session = 'mediaSession' in navigator ? navigator.mediaSession : undefined;
  const clip = state.clip;
  if (!session || !clip) return;

  if (!mediaWired) {
    mediaWired = true;
    const player = sharedPlayer();
    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ['play', () => player.playCurrent()],
      ['pause', () => player.pause()],
      ['previoustrack', () => player.previous()],
      ['nexttrack', () => player.next()],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Unsupported actions are simply not offered by this browser.
      }
    }
  }

  try {
    if (typeof MediaMetadata !== 'undefined') {
      session.metadata = new MediaMetadata({
        title: clip.displayName,
        artist: surahName || t('libraryOpen'),
        album: fill(t('playerPage'), { page: clip.page }),
      });
    }
    session.playbackState = state.playing ? 'playing' : 'paused';

    if (state.durationMs > 0) {
      session.setPositionState({
        duration: state.durationMs / 1000,
        position: Math.min(state.positionMs, state.durationMs) / 1000,
        playbackRate: 1,
      });
    }
  } catch {
    // Older engines reject parts of this; metadata is not required.
  }
}

function repeatLabel(mode: RepeatMode): string {
  if (mode === 'one') return t('playerRepeatOne');
  if (mode === 'all') return t('playerRepeatAll');
  if (typeof mode === 'number') return fill(t('playerRepeatCount'), { count: mode });
  return t('playerRepeatOff');
}
