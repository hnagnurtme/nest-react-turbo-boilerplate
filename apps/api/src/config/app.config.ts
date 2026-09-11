import { Inject, Injectable, Optional } from '@nestjs/common';
import { getEnv, type EnvConfig } from './env.schema';

/** Injection token used only to hand a fixture environment to tests. */
export const ENV_CONFIG = 'ENV_CONFIG';

/**
 * Typed façade over the validated environment. Injecting this instead of
 * reading `process.env` keeps the variable list discoverable and means a typo
 * is a compile error rather than an `undefined` at 3am.
 */
@Injectable()
export class AppConfig {
  private readonly env: EnvConfig;

  // @Optional so Nest does not try to resolve a plain object as a provider;
  // in production nothing supplies ENV_CONFIG and the memoised env is used.
  constructor(@Optional() @Inject(ENV_CONFIG) env?: EnvConfig) {
    this.env = env ?? getEnv();
  }

  get nodeEnv(): EnvConfig['NODE_ENV'] {
    return this.env.NODE_ENV;
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  get port(): number {
    return this.env.PORT;
  }

  get apiPrefix(): string {
    return this.env.API_PREFIX;
  }

  get logLevel(): EnvConfig['LOG_LEVEL'] {
    return this.env.LOG_LEVEL;
  }

  get database(): { url: string; migrationUrl: string; poolMax: number } {
    return {
      url: this.env.DATABASE_URL,
      migrationUrl: this.env.DATABASE_MIGRATION_URL,
      poolMax: this.env.DATABASE_POOL_MAX,
    };
  }

  get redisUrl(): string {
    return this.env.REDIS_URL;
  }

  get jwt(): {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  } {
    return {
      accessSecret: this.env.JWT_ACCESS_SECRET,
      refreshSecret: this.env.JWT_REFRESH_SECRET,
      accessTtl: this.env.JWT_ACCESS_TTL,
      refreshTtl: this.env.JWT_REFRESH_TTL,
    };
  }

  get argon2MemoryCost(): number {
    return this.env.ARGON2_MEMORY_COST;
  }

  get corsOrigins(): string[] {
    return this.env.CORS_ORIGINS;
  }

  get webOrigin(): string {
    return this.env.WEB_ORIGIN;
  }

  get cookie(): {
    domain: string | undefined;
    sameSite: 'lax' | 'none';
    secure: boolean;
    csrfName: string;
  } {
    return {
      domain: this.env.COOKIE_DOMAIN,
      sameSite: this.env.COOKIE_SAMESITE,
      secure: this.env.COOKIE_SECURE,
      csrfName: this.env.CSRF_COOKIE_NAME,
    };
  }

  get telemetry(): { serviceName: string; otlpEndpoint: string | undefined } {
    return {
      serviceName: this.env.OTEL_SERVICE_NAME,
      otlpEndpoint: this.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    };
  }
}
