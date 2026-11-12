import { loadQuran, surah } from '../data/quran';
import { sharedPlayer, type PlayerState, type RepeatMode } from '../playback/player';
import { pageHref } from '../router';
import { fill, onLanguageChange, t } from '../strings';
import type { QuranData } from '../types';
import { el } from './dom';
import { formatDuration } from './format';

/**
 * The now-playing bar (FR-5.3). It lives outside `#view`, so re-rendering a
 * page never tears down the controls or the audio they drive.
 */
const DRAWER_ID = 'player-controls-drawer';

/** The drill choices offered by the repeat sheet (10E.2). */
const REPEAT_OPTIONS: ReadonlyArray<{ mode: RepeatMode; testId: string; label: () => string }> = [
  { mode: 'off', testId: 'repeat-option-off', label: () => t('repeatOptionOnce') },
  { mode: 'one', testId: 'repeat-option-one', label: () => t('repeatOptionOne') },
  { mode: 'all', testId: 'repeat-option-all', label: () => t('repeatOptionAll') },
  { mode: 3, testId: 'repeat-option-3', label: () => fill(t('repeatOptionDrill'), { count: 3 }) },
  { mode: 5, testId: 'repeat-option-5', label: () => fill(t('repeatOptionDrill'), { count: 5 }) },
  { mode: 10, testId: 'repeat-option-10', label: () => fill(t('repeatOptionDrill'), { count: 10 }) },
];

export function mountPlayerBar(): HTMLElement {
  const existing = document.querySelector<HTMLElement>('[data-testid="player-follow-slot"]');
  if (existing) return existing;

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
  const playlist = el('span', {
    class: 'player-playlist',
    attrs: { 'data-testid': 'player-playlist', 'aria-live': 'off' },
  });
  const status = el('p', {
    class: 'player-status',
    attrs: { 'data-testid': 'player-status', 'aria-live': 'polite' },
  });

  const repeat = button(t('playerRepeatMode'), 'player-repeat', 'player-button');
  const previous = button(t('playerPrevious'), 'player-prev', 'player-button', '‹');
  const toggle = button(t('playerPlay'), 'player-toggle', 'player-button player-toggle');
  const next = button(t('playerNext'), 'player-next', 'player-button', '›');
  const elapsed = el('span', { class: 'player-time', attrs: { 'data-testid': 'player-elapsed' } });
  const remaining = el('span', {
    class: 'player-time',
    attrs: { 'data-testid': 'player-remaining', 'aria-live': 'off' },
  });

  // A real seek control (10E.1): the slider is normalised to 0–1000 so a
  // duration that changes under us cannot leave it out of range.
  const scrubber = el('input', {
    class: 'player-scrubber',
    attrs: {
      type: 'range',
      min: 0,
      max: 1000,
      step: 1,
      value: 0,
      'aria-label': t('playerSeek'),
      'data-testid': 'player-scrubber',
    },
  });
  let scrubbing = false;

  const drawerToggle = el('button', {
    class: 'player-drawer-toggle',
    attrs: {
      type: 'button',
      'data-testid': 'player-drawer-toggle',
      'aria-controls': DRAWER_ID,
      'aria-expanded': 'true',
      'aria-label': t('playerHideControls'),
    },
    text: '⌄',
  });

  const actions = el('div', { class: 'player-actions' }, drawerToggle);
  const head = el(
    'div',
    { class: 'player-head' },
    el('div', { class: 'player-info' }, title, meta, playlist),
    actions,
  );
  // The follow control (FR-6.4) gets its own row. Beside the title it ate the
  // width on a phone, truncating the name and shoving the seek/transport out
  // of line; a full-width strip keeps every row aligned at 320px and up.
  const followSlot = el('div', {
    class: 'player-follow-slot',
    attrs: { 'data-testid': 'player-follow-slot' },
  });

  const drawer = el(
    'div',
    {
      class: 'player-drawer',
      attrs: { id: DRAWER_ID, 'data-testid': 'player-drawer' },
    },
    // Times hug the seek bar (one compact row) so the transport never wraps
    // into a half-empty line on a narrow phone.
    el('div', { class: 'player-seek' }, elapsed, scrubber, remaining),
    el('div', { class: 'player-controls' }, repeat, previous, toggle, next),
  );

  const bar = el(
    'section',
    {
      class: 'player',
      attrs: { 'data-testid': 'player', 'aria-label': t('playerLabel'), hidden: true },
    },
    el('div', { class: 'player-inner' }, head, followSlot, status, drawer),
  );

  document.body.append(bar);

  // The bar's height changes with the title, the drawer state and the safe
  // area; page padding follows the measured height instead of a fixed guess.
  let measuredHeight = -1;
  const syncBarHeight = (): void => {
    if (bar.hidden) {
      document.documentElement.style.removeProperty('--player-h');
      measuredHeight = -1;
      return;
    }
    const next = Math.round(bar.getBoundingClientRect().height);
    if (next === measuredHeight) return;
    measuredHeight = next;
    document.documentElement.style.setProperty('--player-h', `${next}px`);
  };
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(syncBarHeight).observe(bar);
  }
  window.addEventListener('resize', syncBarHeight);

  // The repeat button opens an explained drill sheet instead of cycling a
  // cryptic number (10E.2). Native <dialog> supplies focus and Escape.
  const repeatDialog = el('dialog', {
    class: 'repeat-sheet',
    attrs: { 'data-testid': 'repeat-sheet', 'aria-labelledby': 'repeat-sheet-title' },
  });
  document.body.append(repeatDialog);

  const paintRepeatSheet = (): void => {
    const close = el('button', {
      class: 'repeat-close',
      attrs: { type: 'button', 'data-testid': 'repeat-close' },
      text: t('repeatSheetClose'),
    });
    close.addEventListener('click', () => repeatDialog.close());

    const options = REPEAT_OPTIONS.map((option) => {
      const node = el('button', {
        class: 'repeat-option',
        attrs: {
          type: 'button',
          role: 'radio',
          'aria-checked': String(String(option.mode) === String(player.state.repeat)),
          'data-mode': String(option.mode),
          'data-testid': option.testId,
        },
        text: option.label(),
      });
      node.addEventListener('click', () => {
        player.setRepeat(option.mode);
        repeatDialog.close();
        repeat.focus();
      });
      return node;
    });

    repeatDialog.replaceChildren(
      el('h2', {
        class: 'repeat-title',
        attrs: { id: 'repeat-sheet-title' },
        text: t('repeatSheetTitle'),
      }),
      el('p', { class: 'repeat-hint', text: t('repeatSheetHint') }),
      el(
        'div',
        {
          class: 'repeat-options',
          attrs: { role: 'radiogroup', 'aria-labelledby': 'repeat-sheet-title' },
        },
        ...options,
      ),
      close,
    );
  };
  paintRepeatSheet();

  repeatDialog.addEventListener('click', (event) => {
    if (event.target === repeatDialog) repeatDialog.close();
  });

  const wire = (element: HTMLButtonElement, listener: () => void): void => {
    element.addEventListener('click', listener);
  };
  wire(repeat, () => repeatDialog.showModal());
  wire(previous, () => player.previous());
  wire(toggle, () => player.toggle());
  wire(next, () => player.next());

  const endScrub = (): void => {
    scrubbing = false;
  };
  scrubber.addEventListener('pointerdown', () => {
    scrubbing = true;
  });
  scrubber.addEventListener('pointerup', endScrub);
  scrubber.addEventListener('pointercancel', endScrub);
  scrubber.addEventListener('change', endScrub);
  scrubber.addEventListener('blur', endScrub);
  scrubber.addEventListener('input', () => {
    const duration = player.state.durationMs;
    if (duration <= 0) return;
    scrubbing = true;
    const ms = Math.round((Number(scrubber.value) / 1000) * duration);
    player.seek(ms);
    elapsed.textContent = formatDuration(ms);
    remaining.textContent = `−${formatDuration(Math.max(0, duration - ms))}`;
  });

  let drawerOpen = true;
  const setDrawerOpen = (open: boolean): void => {
    drawerOpen = open;
    drawer.hidden = !open;
    drawerToggle.setAttribute('aria-expanded', String(open));
    drawerToggle.setAttribute('aria-label', t(open ? 'playerHideControls' : 'playerShowControls'));
    drawerToggle.textContent = open ? '⌄' : '⌃';
    document.body.classList.toggle(
      'player-drawer-closed',
      !open && Boolean(player.state.clip),
    );
    window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  };

  drawerToggle.addEventListener('click', () => setDrawerOpen(!drawerOpen));

  const render = (state: PlayerState): void => {
    const clip = state.clip;
    bar.hidden = !clip;
    document.body.classList.toggle('has-player', Boolean(clip));
    if (!clip) {
      document.body.classList.remove('player-drawer-closed');
      title.removeAttribute('title');
      syncBarHeight();
      return;
    }

    document.body.classList.toggle('player-drawer-closed', !drawerOpen);
    drawerToggle.setAttribute(
      'aria-label',
      t(drawerOpen ? 'playerHideControls' : 'playerShowControls'),
    );

    const name = data ? surah(data, clip.surah).nameId : '';
    title.textContent = clip.displayName;
    // The bar shows one ellipsized line; the full name stays one hover/long-press away.
    title.setAttribute('title', clip.displayName);
    meta.textContent = name
      ? fill(t('clipMeta'), {
          page: clip.page,
          surah: name,
          from: clip.ayahStart,
          to: clip.ayahEnd,
        })
      : fill(t('playerPage'), { page: clip.page });
    meta.setAttribute('href', pageHref(clip.page));
    playlist.textContent =
      state.playlistRepeat > 1
        ? fill(t('playerPlaylistPass'), {
            pass: state.playlistPass,
            total: state.playlistRepeat,
          })
        : '';

    elapsed.textContent = formatDuration(state.positionMs);
    const left = Math.max(0, state.durationMs - state.positionMs);
    const leftText = formatDuration(left);
    remaining.textContent = `−${leftText}`;
    remaining.setAttribute('aria-label', fill(t('playerRemainingLabel'), { time: leftText }));

    if (state.durationMs > 0) {
      const ratio = Math.min(1, Math.max(0, state.positionMs / state.durationMs));
      if (!scrubbing) scrubber.value = String(Math.round(ratio * 1000));
      scrubber.setAttribute('aria-valuetext', formatDuration(state.positionMs));
    }

    toggle.textContent = state.playing ? t('playerPause') : t('playerPlay');
    repeat.textContent = repeatLabel(state.repeat);
    repeat.setAttribute('aria-label', t('playerRepeatMode'));
    previous.setAttribute('aria-label', t('playerPrevious'));
    next.setAttribute('aria-label', t('playerNext'));
    status.textContent = state.status === 'error' ? t('playerLoadFailed') : '';

    for (const option of repeatDialog.querySelectorAll<HTMLElement>('.repeat-option')) {
      option.setAttribute('aria-checked', String(option.dataset.mode === String(state.repeat)));
    }

    updateMediaSession(state, name);
  };

  player.subscribe(render);
  onLanguageChange(() => {
    paintRepeatSheet();
    render(player.state);
  });

  void loadQuran()
    .then((loaded) => {
      data = loaded;
      render(player.state);
    })
    .catch(() => {
      // The bar still works with page numbers only.
    });

  return followSlot;
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
  if (mode === 'one') return t('playerRepeatButtonOne');
  if (mode === 'all') return t('playerRepeatButtonAll');
  if (typeof mode === 'number') return fill(t('playerRepeatButtonCount'), { count: mode });
  return t('playerRepeatButtonOff');
}
