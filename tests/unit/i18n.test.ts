import { afterEach, describe, expect, it } from 'vitest';
import { isLanguage } from '../../src/i18n';
import {
  applyLanguage,
  currentLanguage,
  onLanguageChange,
  strings,
  t,
  type StringKey,
} from '../../src/strings';

function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').sort();
}

const ID_KEYS = Object.keys(strings.id) as StringKey[];

describe('string dictionary', () => {
  it('defines every key in both languages with no empty value (FR-7.3)', () => {
    expect(Object.keys(strings.en).sort()).toEqual(Object.keys(strings.id).sort());

    for (const language of ['id', 'en'] as const) {
      for (const key of ID_KEYS) {
        expect(strings[language][key].trim(), `${language}.${key}`).not.toBe('');
      }
    }
  });

  it('keeps the same placeholders in both languages, so no field is dropped', () => {
    for (const key of ID_KEYS) {
      expect(placeholders(strings.en[key]), key).toEqual(placeholders(strings.id[key]));
    }
  });

  it('really translates the copy instead of copying Indonesian across', () => {
    // Two values are the same on purpose: "Surah" is the same word in both
    // languages, and clipStats is pure formatting.
    const sharedByDesign = new Set<StringKey>(['surahStartLabel', 'clipStats']);
    const identical = ID_KEYS.filter(
      (key) => !sharedByDesign.has(key) && strings.en[key] === strings.id[key],
    );
    expect(identical).toEqual([]);
  });
});

describe('language state', () => {
  afterEach(() => {
    applyLanguage('id');
  });

  it('starts in Indonesian regardless of the browser locale', () => {
    expect(currentLanguage()).toBe('id');
    expect(t('searchButton')).toBe('Cari');
  });

  it('notifies listeners only when the language actually changes', () => {
    const seen: string[] = [];
    const stop = onLanguageChange((language) => seen.push(language));

    applyLanguage('en');
    applyLanguage('en');
    applyLanguage('id');
    stop();
    applyLanguage('en');

    expect(seen).toEqual(['en', 'id']);
    // The stopped listener saw nothing of the last switch, but the dictionary did.
    expect(seen).toHaveLength(2);
    expect(t('searchButton')).toBe('Search');
  });

  it('accepts only the two supported language codes', () => {
    expect(isLanguage('id')).toBe(true);
    expect(isLanguage('en')).toBe(true);
    expect(isLanguage('fr')).toBe(false);
    expect(isLanguage(null)).toBe(false);
  });
});
