import './styles.css';
import { initLanguage } from './i18n';
import { sharedPlayer } from './playback/player';
import { readResume, trackResume } from './playback/resume';
import { parseRoute, type Route } from './router';
import { listClips } from './store/db';
import { currentLanguage, fill, onLanguageChange, t } from './strings';
import { renderAbout } from './ui/about-view';
import { mountHowTo } from './ui/how-to';
import { renderLibrary } from './ui/library-view';
import { mountLanguageSwitch } from './ui/language-switch';
import { renderPage } from './ui/page-view';
import { mountPlaybackFollow } from './ui/playback-follow';
import { mountPlayerBar } from './ui/player-bar';
import { closeRecorder, isRecorderOpen } from './ui/record-panel';
import { renderSearch } from './ui/search-view';

const view = document.querySelector<HTMLElement>('#view');
const statusEl = document.querySelector<HTMLElement>('[data-testid="status"]');
const chromeActions = document.querySelector<HTMLElement>('[data-testid="chrome-actions"]');

type StatusKey = 'ready' | 'firstLoad' | 'offline' | 'noSw';

let statusKey: StatusKey | null = null;

/** The status is kept as a key, never as a string, so it repaints on a language change. */
function setStatus(key: StatusKey): void {
  statusKey = key;
  paintStatus();
}

/** The dot carries no text of its own; the sentence is its tooltip and name. */
function paintStatus(): void {
  if (!statusEl || !statusKey) return;
  const text = t(statusKey);
  statusEl.setAttribute('data-state', statusKey);
  statusEl.setAttribute('title', text);
  statusEl.setAttribute('aria-label', text);
}

let renderId = 0;

/** One render per route; a slower, older render must never paint over a newer one. */
async function render(route: Route): Promise<void> {
  if (!view) return;
  const id = ++renderId;

  document.title =
    route.name === 'page'
      ? fill(t('pageTitle'), { page: route.page })
      : route.name === 'library'
        ? `${t('libraryTitle')} · ngajiPlay`
        : route.name === 'about'
          ? `${t('aboutTitle')} · ngajiPlay`
          : 'ngajiPlay';
  window.scrollTo(0, 0);
  // A recording must not outlive the view that shows it: the microphone would
  // stay open and the timer would keep running off-screen.
  closeRecorder();
  view.replaceChildren();

  if (route.name === 'search') {
    renderSearch(view);
    return;
  }

  if (route.name === 'library') {
    await renderLibrary(view, () => id === renderId);
    return;
  }

  if (route.name === 'about') {
    await renderAbout(view, () => id === renderId);
    return;
  }

  await renderPage(view, route.page, () => id === renderId);
}

/** FR-5.4: the last clip comes back paused where it stopped, never playing. */
async function restoreBookmark(): Promise<void> {
  try {
    const point = await readResume();
    if (!point) return;
    await sharedPlayer().restore(await listClips(), point.clipId, point.positionMs);
  } catch {
    // No bookmark is better than a broken start.
  }
}

async function start(): Promise<void> {
  // The stored language is applied before the first paint (FR-7.3).
  await initLanguage();
  document.documentElement.lang = currentLanguage();
  if (chromeActions) {
    mountLanguageSwitch(chromeActions);
    mountHowTo(chromeActions);
    // Language, help, then the status dot: the dot stays at the far right.
    if (statusEl) chromeActions.append(statusEl);
  }
  paintStatus();

  // One audio element for the app, mounted outside `#view` so navigating never
  // interrupts playback (FR-5.5).
  mountPlaybackFollow(mountPlayerBar());
  trackResume(sharedPlayer());

  onLanguageChange(() => {
    paintStatus();
    // Never throw away a capture in progress just to change the wording.
    if (!isRecorderOpen()) void render(parseRoute(window.location.hash));
  });

  window.addEventListener('hashchange', () => void render(parseRoute(window.location.hash)));
  await render(parseRoute(window.location.hash));

  void restoreBookmark();
  void registerServiceWorker();
}

/**
 * Registers the service worker and reflects its state in the shell. The pill is
 * the offline state from NFR-8: ready, first load, offline, or unsupported.
 */
async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    setStatus('noSw');
    return;
  }

  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    const registration = await navigator.serviceWorker.ready;
    setStatus(registration.active ? 'ready' : 'firstLoad');
  } catch {
    setStatus('noSw');
  }
}

window.addEventListener('offline', () => setStatus('offline'));
window.addEventListener('online', () => void registerServiceWorker());

void start();
