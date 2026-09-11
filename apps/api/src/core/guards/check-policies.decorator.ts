import { SetMetadata } from '@nestjs/common';
import type { AppAbility } from '@repo/shared';

export const CHECK_POLICIES_KEY = 'checkPolicies';

export type PolicyHandler = (ability: AppAbility) => boolean;

/**
 * `@CheckPolicies((ability) => ability.can('create', 'Item'))` (doc 03
 * section 3.1). Only checks the action/subject TYPE — a per-record check
 * (e.g. "this specific item") still has to happen in the handler after the
 * record is loaded, because the ability has no record to test against yet.
 */
export const CheckPolicies = (...handlers: PolicyHandler[]): MethodDecorator & ClassDecorator =>
  SetMetadata(CHECK_POLICIES_KEY, handlers);
