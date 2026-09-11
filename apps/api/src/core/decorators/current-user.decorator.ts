import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthContext } from '@repo/shared';

interface RequestWithUser {
  user?: AuthContext;
}

/**
 * Reads the auth context the JWT guard attached. Lives in `core`, not `common`,
 * because it depends on `ExecutionContext` (doc 01 section 2.2).
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthContext | undefined, ctx: ExecutionContext): AuthContext | unknown => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) return undefined;
    return field ? user[field] : user;
  },
);
