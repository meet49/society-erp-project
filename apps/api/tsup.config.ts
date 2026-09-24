import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { server: 'src/server.ts', seed: 'src/seed/index.ts', worker: 'src/worker.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  splitting: false,
  shims: true,
  noExternal: ['@society-erp/shared'],
  external: ['mongodb-memory-server'],
});
