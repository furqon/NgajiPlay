import { onLanguageChange, t } from '../strings';
import { el } from './dom';

/**
 * "How it works" behind a header icon rather than a card on the search screen:
 * the explanation is there when wanted, and the search box is not pushed down
 * for someone who has already learned the flow. A native `<dialog>` gives the
 * focus trap, Escape handling and backdrop for free.
 */
export function mountHowTo(target: HTMLElement): void {
  if (target.querySelector('[data-testid="how-to-open"]')) return;

  const open = el(
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

    dialog.replaceChildren(
      el('h2', { class: 'how-to-title', attrs: { id: 'how-to-title' }, text: t('hintTitle') }),
      el(
        'ol',
        { class: 'how-to-steps' },
        el('li', { text: t('hintStep1') }),
        el('li', { text: t('hintStep2') }),
        el('li', { text: t('hintStep3') }),
      ),
      close,
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
