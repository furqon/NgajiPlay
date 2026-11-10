import './styles.css';
import { parseRoute, type Route } from './router';
import { currentLanguage, fill, t } from './strings';
import { renderPage } from './ui/page-view';
import { renderLibrary } from './ui/library-view';
import { closeRecorder } from './ui/record-panel';
import { renderSearch } from './ui/search-view';

const view = document.querySelector<HTMLElement>('#view');
const statusEl = document.querySelector('[data-testid="status"]');
const statusTextEl = document.querySelector('[data-testid="status-text"]');

function setStatus(state: 'ready' | 'firstLoad' | 'offline' | 'noSw', text: string): void {
  if (!statusEl || !statusTextEl) return;
  statusEl.setAttribute('data-state', state);
  statusTextEl.textContent = text;
}

const language = currentLanguage();
document.documentElement.lang = language;

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

  await renderPage(view, route.page, () => id === renderId);
}

window.addEventListener('hashchange', () => void render(parseRoute(window.location.hash)));
void render(parseRoute(window.location.hash));

/**
 * Registers the service worker and reflects its state in the shell.
 * The status pill is scaffolding for the offline proof; Phase 7 replaces it
 * with the designed states.
 */
async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    setStatus('noSw', t('noSw', language));
    return;
  }

  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    const registration = await navigator.serviceWorker.ready;

    if (registration.active) {
      setStatus('ready', t('ready', language));
    } else {
      setStatus('firstLoad', t('firstLoad', language));
    }
  } catch {
    setStatus('noSw', t('noSw', language));
  }
}

window.addEventListener('offline', () => setStatus('offline', t('offline', language)));
window.addEventListener('online', () => void registerServiceWorker());

void registerServiceWorker();
