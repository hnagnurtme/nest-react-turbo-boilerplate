import { defineConfig } from 'orval';

/**
 * Generates typed fetchers + React Query hooks from the OpenAPI spec that
 * `apps/api` exports (doc 01 section 2.4). The spec and the generated code
 * are both committed to git: the web app must be able to build without ever
 * having to boot the backend.
 *
 * Run `pnpm api:contract` from the repo root, which regenerates
 * openapi.json first, then this. CI fails the build if `git diff` is
 * non-empty after regenerating (doc 06 section 3).
 */
export default defineConfig({
  api: {
    input: './openapi.json',
    output: {
      target: 'src/generated/endpoints.ts',
      schemas: 'src/generated/models',
      client: 'react-query',
      mode: 'tags',
      override: {
        mutator: {
          path: 'src/http-mutator.ts',
          name: 'apiMutator',
        },
      },
    },
  },
});
