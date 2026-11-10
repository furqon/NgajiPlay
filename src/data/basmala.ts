/**
 * Render-time basmala split (FR-1.4). The vendored text is never modified: a
 * copy of the ayah with the basmala separated is produced for display only.
 *
 * Matching is diacritic-insensitive because Tanzil writes the basmala slightly
 * differently between surahs — surahs 95 and 97 carry an extra shadda, so a
 * literal comparison splits only 110 of the 112 prefixed surahs (REQ §8).
 */
const MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

function fold(value: string): string {
  // NFD, not NFC: decomposition is per-character, so folding a whole ayah and
  // folding it character by character produce the same sequence. NFC would
  // compose base+mark pairs in the whole string (ا + ٓ -> آ) but not when the
  // characters are visited one at a time, and the two sides would never match.
  return value.normalize('NFD').replace(MARKS, '').replace(/\u0671/g, '\u0627');
}

export interface BasmalaSplit {
  /** The matched basmala as it appears in the text, or null when absent. */
  basmala: string | null;
  /** The ayah without the leading basmala. */
  body: string;
}

export function splitBasmala(text: string, basmala = DEFAULT_BASMALA): BasmalaSplit {
  const target = fold(basmala);
  if (target === '') return { basmala: null, body: text };

  // Walk the original string while building its folded form, keeping a map back
  // to original indices so the split lands on a real character boundary.
  let folded = '';
  const originIndex: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = fold(text[index] ?? '');
    if (char === '') continue;
    for (const piece of char) {
      folded += piece;
      originIndex.push(index);
    }
  }

  if (!folded.startsWith(target)) return { basmala: null, body: text };

  const lastIndex = originIndex[target.length - 1];
  if (lastIndex === undefined) return { basmala: null, body: text };

  let end = lastIndex + 1;
  // The basmala ends in a kasra, so the next character is a mark, not a space:
  // carry trailing marks into the split before testing for the separator.
  while (end < text.length && fold(text[end] ?? '') === '') end += 1;

  const rest = text.slice(end);
  // A prefix match must end at a separator, not mid-word.
  if (rest !== '' && !/^\s/.test(rest)) return { basmala: null, body: text };

  return { basmala: text.slice(0, end), body: rest.replace(/^\s+/, '') };
}

/** The basmala as it appears in 1:1, used as the canonical spelling. */
export const DEFAULT_BASMALA = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ';

/**
 * Whether the basmala should be split from this ayah: ayah 1 of every surah
 * except 9 (which has none) and except 1 (where 1:1 *is* the basmala).
 */
export function shouldSplitBasmala(surah: number, ayah: number): boolean {
  return ayah === 1 && surah !== 1 && surah !== 9;
}
