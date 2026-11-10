import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// The manifest lives in public/manifest.webmanifest so it is readable and
// reviewable on its own. Only the service worker is generated here: it is
// hand-written (src/sw.ts) and gets the build's asset list injected.
export default defineConfig({
  // Root hosting (Vercel). Serve from a subpath by changing this and start_url.
  base: '/',
  build: {
    target: 'es2022',
  },
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,
      manifest: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,woff2}'],
        // Raised above the default 2 MB so the bundled Quran text (NFR-1) fits.
        maximumFileSizeToCacheInBytes: 3_000_000,
      },
      devOptions: { enabled: false },
    }),
  ],
});
