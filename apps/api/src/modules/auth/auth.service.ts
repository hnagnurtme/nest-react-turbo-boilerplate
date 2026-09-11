import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { and, eq, isNull } from 'drizzle-orm';
import { addDuration, isExpired } from '../../common/utils';
import { AppConfig } from '../../config';
import { TransactionManager } from '../../core/database/transaction.manager';
import { memberships, refreshTokens, tenants, users, type User } from '../../core/database/schema';
import {
  InvalidCredentialsError,
  RefreshTokenInvalidError,
  ResourceNotFoundError,
  TenantAccessDeniedError,
  TokenReuseDetectedError,
} from '../../core/errors';
import { deriveCsrfToken } from '../../core/auth/csrf-token.util';
import { TokenService } from '../../core/auth/token.service';

/**
 * Argon2id hash of an unused password, verified against on every login where
 * the email does not exist. Keeps the response time for "no such user" and
 * "wrong password" statistically indistinguishable (doc 03 section 4) — an
 * early return on "user not found" would let an attacker enumerate accounts
 * by measuring latency.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=4$6UjpowIn71eHyC7gwGrCFg$lsKPfvRYeFy4Qh9GO8j2nqWjYyQB8flnV1UFTrVbA/M';

export interface SessionMembership {
  id: string;
  tenantId: string;
  role: string;
  status: string;
  tenant: { id: string; name: string; slug: string };
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  /**
   * A synchronizer CSRF token, not a secret in its own right: HMAC(refresh
   * secret, sha256(refreshToken)). Delivered in the response BODY rather
   * than as a JS-readable cookie because `document.cookie` is strictly
   * domain-isolated — a cookie set by api.io is invisible to JS on app.com
   * in the cross-site deployment this project is configured for (doc 03
   * section 2.2's double-submit description assumes a same-site cookie;
   * this is the cross-site-safe equivalent). The frontend keeps it in
   * memory next to the access token and echoes it as x-csrf-token;
   * CsrfMiddleware recomputes it from the httpOnly refresh cookie already
   * present on the request, so no extra server-side storage is needed.
   */
  csrfToken: string;
}

export interface LoginResult extends IssuedTokens {
  user: Pick<User, 'id' | 'email' | 'platformRole'>;
  memberships: SessionMembership[];
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly tx: TransactionManager,
    private readonly tokens: TokenService,
    private readonly config: AppConfig,
  ) {}

  /**
   * `memberships` carries `tenant_id` and is RLS-protected like every other
   * tenant-scoped table — querying it plainly with no `app.tenant_id` set
   * returns zero rows, not an error. `runAsUser` sets `app.user_id` instead,
   * which the memberships policy's second USING clause matches (see the
   * migration): a user can always read their own membership rows.
   */
  private async loadMemberships(userId: string): Promise<SessionMembership[]> {
    return this.tx.runAsUser(userId, (tx) =>
      tx
        .select({
          id: memberships.id,
          tenantId: memberships.tenantId,
          role: memberships.role,
          status: memberships.status,
          tenant: { id: tenants.id, name: tenants.name, slug: tenants.slug },
        })
        .from(memberships)
        .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
        .where(and(eq(memberships.userId, userId), eq(memberships.status, 'ACTIVE'))),
    );
  }

  /** Mints a fresh access token, defaulting to the user's first active tenant. */
  private issueAccessToken(
    user: Pick<User, 'id' | 'platformRole'>,
    memberships: SessionMembership[],
  ): string {
    const active = memberships[0];
    return this.tokens.signAccessToken({
      sub: user.id,
      platformRole: user.platformRole,
      tenantId: active?.tenantId,
      membershipRole: active?.role,
    });
  }

  /**
   * Starts a new rotation family (one per login). The raw token is returned
   * to the caller and never stored — only its hash is, so a database leak
   * does not hand over live sessions (doc 03 section 3).
   */
  private async issueRefreshToken(
    userId: string,
    meta: { userAgent?: string; ip?: string },
  ): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    await this.tx.raw.insert(refreshTokens).values({
      userId,
      familyId: randomUUID(),
      tokenHash: sha256(raw),
      expiresAt: addDuration(new Date(), this.config.jwt.refreshTtl),
      userAgent: meta.userAgent,
      ip: meta.ip,
    });
    return raw;
  }

  async login(
    email: string,
    password: string,
    meta: { userAgent?: string; ip?: string },
  ): Promise<LoginResult> {
    const [user] = await this.tx.raw.select().from(users).where(eq(users.email, email)).limit(1);

    const valid = await argon2
      .verify(user?.passwordHash ?? DUMMY_HASH, password)
      .catch(() => false);
    if (!user || !valid) throw new InvalidCredentialsError();

    const userMemberships = await this.loadMemberships(user.id);
    const accessToken = this.issueAccessToken(user, userMemberships);
    const refreshToken = await this.issueRefreshToken(user.id, meta);

    return {
      accessToken,
      refreshToken,
      csrfToken: deriveCsrfToken(this.config.jwt.refreshSecret, refreshToken),
      user: { id: user.id, email: user.email, platformRole: user.platformRole },
      memberships: userMemberships,
    };
  }

  /**
   * Rotation with reuse detection (doc 03 section 3): a token is valid for
   * exactly one refresh. Presenting one that was already rotated revokes the
   * whole family — it means either the token leaked, or the legitimate
   * client retried a request whose response never arrived, and in both
   * cases the safe move is to force everyone in that family to log in again.
   */
  async refresh(
    presentedToken: string,
    meta: { userAgent?: string; ip?: string },
  ): Promise<IssuedTokens> {
    const tokenHash = sha256(presentedToken);
    const [existing] = await this.tx.raw
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);

    if (!existing) throw new RefreshTokenInvalidError();

    if (existing.revokedAt) {
      await this.tx.raw
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.familyId, existing.familyId), isNull(refreshTokens.revokedAt)));
      this.logger.warn(
        { userId: existing.userId, familyId: existing.familyId },
        'Refresh token reuse detected',
      );
      throw new TokenReuseDetectedError();
    }

    if (isExpired(existing.expiresAt)) throw new RefreshTokenInvalidError();

    const [user] = await this.tx.raw
      .select()
      .from(users)
      .where(eq(users.id, existing.userId))
      .limit(1);
    if (!user) throw new RefreshTokenInvalidError();

    const nextRaw = randomBytes(32).toString('hex');
    const [nextRow] = await this.tx.raw
      .insert(refreshTokens)
      .values({
        userId: user.id,
        familyId: existing.familyId,
        tokenHash: sha256(nextRaw),
        expiresAt: addDuration(new Date(), this.config.jwt.refreshTtl),
        userAgent: meta.userAgent,
        ip: meta.ip,
      })
      .returning({ id: refreshTokens.id });

    await this.tx.raw
      .update(refreshTokens)
      .set({ revokedAt: new Date(), replacedBy: nextRow?.id })
      .where(eq(refreshTokens.id, existing.id));

    // Simplification worth knowing: this always re-defaults to the user's
    // first active membership rather than remembering which tenant the
    // previous access token had selected. A production fork of this
    // boilerplate that finds this UX-relevant should add a tenant_id column
    // to refresh_tokens, set by switch-tenant, and read it back here.
    const userMemberships = await this.loadMemberships(user.id);
    const accessToken = this.issueAccessToken(user, userMemberships);

    return {
      accessToken,
      refreshToken: nextRaw,
      csrfToken: deriveCsrfToken(this.config.jwt.refreshSecret, nextRaw),
    };
  }

  /** Revokes only the presented token's own family, not every session the user has. */
  async logout(presentedToken: string): Promise<void> {
    const tokenHash = sha256(presentedToken);
    const [existing] = await this.tx.raw
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);
    if (!existing) return;

    await this.tx.raw
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, existing.familyId), isNull(refreshTokens.revokedAt)));
  }

  async me(userId: string): Promise<{
    user: Pick<User, 'id' | 'email' | 'platformRole'>;
    memberships: SessionMembership[];
  }> {
    const [user] = await this.tx.raw.select().from(users).where(eq(users.id, userId)).limit(1);
    // Should not happen in practice: userId comes from a verified JWT. If it
    // does, the user was deleted after the token was issued.
    if (!user) throw new ResourceNotFoundError('User', userId);
    return {
      user: { id: user.id, email: user.email, platformRole: user.platformRole },
      memberships: await this.loadMemberships(userId),
    };
  }

  async switchTenant(userId: string, tenantId: string): Promise<{ accessToken: string }> {
    // Same reasoning as loadMemberships: this is a self-lookup by user, not
    // by tenant, until we know the user actually belongs to the target one.
    const [membership] = await this.tx.runAsUser(userId, (tx) =>
      tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.userId, userId),
            eq(memberships.tenantId, tenantId),
            eq(memberships.status, 'ACTIVE'),
          ),
        )
        .limit(1),
    );
    if (!membership) throw new TenantAccessDeniedError();

    const [user] = await this.tx.raw.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new ResourceNotFoundError('User', userId);

    const accessToken = this.tokens.signAccessToken({
      sub: user.id,
      platformRole: user.platformRole,
      tenantId: membership.tenantId,
      membershipRole: membership.role,
    });
    return { accessToken };
  }
}
