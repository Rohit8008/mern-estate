import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';
import seoPlugin from './seo/vite-plugin-seo.mjs';

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        secure: false,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        secure: false,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Rollup's CJS interop helpers are needed everywhere; pinning them to the
          // always-loaded chunk stops a lazy vendor chunk (maps) being pulled in eagerly.
          if (id.includes('commonjsHelpers') || id.includes('commonjs-')) return 'vendor-react';
          if (!id.includes('node_modules')) return undefined;
          const has = (...pkgs) => pkgs.some((p) => id.includes(`/node_modules/${p}/`));
          // prop-types is imported by react-apexcharts AND by the entry graph; if it
          // lands in vendor-charts the entry statically imports 580 KB of charts.
          // Redux shares the React chunk: react-redux and use-sync-external-store need
          // React at evaluation time, and a separate chunk produced a vendor-react <->
          // vendor-redux import cycle that left React undefined (white screen).
          if (has('react', 'react-dom', 'react-router-dom', 'react-router', '@remix-run', 'scheduler', 'prop-types', 'react-is', 'object-assign',
            '@reduxjs/toolkit', 'react-redux', 'redux-persist', 'redux', 'redux-thunk', 'immer', 'reselect', 'use-sync-external-store')) return 'vendor-react';
          if (has('leaflet', 'react-leaflet', '@react-leaflet')) return 'vendor-maps';
          if (has('apexcharts', 'react-apexcharts')) return 'vendor-charts';
          if (has('xlsx')) return 'vendor-xlsx';
          if (has('socket.io-client', 'socket.io-parser', 'engine.io-client', 'engine.io-parser', '@socket.io', 'xmlhttprequest-ssl')) return 'vendor-socket';
          // swiper is left to Rollup: it follows the Listing page chunk.
          return undefined;
        },
      },
    },
  },
  plugins: [
    react(),
    seoPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      // Inline the registration so there is no render-blocking registerSW.js request.
      injectRegister: 'inline',
      includeAssets: ['favicon.svg', 'apple-touch-icon.svg'],
      manifest: {
        name: 'Real Vista',
        short_name: 'Real Vista',
        description: 'Real Vista — a CRM for real estate agencies: leads, owners, properties and deals in one workspace.',
        theme_color: '#2b6faa',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/pwa-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: '/pwa-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // index.html must be precached: navigateFallback below binds to it, and
        // without it the service worker throws non-precached-url on install.
        globPatterns: ['**/*.{js,css,svg,png,woff2}', 'index.html'],
        maximumFileSizeToCacheInBytes: 1.5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        // Heavy, rarely-used chunks are fetched on demand and cached at runtime
        // (StaleWhileRevalidate below) instead of being downloaded on SW install.
        globIgnores: [
          '**/vendor-xlsx*.js',
          '**/vendor-charts*.js',
          '**/vendor-maps*.js',
          '**/PlatformConsole*.js',
          '**/Admin*.js',
        ],
        // Fall back to cached index.html for all SPA navigation when offline
        navigateFallback: 'index.html',
        // /app/ holds the Android APK and its latest.json: never answer those
        // with the SPA shell.
        navigateFallbackDenylist: [/^\/api\//, /^\/app\//],
        runtimeCaching: [
          // No rule for /api/. Responses there are personal data — clients,
          // owners, messages, the signed-in user — and a service-worker cache
          // outlives sign-out on a shared office computer. They go to the
          // network every time.
          {
            // Heavy lazy chunks left out of the precache
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /\/assets\/(vendor-xlsx|vendor-charts|vendor-maps|PlatformConsole|Admin)[^/]*\.js$/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'heavy-chunks-cache',
              expiration: { maxEntries: 30, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            // Cache uploaded images
            urlPattern: /^https?:\/\/.*\/uploads\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'uploads-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
          {
            // Cache Cloudinary images
            urlPattern: /^https:\/\/res\.cloudinary\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cloudinary-images-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
});
