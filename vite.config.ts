/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // The Arena preview proxy serves the app from a different host name.
    // Vite must accept that host rather than blocking the request.
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    globals: false,
    setupFiles: ['tests/setup.ts'],
    environmentMatchGlobs: [['tests/ui/**/*.test.tsx', 'jsdom']],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/domain/**', 'src/services/**'],
    },
  },
});
