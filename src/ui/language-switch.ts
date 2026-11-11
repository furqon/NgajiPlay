import { switchLanguage } from '../i18n';
import { LANGUAGES, currentLanguage, onLanguageChange, t } from '../strings';
import { el } from './dom';

/**
 * ID/EN segmented control in the header (FR-7.3). The codes are language
 * names, not copy, so they are the same in both dictionaries.
 */
export function mountLanguageSwitch(target: HTMLElement): void {
  if (target.querySelector('[data-testid="language-switch"]')) return;

  const group = el('div', {
    class: 'lang-switch',
    attrs: { role: 'group', 'data-testid': 'language-switch' },
  });
  target.append(group);

  const buttons = new Map<string, HTMLButtonElement>();
  for (const language of LANGUAGES) {
    const button = el('button', {
      class: 'lang-option',
      attrs: {
        type: 'button',
        'data-testid': `language-${language}`,
        'aria-pressed': 'false',
      },
      text: language.toUpperCase(),
    });
    button.addEventListener('click', () => void switchLanguage(language));
    buttons.set(language, button);
    group.append(button);
  }

  const paint = (): void => {
    group.setAttribute('aria-label', t('languageLabel'));
    for (const [language, button] of buttons) {
      button.setAttribute('aria-pressed', String(language === currentLanguage()));
    }
  };

  onLanguageChange(paint);
  paint();
}
