import { loadQuran } from '../data/quran';
import { fill, t } from '../strings';
import { el } from './dom';

/**
 * About (FR-7.5). A licence obligation, not decoration: the Tanzil copyright
 * block ships verbatim inside the data file and is printed here untouched, with
 * the Amiri Quran OFL notice alongside it.
 */
export async function renderAbout(target: HTMLElement, isCurrent: () => boolean): Promise<void> {
  const back = el(
    'a',
    {
      class: 'back',
      attrs: { href: '#/', 'data-testid': 'back', 'aria-label': t('backToSearch') },
    },
    el('span', { attrs: { 'aria-hidden': 'true' }, text: '‹' }),
    el('span', { text: t('backToSearch') }),
  );

  const body = el('div', {
    class: 'about',
    attrs: { 'data-testid': 'about' },
  });
  body.append(el('p', { class: 'state', text: t('loading') }));

  target.replaceChildren(
    back,
    el('h2', { class: 'about-title', text: t('aboutTitle') }),
    el('p', { class: 'tagline', text: t('aboutTagline') }),
    body,
  );

  try {
    const data = await loadQuran();
    if (!isCurrent()) return;

    body.replaceChildren(
      section(t('aboutQuranTitle'), [
        el('p', { text: fill(t('aboutQuranBody'), { source: data.meta.source }) }),
        el('p', { text: t('aboutCopyrightLabel') }),
        // `text`, never innerHTML: the block is shipped exactly as Tanzil wrote it.
        el('pre', {
          class: 'about-copyright',
          attrs: { 'data-testid': 'copyright', dir: 'ltr' },
          text: data.meta.copyright,
        }),
        el('a', {
          class: 'about-link',
          attrs: {
            href: 'https://tanzil.net',
            target: '_blank',
            rel: 'noopener noreferrer',
            'data-testid': 'tanzil-link',
          },
          text: t('aboutTanzilLink'),
        }),
      ]),
      section(t('aboutFontTitle'), [
        el('p', { text: t('aboutFontBody') }),
        el('a', {
          class: 'about-link',
          attrs: { href: `${import.meta.env.BASE_URL}fonts/OFL.txt`, 'data-testid': 'ofl-link' },
          text: t('aboutFontLicense'),
        }),
      ]),
      section(t('aboutPrivacyTitle'), [el('p', { text: t('aboutPrivacyBody') })]),
    );
  } catch {
    if (!isCurrent()) return;
    body.replaceChildren(el('p', { class: 'state', text: t('aboutLoadError') }));
  }
}

function section(title: string, children: HTMLElement[]): HTMLElement {
  return el(
    'section',
    { class: 'about-block' },
    el('h3', { text: title }),
    ...children,
  );
}
