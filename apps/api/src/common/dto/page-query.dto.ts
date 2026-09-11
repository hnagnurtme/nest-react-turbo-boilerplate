import { z } from 'zod';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  SORT_REGEX,
  type SortDirection,
} from '../constants';

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(DEFAULT_PAGE),
  limit: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sort: z.string().regex(SORT_REGEX, 'Expected "field" or "field:asc" / "field:desc"').optional(),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;

export interface ParsedSort {
  field: string;
  direction: SortDirection;
}

/**
 * Splits `field:direction` and rejects fields outside `allowedFields`.
 * Allow-listing is what stops a client ordering by a column it should not even
 * know exists, and keeps the value away from raw SQL.
 */
export function parseSort(
  sort: string | undefined,
  allowedFields: readonly string[],
): ParsedSort | undefined {
  if (!sort) return undefined;

  const [field, direction] = sort.split(':');
  if (!field || !allowedFields.includes(field)) return undefined;

  return { field, direction: direction === 'desc' ? 'desc' : 'asc' };
}

export function toOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}
