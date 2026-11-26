import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5174 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 60000 },
} as any);
