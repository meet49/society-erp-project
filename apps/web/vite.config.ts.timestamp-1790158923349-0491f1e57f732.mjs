// vite.config.ts
import { defineConfig } from "file:///D:/project/SocietyERP/node_modules/vite/dist/node/index.js";
import react from "file:///D:/project/SocietyERP/node_modules/@vitejs/plugin-react/dist/index.js";
import { VitePWA } from "file:///D:/project/SocietyERP/node_modules/vite-plugin-pwa/dist/index.js";
import path from "node:path";
var __vite_injected_original_dirname = "D:\\project\\SocietyERP\\apps\\web";
var apiTarget = process.env.VITE_API_PROXY_TARGET || "http://localhost:4100";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/icon-192.png", "icons/icon-512.png", "offline.html"],
      manifest: {
        name: "Society ERP",
        short_name: "SocietyERP",
        description: "Configurable management platform for housing societies, RWAs and townships.",
        theme_color: "#4f46e5",
        background_color: "#0f172a",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
        ],
        shortcuts: [
          { name: "Gate", url: "/guard", description: "Guard gate dashboard" },
          { name: "My Home", url: "/app/my", description: "Resident self-service" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//],
        runtimeCaching: [
          {
            // read-only API responses the guard app needs offline (expected visitors, categories)
            urlPattern: ({ url, request }) => request.method === "GET" && url.pathname.startsWith("/api/v1/") && /\/(visitors|society\/categories|auth\/me)/.test(url.pathname),
            handler: "NetworkFirst",
            options: { cacheName: "api-read-cache", networkTimeoutSeconds: 5, expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 6 }, cacheableResponse: { statuses: [200] } }
          },
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: { cacheName: "fonts", expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } }
          }
        ]
      },
      devOptions: { enabled: false }
    })
  ],
  resolve: {
    alias: { "@": path.resolve(__vite_injected_original_dirname, "src") }
  },
  optimizeDeps: { include: ["qrcode.react", "html5-qrcode", "recharts"] },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
      "/socket.io": { target: apiTarget, ws: true, changeOrigin: true }
    }
  },
  preview: { port: 5174, strictPort: true },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          query: ["@tanstack/react-query", "axios", "zustand"],
          charts: ["recharts"],
          scanner: ["html5-qrcode"]
        }
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxwcm9qZWN0XFxcXFNvY2lldHlFUlBcXFxcYXBwc1xcXFx3ZWJcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkQ6XFxcXHByb2plY3RcXFxcU29jaWV0eUVSUFxcXFxhcHBzXFxcXHdlYlxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vRDovcHJvamVjdC9Tb2NpZXR5RVJQL2FwcHMvd2ViL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnO1xuaW1wb3J0IHsgVml0ZVBXQSB9IGZyb20gJ3ZpdGUtcGx1Z2luLXB3YSc7XG5pbXBvcnQgcGF0aCBmcm9tICdub2RlOnBhdGgnO1xuXG5jb25zdCBhcGlUYXJnZXQgPSBwcm9jZXNzLmVudi5WSVRFX0FQSV9QUk9YWV9UQVJHRVQgfHwgJ2h0dHA6Ly9sb2NhbGhvc3Q6NDEwMCc7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtcbiAgICByZWFjdCgpLFxuICAgIFZpdGVQV0Eoe1xuICAgICAgcmVnaXN0ZXJUeXBlOiAnYXV0b1VwZGF0ZScsXG4gICAgICBpbmNsdWRlQXNzZXRzOiBbJ2Zhdmljb24uc3ZnJywgJ2ljb25zL2ljb24tMTkyLnBuZycsICdpY29ucy9pY29uLTUxMi5wbmcnLCAnb2ZmbGluZS5odG1sJ10sXG4gICAgICBtYW5pZmVzdDoge1xuICAgICAgICBuYW1lOiAnU29jaWV0eSBFUlAnLFxuICAgICAgICBzaG9ydF9uYW1lOiAnU29jaWV0eUVSUCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQ29uZmlndXJhYmxlIG1hbmFnZW1lbnQgcGxhdGZvcm0gZm9yIGhvdXNpbmcgc29jaWV0aWVzLCBSV0FzIGFuZCB0b3duc2hpcHMuJyxcbiAgICAgICAgdGhlbWVfY29sb3I6ICcjNGY0NmU1JyxcbiAgICAgICAgYmFja2dyb3VuZF9jb2xvcjogJyMwZjE3MmEnLFxuICAgICAgICBkaXNwbGF5OiAnc3RhbmRhbG9uZScsXG4gICAgICAgIHN0YXJ0X3VybDogJy8nLFxuICAgICAgICBzY29wZTogJy8nLFxuICAgICAgICBpY29uczogW1xuICAgICAgICAgIHsgc3JjOiAnL2ljb25zL2ljb24tMTkyLnBuZycsIHNpemVzOiAnMTkyeDE5MicsIHR5cGU6ICdpbWFnZS9wbmcnIH0sXG4gICAgICAgICAgeyBzcmM6ICcvaWNvbnMvaWNvbi01MTIucG5nJywgc2l6ZXM6ICc1MTJ4NTEyJywgdHlwZTogJ2ltYWdlL3BuZycgfSxcbiAgICAgICAgICB7IHNyYzogJy9pY29ucy9pY29uLTUxMi5wbmcnLCBzaXplczogJzUxMng1MTInLCB0eXBlOiAnaW1hZ2UvcG5nJywgcHVycG9zZTogJ2FueSBtYXNrYWJsZScgfSxcbiAgICAgICAgXSxcbiAgICAgICAgc2hvcnRjdXRzOiBbXG4gICAgICAgICAgeyBuYW1lOiAnR2F0ZScsIHVybDogJy9ndWFyZCcsIGRlc2NyaXB0aW9uOiAnR3VhcmQgZ2F0ZSBkYXNoYm9hcmQnIH0sXG4gICAgICAgICAgeyBuYW1lOiAnTXkgSG9tZScsIHVybDogJy9hcHAvbXknLCBkZXNjcmlwdGlvbjogJ1Jlc2lkZW50IHNlbGYtc2VydmljZScgfSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgICB3b3JrYm94OiB7XG4gICAgICAgIGdsb2JQYXR0ZXJuczogWycqKi8qLntqcyxjc3MsaHRtbCxzdmcscG5nLHdvZmYyfSddLFxuICAgICAgICBuYXZpZ2F0ZUZhbGxiYWNrOiAnL2luZGV4Lmh0bWwnLFxuICAgICAgICBuYXZpZ2F0ZUZhbGxiYWNrRGVueWxpc3Q6IFsvXlxcL2FwaVxcLy8sIC9eXFwvc29ja2V0XFwuaW9cXC8vXSxcbiAgICAgICAgcnVudGltZUNhY2hpbmc6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICAvLyByZWFkLW9ubHkgQVBJIHJlc3BvbnNlcyB0aGUgZ3VhcmQgYXBwIG5lZWRzIG9mZmxpbmUgKGV4cGVjdGVkIHZpc2l0b3JzLCBjYXRlZ29yaWVzKVxuICAgICAgICAgICAgdXJsUGF0dGVybjogKHsgdXJsLCByZXF1ZXN0IH0pID0+IHJlcXVlc3QubWV0aG9kID09PSAnR0VUJyAmJiB1cmwucGF0aG5hbWUuc3RhcnRzV2l0aCgnL2FwaS92MS8nKSAmJiAvXFwvKHZpc2l0b3JzfHNvY2lldHlcXC9jYXRlZ29yaWVzfGF1dGhcXC9tZSkvLnRlc3QodXJsLnBhdGhuYW1lKSxcbiAgICAgICAgICAgIGhhbmRsZXI6ICdOZXR3b3JrRmlyc3QnLFxuICAgICAgICAgICAgb3B0aW9uczogeyBjYWNoZU5hbWU6ICdhcGktcmVhZC1jYWNoZScsIG5ldHdvcmtUaW1lb3V0U2Vjb25kczogNSwgZXhwaXJhdGlvbjogeyBtYXhFbnRyaWVzOiAxMDAsIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiA2IH0sIGNhY2hlYWJsZVJlc3BvbnNlOiB7IHN0YXR1c2VzOiBbMjAwXSB9IH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICB1cmxQYXR0ZXJuOiAoeyB1cmwgfSkgPT4gdXJsLm9yaWdpbiA9PT0gJ2h0dHBzOi8vZm9udHMuZ29vZ2xlYXBpcy5jb20nIHx8IHVybC5vcmlnaW4gPT09ICdodHRwczovL2ZvbnRzLmdzdGF0aWMuY29tJyxcbiAgICAgICAgICAgIGhhbmRsZXI6ICdDYWNoZUZpcnN0JyxcbiAgICAgICAgICAgIG9wdGlvbnM6IHsgY2FjaGVOYW1lOiAnZm9udHMnLCBleHBpcmF0aW9uOiB7IG1heEVudHJpZXM6IDIwLCBtYXhBZ2VTZWNvbmRzOiA2MCAqIDYwICogMjQgKiAzNjUgfSB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgICAgZGV2T3B0aW9uczogeyBlbmFibGVkOiBmYWxzZSB9LFxuICAgIH0pLFxuICBdLFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHsgJ0AnOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnc3JjJykgfSxcbiAgfSxcbiAgb3B0aW1pemVEZXBzOiB7IGluY2x1ZGU6IFsncXJjb2RlLnJlYWN0JywgJ2h0bWw1LXFyY29kZScsICdyZWNoYXJ0cyddIH0sXG4gIHNlcnZlcjoge1xuICAgIHBvcnQ6IDUxNzQsXG4gICAgc3RyaWN0UG9ydDogdHJ1ZSxcbiAgICBwcm94eToge1xuICAgICAgJy9hcGknOiB7IHRhcmdldDogYXBpVGFyZ2V0LCBjaGFuZ2VPcmlnaW46IHRydWUgfSxcbiAgICAgICcvc29ja2V0LmlvJzogeyB0YXJnZXQ6IGFwaVRhcmdldCwgd3M6IHRydWUsIGNoYW5nZU9yaWdpbjogdHJ1ZSB9LFxuICAgIH0sXG4gIH0sXG4gIHByZXZpZXc6IHsgcG9ydDogNTE3NCwgc3RyaWN0UG9ydDogdHJ1ZSB9LFxuICBidWlsZDoge1xuICAgIHNvdXJjZW1hcDogZmFsc2UsXG4gICAgY2h1bmtTaXplV2FybmluZ0xpbWl0OiA5MDAsXG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgb3V0cHV0OiB7XG4gICAgICAgIG1hbnVhbENodW5rczoge1xuICAgICAgICAgIHJlYWN0OiBbJ3JlYWN0JywgJ3JlYWN0LWRvbScsICdyZWFjdC1yb3V0ZXItZG9tJ10sXG4gICAgICAgICAgcXVlcnk6IFsnQHRhbnN0YWNrL3JlYWN0LXF1ZXJ5JywgJ2F4aW9zJywgJ3p1c3RhbmQnXSxcbiAgICAgICAgICBjaGFydHM6IFsncmVjaGFydHMnXSxcbiAgICAgICAgICBzY2FubmVyOiBbJ2h0bWw1LXFyY29kZSddLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICB9LFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXNSLFNBQVMsb0JBQW9CO0FBQ25ULE9BQU8sV0FBVztBQUNsQixTQUFTLGVBQWU7QUFDeEIsT0FBTyxVQUFVO0FBSGpCLElBQU0sbUNBQW1DO0FBS3pDLElBQU0sWUFBWSxRQUFRLElBQUkseUJBQXlCO0FBRXZELElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLFFBQVE7QUFBQSxNQUNOLGNBQWM7QUFBQSxNQUNkLGVBQWUsQ0FBQyxlQUFlLHNCQUFzQixzQkFBc0IsY0FBYztBQUFBLE1BQ3pGLFVBQVU7QUFBQSxRQUNSLE1BQU07QUFBQSxRQUNOLFlBQVk7QUFBQSxRQUNaLGFBQWE7QUFBQSxRQUNiLGFBQWE7QUFBQSxRQUNiLGtCQUFrQjtBQUFBLFFBQ2xCLFNBQVM7QUFBQSxRQUNULFdBQVc7QUFBQSxRQUNYLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxVQUNMLEVBQUUsS0FBSyx1QkFBdUIsT0FBTyxXQUFXLE1BQU0sWUFBWTtBQUFBLFVBQ2xFLEVBQUUsS0FBSyx1QkFBdUIsT0FBTyxXQUFXLE1BQU0sWUFBWTtBQUFBLFVBQ2xFLEVBQUUsS0FBSyx1QkFBdUIsT0FBTyxXQUFXLE1BQU0sYUFBYSxTQUFTLGVBQWU7QUFBQSxRQUM3RjtBQUFBLFFBQ0EsV0FBVztBQUFBLFVBQ1QsRUFBRSxNQUFNLFFBQVEsS0FBSyxVQUFVLGFBQWEsdUJBQXVCO0FBQUEsVUFDbkUsRUFBRSxNQUFNLFdBQVcsS0FBSyxXQUFXLGFBQWEsd0JBQXdCO0FBQUEsUUFDMUU7QUFBQSxNQUNGO0FBQUEsTUFDQSxTQUFTO0FBQUEsUUFDUCxjQUFjLENBQUMsa0NBQWtDO0FBQUEsUUFDakQsa0JBQWtCO0FBQUEsUUFDbEIsMEJBQTBCLENBQUMsWUFBWSxpQkFBaUI7QUFBQSxRQUN4RCxnQkFBZ0I7QUFBQSxVQUNkO0FBQUE7QUFBQSxZQUVFLFlBQVksQ0FBQyxFQUFFLEtBQUssUUFBUSxNQUFNLFFBQVEsV0FBVyxTQUFTLElBQUksU0FBUyxXQUFXLFVBQVUsS0FBSyw0Q0FBNEMsS0FBSyxJQUFJLFFBQVE7QUFBQSxZQUNsSyxTQUFTO0FBQUEsWUFDVCxTQUFTLEVBQUUsV0FBVyxrQkFBa0IsdUJBQXVCLEdBQUcsWUFBWSxFQUFFLFlBQVksS0FBSyxlQUFlLEtBQUssS0FBSyxFQUFFLEdBQUcsbUJBQW1CLEVBQUUsVUFBVSxDQUFDLEdBQUcsRUFBRSxFQUFFO0FBQUEsVUFDeEs7QUFBQSxVQUNBO0FBQUEsWUFDRSxZQUFZLENBQUMsRUFBRSxJQUFJLE1BQU0sSUFBSSxXQUFXLGtDQUFrQyxJQUFJLFdBQVc7QUFBQSxZQUN6RixTQUFTO0FBQUEsWUFDVCxTQUFTLEVBQUUsV0FBVyxTQUFTLFlBQVksRUFBRSxZQUFZLElBQUksZUFBZSxLQUFLLEtBQUssS0FBSyxJQUFJLEVBQUU7QUFBQSxVQUNuRztBQUFBLFFBQ0Y7QUFBQSxNQUNGO0FBQUEsTUFDQSxZQUFZLEVBQUUsU0FBUyxNQUFNO0FBQUEsSUFDL0IsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUNBLFNBQVM7QUFBQSxJQUNQLE9BQU8sRUFBRSxLQUFLLEtBQUssUUFBUSxrQ0FBVyxLQUFLLEVBQUU7QUFBQSxFQUMvQztBQUFBLEVBQ0EsY0FBYyxFQUFFLFNBQVMsQ0FBQyxnQkFBZ0IsZ0JBQWdCLFVBQVUsRUFBRTtBQUFBLEVBQ3RFLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLFlBQVk7QUFBQSxJQUNaLE9BQU87QUFBQSxNQUNMLFFBQVEsRUFBRSxRQUFRLFdBQVcsY0FBYyxLQUFLO0FBQUEsTUFDaEQsY0FBYyxFQUFFLFFBQVEsV0FBVyxJQUFJLE1BQU0sY0FBYyxLQUFLO0FBQUEsSUFDbEU7QUFBQSxFQUNGO0FBQUEsRUFDQSxTQUFTLEVBQUUsTUFBTSxNQUFNLFlBQVksS0FBSztBQUFBLEVBQ3hDLE9BQU87QUFBQSxJQUNMLFdBQVc7QUFBQSxJQUNYLHVCQUF1QjtBQUFBLElBQ3ZCLGVBQWU7QUFBQSxNQUNiLFFBQVE7QUFBQSxRQUNOLGNBQWM7QUFBQSxVQUNaLE9BQU8sQ0FBQyxTQUFTLGFBQWEsa0JBQWtCO0FBQUEsVUFDaEQsT0FBTyxDQUFDLHlCQUF5QixTQUFTLFNBQVM7QUFBQSxVQUNuRCxRQUFRLENBQUMsVUFBVTtBQUFBLFVBQ25CLFNBQVMsQ0FBQyxjQUFjO0FBQUEsUUFDMUI7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
