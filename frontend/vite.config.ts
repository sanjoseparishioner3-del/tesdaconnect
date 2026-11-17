import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Precache only what the app shell needs offline. The landing-page 3D model and
      // photo gallery are fetched on demand and cached at runtime (see runtimeCaching).
      includeAssets: [
        'favicon.svg',
        'favicon.ico',
        'apple-touch-icon.png',
        'tesda-logo.png',
        'tesda-logo-circular.png',
        'tesda-official-logo.png',
        'images/tesda-logo.png',
        'images/landing/tesda-main-plaza.jpg',
      ],
      manifest: {
        id: '/',
        name: 'TCTESDAConnect — TESDA Training Operations',
        short_name: 'TESDA Connect',
        description:
          'Offline-capable TESDA training operations workflow support for Balli School of Technology (BST) and Mamburao Integrated Farm (MIF).',
        start_url: '/app',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#ffffff',
        theme_color: '#047857',
        icons: [
          {
            src: '/pwa-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/pwa-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html}'],
        // Landing-only 3D (three.js) and staff-only Excel export are large and not needed by
        // the offline app shell; they are runtime-cached the first time they are used online.
        globIgnores: ['**/LaptopCanvasScene-*.js', '**/exceljs*.js'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/auth\//, /^\/storage\//],
        // Keep Supabase REST/Auth/Storage traffic strictly network-only so PII is never
        // implicitly cached in unencrypted Workbox HTTP caches (Dexie stores scoped offline data).
        runtimeCaching: [
          {
            // Hashed build chunks left out of the precache (immutable, so cache-first is safe).
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesda-lazy-chunks-v1',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 60 },
            },
          },
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/models/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesda-landing-models-v1',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/images/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesda-static-images-v1',
              expiration: {
                maxEntries: 40,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.hostname.includes('supabase.co') || url.pathname.startsWith('/rest/v1') || url.pathname.startsWith('/auth/v1'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Only split out the always-needed, rarely-changing core libraries. Heavy libraries
        // that are lazy-loaded (three.js on the landing page, exceljs for staff exports) are left
        // to Rollup so they stay in their own on-demand chunks instead of loading at startup.
        // (The previous explicit vendor chunks made the 1 MB three.js and exceljs chunks
        // load on every page, including offline on scholars' phones.)
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return undefined;
          // Rollup module ids always use forward slashes, including on Windows.
          const pkg = (name: string) => id.includes(`/node_modules/${name}/`);
          if (pkg('react') || pkg('react-dom') || pkg('react-router') || pkg('react-router-dom') || pkg('scheduler')) {
            return 'react-vendor';
          }
          if (id.includes('/node_modules/@supabase/')) return 'supabase-vendor';
          return undefined;
        },
      },
    },
  },
});
