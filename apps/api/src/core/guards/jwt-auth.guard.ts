import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES, type AuthContext } from '@repo/shared';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { CLS_KEYS, type AppClsStore } from '../database/tenant-context';
import { IS_PUBLIC_KEY } from '../decorators';
import { TokenService } from '../auth/token.service';

interface RequestWithUser extends Request {
  user?: AuthContext;
}

/**
 * Global guard (bound as APP_GUARD in CoreModule): authentication is
 * opt-out via `@Public()`, never opt-in — a route added without a guard
 * decorator is the dangerous default, so the safe behaviour has to be the
 * one that requires no annotation at all.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    @Inject(ClsService) private readonly cls: ClsService<AppClsStore>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

    if (!token) {
      throw new UnauthorizedException({ code: ERROR_CODES.UNAUTHENTICATED });
    }

    let payload: Awaited<ReturnType<TokenService['verifyAccessToken']>>;
    try {
      payload = await this.tokenService.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException({ code: ERROR_CODES.TOKEN_EXPIRED });
    }

    const authContext: AuthContext = {
      userId: payload.sub,
      platformRole: payload.platformRole,
      tenantId: payload.tenantId,
      membershipRole: payload.membershipRole,
    };

    request.user = authContext;
    // From here on, TransactionManager.runInTenantContext() and the
    // @CurrentUser()/@TenantId() decorators all read from CLS, not from
    // `request` directly — a single source of truth for "who is this
    // request" regardless of which layer is asking.
    this.cls.set(CLS_KEYS.userId, authContext.userId);
    if (authContext.tenantId) this.cls.set(CLS_KEYS.tenantId, authContext.tenantId);
    this.cls.set(CLS_KEYS.authContext, authContext);

    return true;
  }
}
