import { libraryHref, pageHref, settingsHref } from '../router';
import type { Route } from '../router';
import { onLanguageChange, t, type StringKey } from '../strings';

const LAST_PAGE_KEY = 'ngajiPlay.lastPage';

/** Returns the last-visited page number, or 1 if none stored. */
function lastPage(): number {
  try {
    const stored = localStorage.getItem(LAST_PAGE_KEY);
    const n = stored ? Number(stored) : NaN;
    return Number.isFinite(n) && n >= 1 && n <= 604 ? n : 1;
  } catch {
    return 1;
  }
}

/** Called by the page view so the Mushaf tab returns to the last read page. */
export function saveLastPage(page: number): void {
  try {
    localStorage.setItem(LAST_PAGE_KEY, String(page));
  } catch {
    // Private mode: the tab falls back to page 1, nothing else breaks.
  }
}

type TabDef = {
  labelKey: StringKey;
  testId: string;
  route: Route['name'] | Route['name'][];
  href: () => string;
  icon: string;
};

const TABS: TabDef[] = [
  {
    labelKey: 'navMushaf',
    testId: 'nav-mushaf',
    route: 'page',
    href: () => pageHref(lastPage()),
    icon: `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4a1 1 0 0 1 1-1h4.5c.8 0 1.5.7 1.5 1.5V16c0-.8-.7-1.5-1.5-1.5H4a1 1 0 0 1-1-1V4Z"/><path d="M17 4a1 1 0 0 0-1-1h-4.5C10.7 3 10 3.7 10 4.5V16c0-.8.7-1.5 1.5-1.5H16a1 1 0 0 0 1-1V4Z"/></svg>`,
  },
  {
    labelKey: 'navSearch',
    testId: 'nav-search',
    route: 'search',
    href: () => '#/',
    icon: `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8.5" cy="8.5" r="5"/><line x1="12.5" y1="12.5" x2="17" y2="17"/></svg>`,
  },
  {
    // The library keeps its original test id: every existing flow reaches it here.
    labelKey: 'navLibrary',
    testId: 'library-link',
    route: 'library',
    href: () => libraryHref(),
    icon: `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10a7 7 0 0 1 14 0"/><rect x="2" y="10" width="3" height="5" rx="1.5"/><rect x="15" y="10" width="3" height="5" rx="1.5"/></svg>`,
  },
  {
    labelKey: 'navSettings',
    testId: 'settings-link',
    route: ['settings', 'about'],
    href: () => settingsHref(),
    icon: `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="4" y1="6" x2="16" y2="6"/><line x1="4" y1="10" x2="16" y2="10"/><line x1="4" y1="14" x2="16" y2="14"/><circle cx="8" cy="6" r="1.8" fill="#fff"/><circle cx="13" cy="10" r="1.8" fill="#fff"/><circle cx="7" cy="14" r="1.8" fill="#fff"/></svg>`,
  },
];

type Tab = { anchor: HTMLAnchorElement; label: HTMLSpanElement; def: TabDef };

let tabs: Tab[] = [];

function matches(def: TabDef, routeName: Route['name']): boolean {
  return Array.isArray(def.route) ? def.route.includes(routeName) : def.route === routeName;
}

/** Reflects the current route on the right tab, and refreshes the Mushaf href. */
export function setActiveRoute(route: Route): void {
  for (const tab of tabs) {
    if (matches(tab.def, route.name)) tab.anchor.setAttribute('aria-current', 'page');
    else tab.anchor.removeAttribute('aria-current');
    if (tab.def.route === 'page') tab.anchor.href = tab.def.href();
  }
}

function paintLabels(nav: HTMLElement): void {
  nav.setAttribute('aria-label', t('navLabel'));
  for (const tab of tabs) {
    const label = t(tab.def.labelKey);
    tab.label.textContent = label;
    tab.anchor.setAttribute('title', label);
  }
}

/**
 * The four-tab bottom navigation (10A.1): one thumb, one tap to the mushaf,
 * the index, the recordings and the settings. Fixed, safe-area aware, and
 * above nothing that would cover it.
 */
export function mountBottomNav(): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.setAttribute('data-testid', 'bottom-nav');

  tabs = TABS.map((def) => {
    const anchor = document.createElement('a');
    anchor.className = 'bottom-nav-tab';
    anchor.href = def.href();
    anchor.setAttribute('data-testid', def.testId);
    // Static, in-repo markup: no user or Quran text ever goes through innerHTML.
    anchor.innerHTML = def.icon;
    const label = document.createElement('span');
    anchor.append(label);
    return { anchor, label, def };
  });

  nav.append(...tabs.map((tab) => tab.anchor));
  document.body.append(nav);
  document.body.classList.add('has-bottom-nav');
  paintLabels(nav);
  onLanguageChange(() => paintLabels(nav));

  return nav;
}
