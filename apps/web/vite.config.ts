import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// 127.0.0.1, not localhost: Node 18+ resolves localhost to ::1 first, the API binds to 0.0.0.0 (IPv4
// only) and the proxy has no happy-eyeballs fallback, so every /api call would fail with a 500.
const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:4100';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'offline.html'],
      manifest: {
        name: 'Society ERP',
        short_name: 'SocietyERP',
        description: 'Configurable management platform for housing societies, RWAs and townships.',
        theme_color: '#4f46e5',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        shortcuts: [
          { name: 'Gate', url: '/guard', description: 'Guard gate dashboard' },
          { name: 'My Home', url: '/app/my', description: 'Resident self-service' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//],
        runtimeCaching: [
          {
            // read-only API responses the guard app needs offline (expected visitors, categories)
            urlPattern: ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/api/v1/') && /\/(visitors|society\/categories|auth\/me)/.test(url.pathname),
            handler: 'NetworkFirst',
            options: { cacheName: 'api-read-cache', networkTimeoutSeconds: 5, expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 6 }, cacheableResponse: { statuses: [200] } },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  optimizeDeps: { include: ['qrcode.react', 'html5-qrcode', 'recharts'] },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/socket.io': { target: apiTarget, ws: true, changeOrigin: true },
    },
  },
  preview: { port: 5174, strictPort: true },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query', 'axios', 'zustand'],
          charts: ['recharts'],
          scanner: ['html5-qrcode'],
        },
      },
    },
  },
});
