export type Route =
  | { name: 'search' }
  | { name: 'page'; page: number }
  | { name: 'library' };

/**
 * Hash routing keeps the app a plain static bundle: no server rewrite rules and
 * deep links survive a reload offline (NFR-7).
 */
const PAGE_ROUTE = /^#\/p\/(\d+)$/;
const LIBRARY_ROUTE = /^#\/library$/;

export function parseRoute(hash: string): Route {
  const normalised = hash.replace(/\/+$/, '');
  if (LIBRARY_ROUTE.test(normalised)) return { name: 'library' };
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

export function navigate(route: Route): void {
  if (route.name === 'page') window.location.hash = pageHref(route.page);
  else if (route.name === 'library') window.location.hash = libraryHref();
  else window.location.hash = '#/';
}
