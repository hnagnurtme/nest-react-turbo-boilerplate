declare const brand: unique symbol;

/**
 * Nominal typing on top of structural types. Without it every id is `string`
 * and passing a `UserId` where a `TenantId` belongs compiles happily — the most
 * expensive kind of bug in a multi-tenant system.
 */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type TenantId = Brand<string, 'TenantId'>;
export type UserId = Brand<string, 'UserId'>;
export type ItemId = Brand<string, 'ItemId'>;

export function asTenantId(value: string): TenantId {
  return value as TenantId;
}

export function asUserId(value: string): UserId {
  return value as UserId;
}

export function asItemId(value: string): ItemId {
  return value as ItemId;
}
