import { onLanguageChange, t } from '../strings';
import { el } from './dom';
import { installGuidanceKey } from './install';

/**
 * "How it works" behind a header icon rather than a card on the search screen:
 * the explanation is there when wanted, and the search box is not pushed down
 * for someone who has already learned the flow. A native `<dialog>` gives the
 * focus trap, Escape handling and backdrop for free.
 */
export function mountHowTo(target: HTMLElement, label?: string): void {
  if (target.querySelector('[data-testid="how-to-open"]')) return;

  const open = label
    ? el('button', {
        class: 'settings-button',
        attrs: {
          type: 'button',
          'data-testid': 'how-to-open',
          'aria-label': label,
          title: label,
        },
        text: label,
      })
    : el(
        'button',
        {
          class: 'icon-button',
          attrs: {
            type: 'button',
            'data-testid': 'how-to-open',
            'aria-label': t('hintTitle'),
            title: t('hintTitle'),
          },
        },
        el('span', { attrs: { 'aria-hidden': 'true' }, text: '?' }),
      );

  const dialog = el('dialog', {
    class: 'how-to',
    attrs: { 'data-testid': 'how-to', 'aria-labelledby': 'how-to-title' },
  });

  const paint = (): void => {
    open.setAttribute('aria-label', t('hintTitle'));
    open.setAttribute('title', t('hintTitle'));

    const close = el('button', {
      class: 'how-to-close',
      attrs: { type: 'button', 'data-testid': 'how-to-close' },
      text: t('hintClose'),
    });
    close.addEventListener('click', () => dialog.close());

    // About lives here now: quiet information behind the same icon, instead of
    // a footer link on every screen.
    const about = el('a', {
      class: 'how-to-about',
      attrs: { href: '#/about', 'data-testid': 'about-link' },
      text: t('aboutOpen'),
    });
    // Leaving the route while the dialog is open would keep it on top of the
    // About screen, so close it first.
    about.addEventListener('click', () => dialog.close());

    dialog.replaceChildren(
      el('h2', { class: 'how-to-title', attrs: { id: 'how-to-title' }, text: t('hintTitle') }),
      // The one-line pitch used to sit under the search box; here it is read
      // deliberately rather than pushing the app down on every visit.
      el('p', { class: 'how-to-intro', attrs: { 'data-testid': 'how-to-intro' }, text: t('tagline') }),
      el(
        'ol',
        { class: 'how-to-steps' },
        el('li', { text: t('hintStep1') }),
        el('li', { text: t('hintStep2') }),
        el('li', { text: t('hintStep3') }),
      ),
      // FR-7.1: Android gets the one-tap prompt, iOS gets the Share-sheet path.
      el('p', {
        class: 'how-to-install',
        attrs: { 'data-testid': 'install-guidance' },
        text: t(installGuidanceKey()),
      }),
      el('p', {
        class: 'how-to-install',
        attrs: { 'data-testid': 'backup-guidance' },
        text: t('hintBackup'),
      }),
      el('p', {
        class: 'how-to-install',
        attrs: { 'data-testid': 'import-guidance' },
        text: t('hintRestore'),
      }),
      el('div', { class: 'how-to-actions' }, close, about),
    );
  };

  // A tap on the backdrop (the dialog element itself) dismisses it.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  open.addEventListener('click', () => dialog.showModal());

  onLanguageChange(paint);
  paint();
  target.append(open, dialog);
}
