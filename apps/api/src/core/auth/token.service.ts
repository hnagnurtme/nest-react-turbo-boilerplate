import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { PlatformRole } from '@repo/shared';
import { parseDuration } from '../../common/utils';
import { AppConfig } from '../../config';

/**
 * Claims signed into the access token. Deliberately thin (doc 03 section 4):
 * no user profile data, no permission list — just enough to reconstruct an
 * `AuthContext` and let RLS/CASL do the rest from there.
 */
export interface AccessTokenPayload {
  sub: string;
  platformRole: PlatformRole;
  tenantId?: string;
  membershipRole?: string;
  jti: string;
}

/**
 * Signs and verifies ONLY the access token. The refresh token is
 * deliberately not a JWT — doc 03 section 3's rotation design needs a
 * database lookup on every refresh anyway (to detect reuse), so a
 * self-verifying token would add complexity without adding safety. See
 * modules/auth/auth.service.ts for how refresh tokens are generated,
 * hashed and stored.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {}

  signAccessToken(payload: Omit<AccessTokenPayload, 'jti'>): string {
    return this.jwt.sign(
      { ...payload, jti: randomUUID() },
      {
        secret: this.config.jwt.accessSecret,
        // jsonwebtoken's `expiresIn` takes seconds when given a number; the
        // env schema's duration strings ("15m") aren't its branded string
        // type, so they're converted here instead of relying on that parser.
        expiresIn: Math.floor(parseDuration(this.config.jwt.accessTtl) / 1000),
      },
    );
  }

  verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token, {
      secret: this.config.jwt.accessSecret,
    });
  }
}
