const KEY = 'ngajiPlay.mushafSize';

/** 22px is the smallest size that still separates the diacritics. */
export const MUSHAF_SIZE_MIN = 22;
export const MUSHAF_SIZE_MAX = 34;
export const MUSHAF_SIZE_DEFAULT = 26;
export const MUSHAF_SIZE_STEP = 2;

export function clampMushafSize(size: number): number {
  if (!Number.isFinite(size)) return MUSHAF_SIZE_DEFAULT;
  return Math.min(MUSHAF_SIZE_MAX, Math.max(MUSHAF_SIZE_MIN, Math.round(size)));
}

/** The chosen size survives navigation and reloads; 26px is the measured floor. */
export function storedMushafSize(): number {
  try {
    const stored = Number(localStorage.getItem(KEY));
    return Number.isFinite(stored) && stored > 0 ? clampMushafSize(stored) : MUSHAF_SIZE_DEFAULT;
  } catch {
    return MUSHAF_SIZE_DEFAULT;
  }
}

export function saveMushafSize(size: number): number {
  const clamped = clampMushafSize(size);
  try {
    localStorage.setItem(KEY, String(clamped));
  } catch {
    // Private mode: the size simply does not persist.
  }
  return clamped;
}

/**
 * Line height is a unitless multiplier in the stylesheet, so scaling the font
 * keeps the measured 2.0 ratio and the diacritics stay clear of the line above.
 */
export function applyMushafSize(node: HTMLElement, size: number): void {
  node.style.setProperty('--mushaf-size', `${clampMushafSize(size)}px`);
  node.dataset.mushafSize = String(clampMushafSize(size));
}
