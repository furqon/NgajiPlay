export type Route =
  | { name: 'search' }
  | { name: 'page'; page: number }
  | { name: 'library' }
  | { name: 'about' };

/**
 * Hash routing keeps the app a plain static bundle: no server rewrite rules and
 * deep links survive a reload offline (NFR-7).
 */
const PAGE_ROUTE = /^#\/p\/(\d+)$/;
const LIBRARY_ROUTE = /^#\/library$/;
const ABOUT_ROUTE = /^#\/about$/;

export function parseRoute(hash: string): Route {
  const normalised = hash.replace(/\/+$/, '');
  if (LIBRARY_ROUTE.test(normalised)) return { name: 'library' };
  if (ABOUT_ROUTE.test(normalised)) return { name: 'about' };
  const match = PAGE_ROUTE.exec(normalised);
  if (!match?.[1]) return { name: 'search' };
  return { name: 'page', page: Number(match[1]) };
}

export function pageHref(page: number): string {
  return `#/p/${page}`;
}

export function libraryHref(): string {
  return '#/library';
}

export function aboutHref(): string {
  return '#/about';
}

export function navigate(route: Route): void {
  if (route.name === 'page') window.location.hash = pageHref(route.page);
  else if (route.name === 'library') window.location.hash = libraryHref();
  else window.location.hash = '#/';
}
