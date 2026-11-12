import { juzStartPage, pageCount } from '../data/quran';
import { pageHref } from '../router';
import { fill, t } from '../strings';
import { el } from './dom';

/** Juz shortcuts: the first, the middle and Juz 'Amma. */
const SHORTCUTS = [1, 15, 30] as const;

/** The open dialog, so reopening replaces it instead of stacking dialogs. */
let open: HTMLDialogElement | null = null;

/**
 * Direct page access (10C.1). The pager label opens this: typing a number or
 * dragging the slider reaches any of the 604 pages in one gesture instead of
 * tapping `›` three hundred times.
 */
export function openPageJump(current: number): void {
  open?.remove();

  const input = el('input', {
    class: 'page-jump-input',
    attrs: {
      type: 'number',
      inputmode: 'numeric',
      min: 1,
      max: pageCount,
      step: 1,
      value: current,
      'aria-label': t('pageJumpLabel'),
      'data-testid': 'page-jump-input',
    },
  });

  const slider = el('input', {
    class: 'page-jump-slider',
    attrs: {
      type: 'range',
      min: 1,
      max: pageCount,
      step: 1,
      value: current,
      'aria-label': t('pageJumpLabel'),
      'data-testid': 'page-jump-slider',
    },
  });

  const preview = el('p', {
    class: 'page-jump-preview',
    attrs: { 'data-testid': 'page-jump-preview', 'aria-live': 'polite' },
    text: fill(t('pageJumpPreview'), { page: current, total: pageCount }),
  });

  const error = el('p', {
    class: 'page-jump-error',
    attrs: { 'data-testid': 'page-jump-error', role: 'alert' },
  });

  const read = (): number | null => {
    const value = Number(input.value);
    return Number.isInteger(value) && value >= 1 && value <= pageCount ? value : null;
  };

  const previewAt = (page: number): void => {
    preview.textContent = fill(t('pageJumpPreview'), { page, total: pageCount });
  };

  const setPage = (page: number): void => {
    const valid = Math.min(pageCount, Math.max(1, Math.round(page)));
    input.value = String(valid);
    slider.value = String(valid);
    previewAt(valid);
    error.textContent = '';
  };

  input.addEventListener('input', () => {
    const page = read();
    if (page === null) {
      preview.textContent = '';
      return;
    }
    slider.value = String(page);
    previewAt(page);
    error.textContent = '';
  });

  slider.addEventListener('input', () => {
    input.value = slider.value;
    previewAt(Number(slider.value));
    error.textContent = '';
  });

  const dialog = el(
    'dialog',
    {
      class: 'page-jump',
      attrs: { 'data-testid': 'page-jump', 'aria-labelledby': 'page-jump-title' },
    },
    el('h2', {
      class: 'page-jump-title',
      attrs: { id: 'page-jump-title' },
      text: t('pageJumpTitle'),
    }),
    el('p', { class: 'page-jump-hint', text: t('pageJumpHint') }),
    el(
      'form',
      // `novalidate`: an out-of-range number is answered by our own message,
      // not by the browser silently refusing to submit.
      { class: 'page-jump-form', attrs: { novalidate: true } },
      input,
      slider,
      el(
        'div',
        { class: 'page-jump-shortcuts' },
        ...SHORTCUTS.map((juz) => {
          const shortcut = el('button', {
            class: 'page-jump-shortcut',
            attrs: { type: 'button', 'data-testid': `page-jump-juz-${juz}` },
            text: fill(t('pageJumpJuz'), { juz }),
          });
          shortcut.addEventListener('click', () => setPage(juzStartPage(juz)));
          return shortcut;
        }),
      ),
      preview,
      error,
      el(
        'div',
        { class: 'page-jump-actions' },
        el('button', {
          class: 'page-jump-go',
          attrs: { type: 'submit', 'data-testid': 'page-jump-go' },
          text: t('pageJumpOpen'),
        }),
        el('button', {
          class: 'page-jump-cancel',
          attrs: { type: 'button', 'data-testid': 'page-jump-close' },
          text: t('pageJumpClose'),
        }),
      ),
    ),
  );

  dialog
    .querySelector<HTMLButtonElement>('[data-testid="page-jump-close"]')
    ?.addEventListener('click', () => dialog.close());

  dialog.querySelector('form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const page = read();
    if (page === null) {
      error.textContent = t('searchErrorPage');
      input.focus();
      return;
    }
    dialog.close();
    window.location.hash = pageHref(page);
  });

  // A tap on the backdrop dismisses; Escape is handled by <dialog> itself.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (open === dialog) open = null;
  });

  open = dialog;
  document.body.append(dialog);
  dialog.showModal();
  input.focus();
}
