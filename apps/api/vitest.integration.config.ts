import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.spec.ts'],
    // Containers take a while to pull and boot on a cold CI machine.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Integration tests share one Postgres container and assert on rows;
    // running files in parallel would make them see each other's writes.
    fileParallelism: false,
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      // Separate directory from the unit run (vitest.config.ts) — the two
      // summaries are merged by scripts/check-coverage.ts, since code like
      // TransactionManager only ever executes under a real database and
      // would otherwise always read as 0% (doc 09 section 5).
      reportsDirectory: 'coverage/integration',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.integration.spec.ts', 'src/**/index.ts'],
    },
  },
});
