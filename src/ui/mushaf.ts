import { shouldSplitBasmala, splitBasmala } from '../data/basmala';
import { ayahText, surah } from '../data/quran';
import { fill, t } from '../strings';
import type { PageSlice, QuranData } from '../types';
import { el } from './dom';
import { ayahMedallion } from './format';

/**
 * One slice as it sits on the page: a surah header band when the surah starts
 * here, the basmala split off ayah 1, then every ayah inline so the paragraph
 * justifies the way a printed page does.
 *
 * Shared by the page view and the recorder so the text the child recites is
 * exactly the text on the page (FR-2.5).
 */
export function sliceNodes(data: QuranData, slice: PageSlice): HTMLElement[] {
  const nodes: HTMLElement[] = [];

  if (slice.ayahStart === 1) nodes.push(surahHeader(data, slice.surah));

  const ayahs: HTMLElement[] = [];
  for (let ayah = slice.ayahStart; ayah <= slice.ayahEnd; ayah += 1) {
    let text = ayahText(data, slice.surah, ayah);

    // The basmala is stored inside 1:1, so it is separated at render time only;
    // the data stays verbatim (REQ §8.1).
    if (ayah === 1 && shouldSplitBasmala(slice.surah, 1)) {
      const split = splitBasmala(text);
      if (split.basmala) {
        nodes.push(
          el('p', { class: 'basmala', attrs: { 'data-testid': 'basmala' }, text: split.basmala }),
        );
        text = split.body;
      }
    }

    ayahs.push(ayahSpan(slice.surah, ayah, text));
  }

  const paragraph = el('p', { class: 'ayahs' });
  ayahs.forEach((node) => {
    // A literal space, not CSS margin: justification has to see the gap.
    if (paragraph.childNodes.length > 0) paragraph.append(' ');
    paragraph.append(node);
  });
  nodes.push(paragraph);

  return nodes;
}

/** The same slice inside its own RTL article, used by the recording panel. */
export function sliceMushaf(data: QuranData, slice: PageSlice, testId: string): HTMLElement {
  const article = el('article', {
    class: 'mushaf mushaf-slice',
    attrs: { dir: 'rtl', lang: 'ar', 'data-testid': testId },
  });
  article.append(...sliceNodes(data, slice));
  return article;
}

function ayahSpan(surahNumber: number, ayah: number, text: string): HTMLElement {
  return el(
    'span',
    {
      class: 'ayah',
      attrs: {
        id: `a-${surahNumber}-${ayah}`,
        'data-surah': surahNumber,
        'data-ayah': ayah,
      },
    },
    text,
    el('span', {
      class: 'ayah-mark',
      attrs: { 'aria-hidden': 'true' },
      text: ayahMedallion(ayah),
    }),
  );
}

function surahHeader(data: QuranData, number: number): HTMLElement {
  const entry = surah(data, number);

  return el(
    'header',
    { class: 'surah-header', attrs: { 'data-testid': 'surah-header', 'data-surah': number } },
    el('p', { class: 'surah-name-ar', text: entry.nameAr }),
    el('p', {
      class: 'surah-name-latin',
      attrs: { dir: 'ltr' },
      text: `${fill(t('surahStartLabel'), { number })} · ${entry.nameId}`,
    }),
  );
}
