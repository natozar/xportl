import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // we call registerSW() explicitly in main.jsx
      devOptions: { enabled: true, type: 'module' },
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
        start_url: '/',
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
        screenshots: [
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'XPortl AR View',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{css,html,svg,png,woff2}'],
        globIgnores: ['**/group1-shard*', '**/tfjs*'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
        navigateFallback: '/index.html',
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
    rollupOptions: {
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
