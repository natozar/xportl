import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // we call registerSW() explicitly in main.jsx
      devOptions: { enabled: false },
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        id: '/',
        name: 'XPortl - Deixe rastros. Encontre portais.',
        short_name: 'XPortl',
        description: 'A Realidade Aumentada de Capsulas do Tempo. Descubra portais digitais escondidos no mundo real.',
        theme_color: '#0d0a1a',
        background_color: '#0d0a1a',
        display: 'standalone',
        display_override: ['standalone', 'fullscreen'],
        orientation: 'portrait',
        // id stays '/' to preserve existing PWA installs (changing id spawns a
        // duplicate icon). scope stays '/' so users can navigate to the LP
        // from inside the installed app if they want. Only start_url moves.
        start_url: '/app',
        scope: '/',
        categories: ['games', 'social', 'entertainment'],
        lang: 'pt-BR',
        dir: 'ltr',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/group1-shard*', '**/tfjs*', '**/nsfw-ai*', '**/godmode*'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024, // 20MB — modern phones have plenty
        // App is at /app.html now; /index.html is the static LP and must not
        // be used as SPA fallback.
        navigateFallback: '/app.html',
        navigateFallbackDenylist: [/^\/$/, /^\/index\.html$/, /^\/landing/, /^\/godmode/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(aframe\.io|unpkg\.com|raw\.githack\.com|cdn\.jsdelivr\.net|cdn\.aframe\.io)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cdn-libs',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'capsule-media',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 3 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    // Strip the NSFW/TF.js chunk from the entry's modulepreload graph.
    // It's only needed when the user actually captures a photo, not at boot.
    modulePreload: {
      resolveDependencies: (_filename, deps) =>
        deps.filter((d) => !d.includes('nsfw-ai')),
    },
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),        // static landing page
        app: resolve(__dirname, 'app.html'),           // React application
        godmode: resolve(__dirname, 'godmode.html'),   // admin panel (isolated bundle)
      },
      output: {
        manualChunks(id) {
          // Isolate TensorFlow.js into its own lazy-loaded chunk
          if (id.includes('@tensorflow') || id.includes('nsfwjs')) {
            return 'nsfw-ai';
          }
        },
      },
    },
    chunkSizeWarningLimit: 6000, // TF.js shards are large, suppress warning
  },
  server: {
    https: true,
    host: true,
  },
});
