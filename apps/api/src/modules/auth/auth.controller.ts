import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ERROR_CODES } from '@repo/shared';
import type { Request, Response } from 'express';
import { CLIENT_TYPE_HEADER } from '../../common/constants';
import { AppConfig } from '../../config';
import { CurrentUser, NoEnvelope, Public } from '../../core/decorators';
import { AuthService } from './auth.service';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './cookie.util';
import { loginSchema, switchTenantSchema, type LoginDto, type SwitchTenantDto } from './dto';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';

interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

function requestMeta(req: Request): RequestMeta {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

/** `x-client-type: mobile` gets the refresh token in the body instead of a cookie (doc 03 section 1.2). */
function isMobileClient(req: Request): boolean {
  return req.header(CLIENT_TYPE_HEADER) === 'mobile';
}

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  @Post('login')
  @Public()
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto.email, dto.password, requestMeta(req));

    if (isMobileClient(req)) {
      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
        memberships: result.memberships,
      };
    }

    setRefreshCookie(res, this.config, result.refreshToken, this.config.apiPrefix);
    return {
      accessToken: result.accessToken,
      csrfToken: result.csrfToken,
      user: result.user,
      memberships: result.memberships,
    };
  }

  @Post('refresh')
  @Public()
  async refresh(
    @Body() body: { refreshToken?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const presented = isMobileClient(req)
      ? body.refreshToken
      : readRefreshCookie(req.cookies as Record<string, string> | undefined);

    if (!presented) throw new UnauthorizedException({ code: ERROR_CODES.UNAUTHENTICATED });

    const result = await this.auth.refresh(presented, requestMeta(req));

    if (isMobileClient(req)) {
      return { accessToken: result.accessToken, refreshToken: result.refreshToken };
    }

    setRefreshCookie(res, this.config, result.refreshToken, this.config.apiPrefix);
    return { accessToken: result.accessToken, csrfToken: result.csrfToken };
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  @NoEnvelope()
  async logout(
    @Body() body: { refreshToken?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const presented = isMobileClient(req)
      ? body.refreshToken
      : readRefreshCookie(req.cookies as Record<string, string> | undefined);

    if (presented) await this.auth.logout(presented);
    if (!isMobileClient(req)) {
      clearRefreshCookie(res, this.config, this.config.apiPrefix);
    }
  }

  @Get('me')
  me(@CurrentUser('userId') userId: string) {
    return this.auth.me(userId);
  }

  @Post('switch-tenant')
  switchTenant(
    @CurrentUser('userId') userId: string,
    @Body(new ZodValidationPipe(switchTenantSchema)) dto: SwitchTenantDto,
  ) {
    return this.auth.switchTenant(userId, dto.tenantId);
  }
}
