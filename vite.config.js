import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * SANAD ships as an installable, offline-first app.
 *
 * Emergencies happen in basements, on roads, and where the signal is bad. The
 * flow JSON is bundled into the build (not fetched), so once the app has been
 * opened one time, every one of the ten cases works with the network off. The
 * only thing that needs connectivity is the AI classifier, which already falls
 * back to the offline matcher.
 */
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'SANAD — سند',
        short_name: 'سند',
        description: 'Verified step-by-step first aid, offline. إسعافات أولية موثوقة خطوة بخطوة.',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#EFEFEC',
        theme_color: '#C0322A',
        categories: ['medical', 'health', 'utilities'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Pre-rendered speech is cached the first time each clip plays,
            // rather than precached: a full set is a few hundred files, and
            // making a first visit wait for all of them would be the wrong
            // trade for an app someone opens in an emergency. Once a step has
            // been heard, it is available with no network.
            urlPattern: /\/audio\/.*\.(mp3|wav)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'sanad-speech',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
          {
            // The manifest decides which steps have real audio at all, so it is
            // kept fresh when online but always available offline.
            urlPattern: /\/audio\/manifest\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'sanad-speech-manifest',
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Webfonts are a nicety; never let them block a cold start.
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'sanad-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { host: true, port: 5173 },
});
