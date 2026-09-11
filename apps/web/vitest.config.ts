import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'jsdom',
    globals: true,
    // src/config/env.ts fails fast on missing VITE_* vars (doc 04 section 5);
    // tests need safe values since no .env is loaded under vitest.
    env: {
      VITE_API_URL: 'http://localhost:3000/api/v1',
      VITE_APP_ENV: 'development',
    },
  },
});
