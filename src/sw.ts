/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// Injected by vite-plugin-pwa at build time: every built asset (FR-7.2).
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Every in-app navigation serves the cached shell, so it works with no network.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
