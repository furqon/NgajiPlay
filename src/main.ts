import './styles.css';
import { currentLanguage, t } from './strings';

const statusEl = document.querySelector('[data-testid="status"]');
const statusTextEl = document.querySelector('[data-testid="status-text"]');
const taglineEl = document.querySelector('[data-testid="tagline"]');

function setStatus(state: 'ready' | 'firstLoad' | 'offline' | 'noSw', text: string): void {
  if (!statusEl || !statusTextEl) return;
  statusEl.setAttribute('data-state', state);
  statusTextEl.textContent = text;
}

const language = currentLanguage();
document.documentElement.lang = language;
if (taglineEl) taglineEl.textContent = t('tagline', language);

/**
 * Registers the service worker and reflects its state in the shell.
 * The shell is the Phase 0 proof that the app is installable and works
 * offline; real screens arrive in Phase 2.
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
