import { z } from 'zod';

const csvToArray = (value: string): string[] =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

/**
 * The single source of truth for every environment variable the API reads
 * (doc 02 section 4). `.env.example` must stay in sync with this object; CI
 * checks the two lists match.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    API_PREFIX: z.string().default('api'),

    DATABASE_URL: z.string().url(),
    /**
     * Migrations connect as the owner role; the app connects as app_runtime
     * (NOBYPASSRLS). Two URLs so the running app can never issue DDL.
     */
    DATABASE_MIGRATION_URL: z.string().url(),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

    REDIS_URL: z.string().url(),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('30d'),

    ARGON2_MEMORY_COST: z.coerce.number().int().min(19456).default(19456),

    CORS_ORIGINS: z.string().default('http://localhost:5173').transform(csvToArray),
    /** Origin of the SPA, used for the CSRF `Origin` allowlist check. */
    WEB_ORIGIN: z.string().url().default('http://localhost:5173'),

    COOKIE_DOMAIN: z.string().optional(),
    /**
     * `none` is the correct default because the boilerplate assumes web and API
     * are served from different sites; `Strict` breaks email-link returns
     * (doc 03 section 2.1).
     */
    COOKIE_SAMESITE: z.enum(['lax', 'none']).default('none'),
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    CSRF_COOKIE_NAME: z.string().default('csrf_token'),

    OTEL_SERVICE_NAME: z.string().default('api'),
    // `z.string().url().optional()` only treats a MISSING key as absent — an
    // empty string from a documented-blank .env line (the default, telemetry
    // off) still fails .url() before .optional() gets a chance to skip it.
    // Coerce '' to undefined first so leaving this unset actually works.
    OTEL_EXPORTER_OTLP_ENDPOINT: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().url().optional(),
    ),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;

    if (!env.COOKIE_DOMAIN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_DOMAIN'],
        message: 'Required in production',
      });
    }

    if (!env.COOKIE_SECURE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_SECURE'],
        message: 'Must be true in production: refresh cookies may not travel over plain HTTP',
      });
    }

    if (env.COOKIE_SAMESITE === 'none' && !env.COOKIE_SECURE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_SAMESITE'],
        message: 'SameSite=None requires COOKIE_SECURE=true (browsers reject the cookie otherwise)',
      });
    }

    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message:
          'Must differ from JWT_ACCESS_SECRET so a leaked access secret cannot mint refresh tokens',
      });
    }

    if (env.DATABASE_URL === env.DATABASE_MIGRATION_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message:
          'Must differ from DATABASE_MIGRATION_URL: running the app as the owner role silently disables RLS',
      });
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Parses and validates the environment. On failure it prints one line per bad
 * variable and exits: a half-configured process is worse than no process.
 */
export function validateEnv(raw: NodeJS.ProcessEnv): EnvConfig {
  const result = envSchema.safeParse(raw);

  if (result.success) return result.data;

  const rows = result.error.issues.map((issue) => ({
    variable: issue.path.join('.') || '(root)',
    problem: issue.message,
  }));

  // console.error, not the Nest logger: this runs before the DI container exists.
  console.error('\nInvalid environment configuration:\n');
  const width = Math.max(...rows.map((row) => row.variable.length), 'VARIABLE'.length);
  console.error(`  ${'VARIABLE'.padEnd(width)}  PROBLEM`);
  console.error(`  ${'-'.repeat(width)}  ${'-'.repeat(40)}`);
  for (const row of rows) {
    console.error(`  ${row.variable.padEnd(width)}  ${row.problem}`);
  }
  console.error('\nSee apps/api/.env.example for the full list.\n');

  process.exit(1);
}

let cached: EnvConfig | undefined;

/**
 * Memoised accessor. `validateEnv` is called once at bootstrap; everything else
 * reads the same frozen result instead of re-parsing `process.env`.
 */
export function getEnv(): EnvConfig {
  cached ??= validateEnv(process.env);
  return cached;
}
