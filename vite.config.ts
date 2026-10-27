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
  build: {
    // Vendor chunks stay stable across app deploys, so a returning user
    // re-downloads only the app code. Route chunks are created in AppRoutes.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          ionic: ['@ionic/react', 'ionicons'],
          supabase: ['@supabase/supabase-js'],
          data: ['@tanstack/react-query', 'zod', 'date-fns', 'react-hook-form', '@hookform/resolvers'],
        },
      },
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
