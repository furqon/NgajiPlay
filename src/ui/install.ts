import { onLanguageChange, t, type StringKey } from '../strings';
import { el } from './dom';

/** Chromium-only event; not in lib.dom. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Android/desktop Chrome offers an install prompt when the manifest and service
 * worker are in place (FR-7.1). The captured event is replayed only on a tap,
 * so the app never nags, and the control stays hidden when nothing is offered.
 */
export function mountInstall(target: HTMLElement): void {
  if (target.querySelector('[data-testid="install"]')) return;

  const button = el(
    'button',
    {
      class: 'icon-button',
      attrs: {
        type: 'button',
        'data-testid': 'install',
        'aria-label': t('installLabel'),
        title: t('installLabel'),
        hidden: true,
      },
    },
    downloadIcon(),
  );

  let deferred: InstallPromptEvent | null = null;

  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppresses Chrome's own mini-infobar so the app can show its one-tap
    // install icon instead. Chrome logs an informational "banner not shown"
    // warning for this, which is expected: prompt() runs on the user's tap.
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    button.hidden = false;
  });

  button.addEventListener('click', () => {
    const promptEvent = deferred;
    deferred = null;
    button.hidden = true;
    if (promptEvent) void promptEvent.prompt();
  });

  window.addEventListener('appinstalled', () => {
    deferred = null;
    button.hidden = true;
  });

  const paint = (): void => {
    button.setAttribute('aria-label', t('installLabel'));
    button.setAttribute('title', t('installLabel'));
  };
  onLanguageChange(paint);

  target.append(button);
}

/** Which sentence the how-to modal should show for this device. */
export function installGuidanceKey(): StringKey {
  const ua = navigator.userAgent;
  const touchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iphone|ipad|ipod/i.test(ua) || touchMac ? 'installIos' : 'installHint';
}

function downloadIcon(): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');

  const arrow = document.createElementNS(ns, 'path');
  arrow.setAttribute('d', 'M12 4v9m0 0 3.5-3.5M12 13 8.5 9.5M5 17.5V19h14v-1.5');
  arrow.setAttribute('fill', 'none');
  arrow.setAttribute('stroke', 'currentColor');
  arrow.setAttribute('stroke-width', '1.6');
  arrow.setAttribute('stroke-linecap', 'round');
  arrow.setAttribute('stroke-linejoin', 'round');
  svg.append(arrow);

  return svg;
}
