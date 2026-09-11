import { describe, expect, it } from 'vitest';
import { pageQuerySchema, parseSort, toOffset } from '../dto/page-query.dto';
import { MAX_PAGE_SIZE } from '../constants';

describe('pageQuerySchema', () => {
  it('applies defaults for an empty query string', () => {
    expect(pageQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
  });

  it('coerces the numeric strings Express hands over', () => {
    expect(pageQuerySchema.parse({ page: '3', limit: '50' })).toMatchObject({ page: 3, limit: 50 });
  });

  it('rejects a limit above the ceiling rather than clamping it silently', () => {
    expect(pageQuerySchema.safeParse({ limit: MAX_PAGE_SIZE + 1 }).success).toBe(false);
  });

  it.each([{ page: 0 }, { page: -1 }, { limit: 0 }, { sort: 'title:sideways' }])(
    'rejects %o',
    (input) => {
      expect(pageQuerySchema.safeParse(input).success).toBe(false);
    },
  );
});

describe('parseSort', () => {
  const allowed = ['title', 'createdAt'] as const;

  it('defaults to ascending', () => {
    expect(parseSort('title', allowed)).toEqual({ field: 'title', direction: 'asc' });
  });

  it('reads the explicit direction', () => {
    expect(parseSort('createdAt:desc', allowed)).toEqual({
      field: 'createdAt',
      direction: 'desc',
    });
  });

  it('drops fields outside the allow list', () => {
    expect(parseSort('passwordHash', allowed)).toBeUndefined();
    expect(parseSort(undefined, allowed)).toBeUndefined();
  });
});

describe('toOffset', () => {
  it('is zero-based', () => {
    expect(toOffset(1, 20)).toBe(0);
    expect(toOffset(3, 20)).toBe(40);
  });
});
