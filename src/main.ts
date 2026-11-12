import './styles.css';
import { initLanguage } from './i18n';
import { sharedPlayer } from './playback/player';
import { readResume, trackResume } from './playback/resume';
import { parseRoute, type Route } from './router';
import { listClips } from './store/db';
import { currentLanguage, fill, onLanguageChange, t } from './strings';
import { renderAbout } from './ui/about-view';
import { mountBottomNav, setActiveRoute } from './ui/bottom-nav';
import { mountInstall } from './ui/install';
import { renderLibrary } from './ui/library-view';
import { mountLanguageSwitch } from './ui/language-switch';
import { renderPage } from './ui/page-view';
import { mountPlaybackFollow } from './ui/playback-follow';
import { mountPlayerBar } from './ui/player-bar';
import { closeRecorder, isRecorderOpen } from './ui/record-panel';
import { renderSearch } from './ui/search-view';
import { renderSettings } from './ui/settings-view';
import { watchForUpdates } from './ui/update-prompt';

const view = document.querySelector<HTMLElement>('#view');
const statusEl = document.querySelector<HTMLElement>('[data-testid="status"]');
const statusTextEl = document.querySelector<HTMLElement>('.status-text');
const chromeActions = document.querySelector<HTMLElement>('[data-testid="chrome-actions"]');

type StatusKey = 'ready' | 'firstLoad' | 'offline' | 'noSw';

let statusKey: StatusKey | null = null;
let statusOpen = false;

/** The status is kept as a key, never as a string, so it repaints on a language change. */
function setStatus(key: StatusKey): void {
  statusKey = key;
  statusOpen = false;
  paintStatus();
}

/**
 * The dot is the whole story; its sentence is a hover tooltip that also opens
 * on tap/focus, so the header stays one compact row and nothing is lost to a
 * touch screen (10A.2).
 */
function paintStatus(): void {
  if (!statusEl || !statusKey) return;
  const text = t(statusKey);
  statusEl.setAttribute('data-state', statusKey);
  statusEl.setAttribute('data-open', String(statusOpen));
  statusEl.setAttribute('aria-expanded', String(statusOpen));
  statusEl.setAttribute('title', text);
  statusEl.setAttribute('aria-label', text);
  if (statusTextEl) statusTextEl.textContent = text;
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
        : route.name === 'settings'
          ? `${t('settingsTitle')} · ngajiPlay`
          : route.name === 'about'
            ? `${t('aboutTitle')} · ngajiPlay`
            : 'ngajiPlay';
  window.scrollTo(0, 0);
  // A recording must not outlive the view that shows it: the microphone would
  // stay open and the timer would keep running off-screen.
  closeRecorder();
  view.replaceChildren();

  // Update bottom nav active state
  setActiveRoute(route);

  if (route.name === 'search') {
    renderSearch(view);
    return;
  }

  if (route.name === 'library') {
    await renderLibrary(view, () => id === renderId);
    return;
  }

  if (route.name === 'settings') {
    await renderSettings(view, () => id === renderId);
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
    // Install appears only when the browser offers it, so it sits after language toggle.
    mountInstall(chromeActions);
    // Status dot on the right; click/tap reveals its sentence.
    if (statusEl) {
      statusEl.className = 'status';
      statusEl.addEventListener('click', () => {
        statusOpen = !statusOpen;
        paintStatus();
      });
      chromeActions.append(statusEl);
    }
  }
  paintStatus();

  // Bottom navigation bar: How-To, Settings and Library moved here.
  mountBottomNav();

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
  // `vite dev` has no built worker: /sw.js falls through to index.html, and the
  // browser rejects that with "unsupported MIME type ('text/html')". Offline is
  // a production-build concern, exercised by the shell tests against `preview`.
  if (!import.meta.env.PROD) {
    setStatus('noSw');
    return;
  }

  if (!('serviceWorker' in navigator)) {
    setStatus('noSw');
    return;
  }

  try {
    const base = import.meta.env.BASE_URL;
    const registration = await navigator.serviceWorker.register(`${base}sw.js`, { scope: base });
    watchForUpdates(registration);
    const ready = await navigator.serviceWorker.ready;
    setStatus(ready.active ? 'ready' : 'firstLoad');
  } catch {
    setStatus('noSw');
  }
}

window.addEventListener('offline', () => setStatus('offline'));
window.addEventListener('online', () => void registerServiceWorker());

void start();
