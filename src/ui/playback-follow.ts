import { sharedPlayer } from '../playback/player';
import { pageHref, parseRoute } from '../router';
import { onLanguageChange, t } from '../strings';
import { el } from './dom';

const PLAYING_AYAH = '[data-ayah-playing="true"]';

/**
 * Keeps the page and the audio in step (FR-6.1, FR-6.4):
 *
 * - starting playback opens the clip's page, and a track change while that page
 *   is on screen moves on with it;
 * - leaving the page — or scrolling the mark out of sight — offers one control
 *   that goes back to the playing ayah, without pausing a thing.
 *
 * It deliberately does not follow a track change made while the user is
 * somewhere else, because yanking a reader out of the library is worse than a
 * button under the bar.
 */
export function mountPlaybackFollow(slot: HTMLElement): void {
  const player = sharedPlayer();
  const chip = el('button', {
    class: 'player-follow',
    attrs: { type: 'button', 'data-testid': 'follow', hidden: true },
  });
  slot.append(chip);

  let lastClipId: string | null = null;
  let lastPage: number | null = null;
  /** The page the listener was on when this clip started, `null` on first load. */
  let startedFrom: number | null = null;
  let followed = false;
  let scheduled = false;

  const currentPage = (): number | null => {
    const route = parseRoute(window.location.hash);
    return route.name === 'page' ? route.page : null;
  };

  const scrollToPlaying = (attempts = 12): void => {
    const mark = document.querySelector<HTMLElement>(PLAYING_AYAH);
    if (mark) {
      mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    // The page may still be loading; a fresh render is only a prayer away.
    if (attempts <= 0) return;
    window.setTimeout(() => scrollToPlaying(attempts - 1), 100);
  };

  const paint = (): void => {
    scheduled = false;
    const clip = player.state.clip;
    if (!clip) {
      chip.hidden = true;
      return;
    }

    if (currentPage() !== clip.page) {
      show(t('followPage'));
      return;
    }

    const marks = document.querySelectorAll<HTMLElement>(PLAYING_AYAH);
    const first = marks[0];
    const last = marks[marks.length - 1];
    if (!first || !last) {
      // The clip's page is open but its mark is not on screen yet.
      chip.hidden = true;
      return;
    }

    // The bar covers the bottom of the viewport, so it does not count as "seen".
    const bar = slot.closest<HTMLElement>('[data-testid="player"]');
    const covered = bar ? bar.getBoundingClientRect().height + 16 : 0;
    const limit = window.innerHeight - covered;
    const visible =
      first.getBoundingClientRect().top < limit && last.getBoundingClientRect().bottom > 0;

    if (visible) chip.hidden = true;
    else show(t('followAyah'));
  };

  function show(label: string): void {
    chip.textContent = label;
    chip.setAttribute('aria-label', label);
    chip.hidden = false;
  }

  const schedule = (): void => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(paint);
  };

  chip.addEventListener('click', () => {
    const clip = player.state.clip;
    if (!clip) return;
    if (currentPage() !== clip.page) window.location.hash = pageHref(clip.page);
    scrollToPlaying();
  });

  player.subscribe((state) => {
    const clip = state.clip;
    if (!clip) {
      lastClipId = null;
      lastPage = null;
      startedFrom = null;
      followed = false;
      chip.hidden = true;
      return;
    }

    if (clip.id !== lastClipId) {
      lastClipId = clip.id;
      startedFrom = lastPage;
      lastPage = clip.page;
      followed = false;
    }

    if (state.playing && !followed) {
      const onPage = currentPage();
      const startHere = startedFrom === null;
      const watching = onPage !== null && onPage === startedFrom;

      if (startHere || watching) {
        followed = true;
        if (onPage !== clip.page) window.location.hash = pageHref(clip.page);
        if (onPage !== clip.page) window.setTimeout(() => scrollToPlaying(4), 0);
      }
    }

    schedule();
  });

  onLanguageChange(schedule);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('hashchange', schedule);

  // The page renders after the hash changes and after the Quran data resolves;
  // watching the view keeps the chip honest without any cross-module calls.
  const view = document.querySelector('#view');
  if (view) new MutationObserver(schedule).observe(view, { childList: true, subtree: true });

  paint();
}
