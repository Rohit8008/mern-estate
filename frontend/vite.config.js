import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

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
        manualChunks: {
          'vendor-react':    ['react', 'react-dom', 'react-router-dom'],
          'vendor-redux':    ['@reduxjs/toolkit', 'react-redux', 'redux-persist'],
          'vendor-maps':     ['leaflet', 'react-leaflet'],
          'vendor-charts':   ['apexcharts', 'react-apexcharts'],
          'vendor-xlsx':     ['xlsx'],
          'vendor-ui':       ['swiper', 'socket.io-client'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.svg'],
      manifest: {
        name: 'Real Vista',
        short_name: 'Real Vista',
        description: 'Real Vista — a CRM for real estate agencies: leads, owners, properties and deals in one workspace.',
        theme_color: '#4f46e5',
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
        globPatterns: ['**/*.{js,css,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
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
