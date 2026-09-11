import { createParamDecorator, ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { ERROR_CODES } from '@repo/shared';
import type { AuthContext } from '@repo/shared';

interface RequestWithUser {
  user?: AuthContext;
}

/**
 * The tenant of the current request, taken from the verified JWT claim.
 *
 * Never from a client-supplied header: a header would let any caller choose the
 * tenant whose rows RLS then hands over.
 */
export const TenantId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const tenantId = ctx.switchToHttp().getRequest<RequestWithUser>().user?.tenantId;
  if (!tenantId) {
    throw new ForbiddenException({ code: ERROR_CODES.TENANT_CONTEXT_REQUIRED });
  }
  return tenantId;
});
