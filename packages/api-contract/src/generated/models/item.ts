/**
 * PLACEHOLDER — hand-authored until `pnpm api:contract` regenerates this
 * directory from apps/api/openapi.json (doc 01 section 2.4). Shape mirrors
 * the `items` reference slice exactly so the real codegen diff stays small.
 */
export type ItemStatus = 'ACTIVE' | 'ARCHIVED';

export interface Item {
  id: string;
  tenantId: string;
  title: string;
  description: string | null;
  status: ItemStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateItemDto {
  title: string;
  description?: string;
}

export interface UpdateItemDto {
  title?: string;
  description?: string;
  status?: ItemStatus;
}

export interface ListItemsParams {
  page?: number;
  limit?: number;
  sort?: string;
  // Index signature keeps this structurally assignable to the generic
  // Record<string, unknown> that ApiRequestConfig.params expects.
  [key: string]: unknown;
}
