import { describe, expect, it, vi } from 'vitest';

// A real render test needs @repo/api-contract + @repo/ui fully built, which
// other packages in this monorepo are still receiving their first commits
// for. This smoke test only proves the module graph resolves and the
// component is a function, catching import/path mistakes cheaply in CI
// without needing a running backend.
describe('ItemsPage', () => {
  it('is a valid React component', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { ItemsPage } = await import('../pages/items-page');
    expect(typeof ItemsPage).toBe('function');
  });
});
