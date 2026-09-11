import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { defineAbilityFor, type AuthContext } from '@repo/shared';
import { ForbiddenActionError } from '../errors';
import { CHECK_POLICIES_KEY, type PolicyHandler } from './check-policies.decorator';

interface RequestWithUser {
  user?: AuthContext;
}

/**
 * Applied per-controller with `@UseGuards(JwtAuthGuard, PoliciesGuard)` (doc
 * 03 section 3.1), not globally — most routes need JwtAuthGuard, only some
 * need an extra ability check on top. A route with no @CheckPolicies
 * metadata passes through: authentication already happened in JwtAuthGuard.
 */
@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const handlers = this.reflector.getAllAndOverride<PolicyHandler[]>(CHECK_POLICIES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!handlers || handlers.length === 0) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const ability = defineAbilityFor(request.user ?? null);

    const allowed = handlers.every((handler) => handler(ability));
    if (!allowed) {
      throw new ForbiddenActionError(context.getHandler().name, context.getClass().name);
    }
    return true;
  }
}
