import { switchLanguage } from '../i18n';
import { currentLanguage, onLanguageChange, t } from '../strings';
import { el } from './dom';

/**
 * One compact button that flips between the two languages (FR-7.3). A
 * segmented control costs three times the header room on a phone, and there
 * are only two choices.
 */
export function mountLanguageSwitch(target: HTMLElement): void {
  if (target.querySelector('[data-testid="language-toggle"]')) return;

  const button = el('button', {
    class: 'lang-toggle',
    attrs: { type: 'button', 'data-testid': 'language-toggle' },
  });

  const paint = (): void => {
    const language = currentLanguage();
    // The label names where the button will take you, not where you are.
    const label = t(language === 'id' ? 'languageToEnglish' : 'languageToIndonesian');
    button.textContent = language.toUpperCase();
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
  };

  button.addEventListener('click', () => {
    void switchLanguage(currentLanguage() === 'id' ? 'en' : 'id');
  });

  onLanguageChange(paint);
  paint();
  target.append(button);
}
