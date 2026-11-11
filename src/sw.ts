/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// Injected by vite-plugin-pwa at build time: every built asset, including the
// font and the hashed JS/CSS (FR-7.2). Revisions make each build a new version.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Every in-app navigation serves the cached shell, so it works with no network.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// The Quran text is one file fetched on demand; it is not precached because a
// listener who never opens a page should not pay for it. Cache it the first time
// it is used, so a page already visited opens offline (NFR-3).
registerRoute(
  ({ url }) => url.pathname === '/quran.json',
  new CacheFirst({ cacheName: 'ngajiplay-quran-data' }),
  'GET',
);

/**
 * A new build waits instead of taking over: swapping JS under an open recording
 * would be worse than showing "a new version is ready" and letting the listener
 * choose. The page asks for the switch with this message.
 */
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
