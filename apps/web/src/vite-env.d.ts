/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Absolute origin of the API, e.g. `https://society-erp-api.onrender.com`.
   * Leave unset when the web app and the API share an origin (dev proxy, nginx, single-service deploy).
   */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
