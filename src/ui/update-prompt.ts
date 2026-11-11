import { t } from '../strings';
import { el } from './dom';

/**
 * The service worker no longer takes over by itself, so a new build announces
 * itself here (FR-7.2). Reloading waits for the new worker to activate, then
 * reloads once — never twice.
 */
export function watchForUpdates(registration: ServiceWorkerRegistration): void {
  if (document.querySelector('[data-testid="update"]')) return;

  const reload = el('button', {
    class: 'update-action',
    attrs: { type: 'button', 'data-testid': 'update-reload' },
    text: t('updateReload'),
  });
  const dismiss = el('button', {
    class: 'update-dismiss',
    attrs: { type: 'button', 'data-testid': 'update-dismiss', 'aria-label': t('hintClose') },
    text: '×',
  });
  const banner = el(
    'div',
    {
      class: 'update',
      attrs: { 'data-testid': 'update', role: 'status', hidden: true },
    },
    el('span', { text: t('updateReady') }),
    reload,
    dismiss,
  );

  document.body.append(banner);
  const show = (): void => {
    banner.hidden = false;
  };

  if (registration.waiting && navigator.serviceWorker.controller) show();

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    installing?.addEventListener('statechange', () => {
      // "installed" with a controller in place means an update, not a first run.
      if (installing.state === 'installed' && navigator.serviceWorker.controller) show();
    });
  });

  // Only a tap may reload. The first install also fires `controllerchange`
  // (the worker claims the page), and reloading then would throw away whatever
  // the listener was doing — including an open recording.
  let reloadRequested = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloadRequested) return;
    reloadRequested = false;
    window.location.reload();
  });

  reload.addEventListener('click', () => {
    const waiting = registration.waiting;
    if (!waiting) {
      window.location.reload();
      return;
    }
    reloadRequested = true;
    waiting.postMessage('SKIP_WAITING');
  });

  dismiss.addEventListener('click', () => {
    banner.hidden = true;
  });
}
