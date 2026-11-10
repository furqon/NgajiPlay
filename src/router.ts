export type Route = { name: 'search' } | { name: 'page'; page: number };

/**
 * Hash routing keeps the app a plain static bundle: no server rewrite rules and
 * deep links survive a reload offline (NFR-7).
 */
const PAGE_ROUTE = /^#\/p\/(\d+)$/;

export function parseRoute(hash: string): Route {
  const match = PAGE_ROUTE.exec(hash.replace(/\/+$/, ''));
  if (!match?.[1]) return { name: 'search' };
  return { name: 'page', page: Number(match[1]) };
}

export function pageHref(page: number): string {
  return `#/p/${page}`;
}

export function navigate(route: Route): void {
  window.location.hash = route.name === 'page' ? pageHref(route.page) : '#/';
}
