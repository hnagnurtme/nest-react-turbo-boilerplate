import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // NestJS relies on `emitDecoratorMetadata`, which esbuild (Vitest's default
  // transformer) cannot produce. SWC can, so DI keeps working inside tests.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.integration.spec.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
      // json-summary is what scripts/check-coverage.ts reads for the
      // per-area gate (doc 09 section 5); text keeps local runs readable.
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.integration.spec.ts', 'src/**/index.ts'],
    },
  },
});
