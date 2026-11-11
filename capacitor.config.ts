import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The Android package is the same static build in a WebView, so the app ships
 * every asset itself and works with no network — the APK is an alternative to
 * installing the PWA, not a different app.
 */
const config: CapacitorConfig = {
  appId: 'com.ngajiplay.app',
  appName: 'ngajiPlay',
  webDir: 'dist',
  android: {
    // The service worker's precache paths are rooted at /, which is also how the
    // WebView serves the bundled assets (https://localhost/).
    allowMixedContent: false,
  },
};

export default config;
