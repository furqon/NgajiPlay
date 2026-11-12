import {
  builtInGoogleClientId,
  saveGoogleClientId,
  storedGoogleClientId,
} from '../drive/config';
import { settingsHref } from '../router';
import { fill, onLanguageChange, t } from '../strings';
import { el } from './dom';
import { mountHowTo } from './how-to';

export function mountSettingsLink(target: HTMLElement): void {
  if (target.querySelector('[data-testid="settings-link"]')) return;

  const link = el('a', {
    class: 'icon-link',
    attrs: { href: settingsHref(), 'data-testid': 'settings-link' },
  });
  link.append(settingsIcon());

  const paint = (): void => {
    link.setAttribute('aria-label', t('settingsOpen'));
    link.setAttribute('title', t('settingsOpen'));
  };

  onLanguageChange(paint);
  paint();
  target.append(link);
}

function settingsIcon(): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');

  const gear = document.createElementNS(ns, 'path');
  gear.setAttribute(
    'd',
    'M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm8.2 4.9v-2.2l-2-.6a6.6 6.6 0 0 0-.7-1.6l1-1.8-1.6-1.6-1.8 1a6.6 6.6 0 0 0-1.6-.7l-.6-2h-2.2l-.6 2a6.6 6.6 0 0 0-1.6.7l-1.8-1-1.6 1.6 1 1.8a6.6 6.6 0 0 0-.7 1.6l-2 .6v2.2l2 .6a6.6 6.6 0 0 0 .7 1.6l-1 1.8 1.6 1.6 1.8-1a6.6 6.6 0 0 0 1.6.7l.6 2h2.2l.6-2a6.6 6.6 0 0 0 1.6-.7l1.8 1 1.6-1.6-1-1.8a6.6 6.6 0 0 0 .7-1.6l2-.6Z',
  );
  gear.setAttribute('fill', 'none');
  gear.setAttribute('stroke', 'currentColor');
  gear.setAttribute('stroke-width', '1.4');
  gear.setAttribute('stroke-linejoin', 'round');
  svg.append(gear);

  return svg;
}

export async function renderSettings(
  target: HTMLElement,
  isCurrent: () => boolean,
): Promise<void> {
  const back = el(
    'a',
    {
      class: 'back',
      attrs: { href: '#/', 'data-testid': 'back', 'aria-label': t('backToSearch') },
    },
    el('span', { attrs: { 'aria-hidden': 'true' }, text: '‹' }),
    el('span', { text: t('backToSearch') }),
  );

  const body = el('div', { class: 'settings' });
  target.replaceChildren(
    back,
    el('h2', { class: 'settings-title', text: t('settingsTitle') }),
    el('p', { class: 'tagline', text: t('settingsTagline') }),
    body,
  );

  const [stored, builtIn] = await Promise.all([storedGoogleClientId(), Promise.resolve(builtInGoogleClientId())]);
  if (!isCurrent()) return;

  const input = el('input', {
    class: 'settings-input',
    attrs: {
      type: 'text',
      value: stored,
      placeholder: '1234567890-abc.apps.googleusercontent.com',
      autocomplete: 'off',
      spellcheck: 'false',
      'data-testid': 'google-client-id',
      'aria-label': t('settingsGoogleLabel'),
    },
  });
  const save = el('button', {
    class: 'settings-button settings-button-primary',
    attrs: { type: 'submit', 'data-testid': 'google-client-id-save' },
    text: t('settingsGoogleSave'),
  });
  const clear = el('button', {
    class: 'settings-button',
    attrs: { type: 'button', 'data-testid': 'google-client-id-clear' },
    text: t('settingsGoogleClear'),
  });
  const status = el('p', {
    class: 'settings-status',
    attrs: { 'data-testid': 'settings-status', 'aria-live': 'polite' },
  });
  const setUp = el(
    'form',
    { class: 'settings-form' },
    el('label', { class: 'settings-label', text: t('settingsGoogleLabel'), attrs: { for: 'google-client-id' } }),
    input,
    el('div', { class: 'settings-actions' }, save, clear),
    status,
  );
  input.id = 'google-client-id';

  const builtInNote = builtIn
    ? el('p', {
        class: 'settings-note',
        attrs: { 'data-testid': 'settings-built-in' },
        text: fill(t('settingsGoogleBuiltIn'), { id: builtIn }),
      })
    : null;

  const origin = window.location.origin;
  const setupLink = el('a', {
    class: 'about-link',
    attrs: {
      href: 'https://console.cloud.google.com/apis/credentials',
      target: '_blank',
      rel: 'noopener noreferrer',
    },
    text: t('settingsGoogleOpenConsole'),
  });

  // Help lives behind the Settings tab instead of a header glyph (10A.2).
  const help = el(
    'section',
    { class: 'settings-block', attrs: { 'data-testid': 'settings-help' } },
    el('h3', { text: t('settingsHelpTitle') }),
    el('p', { text: t('settingsHelpBody') }),
  );
  mountHowTo(help, t('hintTitle'));

  body.replaceChildren(
    help,
    el(
      'section',
      { class: 'settings-block', attrs: { 'data-testid': 'settings-google' } },
      el('h3', { text: t('settingsGoogleTitle') }),
      el('p', { text: t('settingsGoogleBody') }),
      el('p', { class: 'settings-note', text: t('settingsGooglePrivacy') }),
      ...(builtInNote ? [builtInNote] : []),
      setUp,
      el('p', { class: 'settings-note' }, document.createTextNode(fill(t('settingsGoogleOrigin'), { origin }))),
      el('p', { class: 'settings-note', text: t('settingsGoogleSetup') }),
      setupLink,
    ),
  );

  setUp.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (value !== '' && !value.endsWith('.apps.googleusercontent.com')) {
      status.textContent = t('settingsGoogleInvalid');
      return;
    }
    void saveGoogleClientId(value)
      .then(() => {
        input.value = value;
        status.textContent = value === '' ? t('settingsGoogleCleared') : t('settingsGoogleSaved');
      })
      .catch(() => {
        status.textContent = t('settingsGoogleSaveFailed');
      });
  });

  clear.addEventListener('click', () => {
    void saveGoogleClientId('')
      .then(() => {
        input.value = '';
        status.textContent = t('settingsGoogleCleared');
      })
      .catch(() => {
        status.textContent = t('settingsGoogleSaveFailed');
      });
  });
}
