/**
 * `pnpm setup` — one-shot initialiser for a freshly cloned copy of the boilerplate.
 *
 * Asks for a project name, generates every secret the stack needs, and materialises
 * `.env` files from their `.env.example` templates. Safe to re-run: an existing
 * `.env` is never touched, so re-running only fills in what is missing.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const REPO_ROOT = path.resolve(__dirname, '..');

const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** 48 bytes → 96 hex chars, comfortably above the 64-char floor doc 00 §6 asks for. */
const newSecret = (): string => randomBytes(48).toString('hex');

interface Secrets {
  readonly projectName: string;
  /** Postgres identifiers may not contain `-` without quoting, so the DB name is snake_case. */
  readonly dbName: string;
  readonly values: Record<string, string>;
  /** role name → password, used to rewrite credentials embedded in `*_URL` values. */
  readonly rolePasswords: Record<string, string>;
}

function buildSecrets(projectName: string): Secrets {
  const ownerPassword = newSecret();
  const runtimePassword = newSecret();
  const readonlyPassword = newSecret();

  return {
    projectName,
    dbName: projectName.replace(/-/g, '_'),
    values: {
      JWT_ACCESS_SECRET: newSecret(),
      JWT_REFRESH_SECRET: newSecret(),
      INTERNAL_HMAC_SECRET: newSecret(),
      COOKIE_SECRET: newSecret(),
      POSTGRES_PASSWORD: ownerPassword,
      APP_OWNER_PASSWORD: ownerPassword,
      APP_RUNTIME_PASSWORD: runtimePassword,
      APP_READONLY_PASSWORD: readonlyPassword,
    },
    rolePasswords: {
      postgres: ownerPassword,
      app_owner: ownerPassword,
      app_runtime: runtimePassword,
      app_readonly: readonlyPassword,
    },
  };
}

// ── .env generation ──────────────────────────────────────────────────────────

const POSTGRES_URL = /^(postgres(?:ql)?:\/\/)([^:/@]+)(?::([^@]*))?@([^/]+)\/([^?]*)(.*)$/;

/**
 * Rewrites credentials inside a Postgres connection string so the URL stays
 * consistent with the role passwords written elsewhere in the same file.
 * A URL whose database name mentions "test" is left alone — that is a fixture.
 */
function rewritePostgresUrl(value: string, secrets: Secrets): string {
  const match = POSTGRES_URL.exec(value.trim());
  if (!match) return value;

  const [, scheme, user, , hostPort, database, tail] = match;
  if (!scheme || !user || !hostPort || database === undefined) return value;

  const password = secrets.rolePasswords[user];
  if (password === undefined) return value;
  if (database.includes('test')) return value;

  return `${scheme}${user}:${password}@${hostPort}/${secrets.dbName}${tail ?? ''}`;
}

function renderEnv(template: string, secrets: Secrets): string {
  return template
    .split('\n')
    .map((line) => {
      const match = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
      if (!match) return line; // comment, blank line, or continuation — keep verbatim

      const [, indent, key, rawValue] = match;
      if (indent === undefined || key === undefined || rawValue === undefined) return line;

      const generated = secrets.values[key];
      if (generated !== undefined) return `${indent}${key}=${generated}`;
      if (key === 'POSTGRES_DB' || key === 'DB_NAME') return `${indent}${key}=${secrets.dbName}`;
      if (key.endsWith('_URL') || key === 'DATABASE_URL') {
        return `${indent}${key}=${rewritePostgresUrl(rawValue, secrets)}`;
      }
      return line;
    })
    .join('\n');
}

interface EnvResult {
  readonly file: string;
  readonly status: 'created' | 'skipped' | 'missing-template';
}

function materialiseEnv(dir: string, secrets: Secrets): EnvResult | null {
  const template = path.join(dir, '.env.example');
  const target = path.join(dir, '.env');
  const label = path.relative(REPO_ROOT, target) || '.env';

  if (!existsSync(template)) return null;
  if (existsSync(target)) return { file: label, status: 'skipped' };

  writeFileSync(target, renderEnv(readFileSync(template, 'utf8'), secrets), 'utf8');
  return { file: label, status: 'created' };
}

// ── project name propagation ─────────────────────────────────────────────────

function updateRootPackageJson(projectName: string): boolean {
  const file = path.join(REPO_ROOT, 'package.json');
  if (!existsSync(file)) return false;

  const source = readFileSync(file, 'utf8');
  // Rewritten textually rather than via JSON.parse/stringify so key order,
  // indentation and trailing newline stay exactly as Prettier left them.
  const next = source.replace(/("name"\s*:\s*)"[^"]*"/, `$1"${projectName}"`);
  if (next === source) return false;

  writeFileSync(file, next, 'utf8');
  return true;
}

function updateComposeFile(secrets: Secrets): boolean {
  const file = path.join(REPO_ROOT, 'docker-compose.yml');
  if (!existsSync(file)) return false;

  const source = readFileSync(file, 'utf8');
  const next = source
    .replace(/(container_name:\s*)\S+?_(postgres|redis|api|web)\b/g, `$1${secrets.dbName}_$2`)
    .replace(/\$\{POSTGRES_DB:-[^}]*\}/g, `\${POSTGRES_DB:-${secrets.dbName}}`);
  if (next === source) return false;

  writeFileSync(file, next, 'utf8');
  return true;
}

// ── prompt ───────────────────────────────────────────────────────────────────

function suggestedName(): string {
  const fallback = path
    .basename(REPO_ROOT)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  return KEBAB_CASE.test(fallback) ? fallback : 'my-project';
}

async function askProjectName(rl: readline.Interface): Promise<string> {
  const suggestion = suggestedName();

  // A question asked after stdin has ended never settles, which would leave the
  // script hanging (or exiting silently) instead of saying what went wrong.
  let answered = false;
  const onEof = new Promise<string>((_resolve, reject) => {
    rl.once('close', () => {
      if (!answered) {
        reject(
          new Error(
            'stdin ended before a valid project name was given. Pass it directly instead: pnpm setup <name>',
          ),
        );
      }
    });
  });
  onEof.catch(() => undefined); // keep the rejection handled once we no longer race it

  try {
    for (;;) {
      const raw = await Promise.race([rl.question(`Project name [${suggestion}]: `), onEof]);
      const candidate = raw.trim() === '' ? suggestion : raw.trim();
      if (KEBAB_CASE.test(candidate)) return candidate;
      console.error(
        `  ✗ "${candidate}" is not kebab-case (lowercase letters, digits and single dashes).`,
      );
    }
  } finally {
    answered = true;
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n  Project setup\n  ─────────────\n');

  // `pnpm setup <name>` skips the prompt, which is what makes the script usable
  // from a provisioning script or a test without a TTY.
  const fromArgv = process.argv[2]?.trim();
  if (fromArgv !== undefined && fromArgv !== '' && !KEBAB_CASE.test(fromArgv)) {
    throw new Error(
      `"${fromArgv}" is not kebab-case (lowercase letters, digits and single dashes).`,
    );
  }

  let projectName: string;
  if (fromArgv !== undefined && fromArgv !== '') {
    projectName = fromArgv;
    console.log(`Project name: ${projectName}`);
  } else {
    const rl = readline.createInterface({ input, output });
    try {
      projectName = await askProjectName(rl);
    } finally {
      rl.close();
    }
  }

  const secrets = buildSecrets(projectName);
  console.log('');

  if (updateRootPackageJson(projectName))
    console.log(`  ✓ package.json          name → ${projectName}`);
  else console.log('  · package.json          unchanged');

  if (updateComposeFile(secrets))
    console.log(`  ✓ docker-compose.yml    containers + POSTGRES_DB → ${secrets.dbName}`);
  else console.log('  · docker-compose.yml    unchanged (not found, or already matching)');

  // Root first, then every app that ships a template. `apps/` may not exist yet.
  const appsDir = path.join(REPO_ROOT, 'apps');
  const dirs = [REPO_ROOT];
  if (existsSync(appsDir)) {
    for (const entry of readdirSync(appsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.push(path.join(appsDir, entry.name));
    }
  }

  const results = dirs
    .map((dir) => materialiseEnv(dir, secrets))
    .filter((r): r is EnvResult => r !== null);

  if (results.length === 0) {
    console.log('  ! no .env.example found anywhere — nothing to generate yet.');
  }
  for (const result of results) {
    if (result.status === 'created')
      console.log(`  ✓ ${result.file.padEnd(22)}created with fresh secrets`);
    else console.log(`  · ${result.file.padEnd(22)}already exists — left untouched`);
  }

  console.log(`
  Still yours to do
  ─────────────────
  1. Database roles — infra/postgres/init/01-roles.sql still creates app_runtime and
     app_readonly with their development default passwords. Before any deployment,
     set them to the values now in your .env files and re-create the volume.
  2. Domains — set the web origin and the API origin (APP_URL / API_URL / VITE_API_URL).
     Web and API are cross-site, so cookies need SameSite=None; Secure.
  3. CORS — list the exact web origins in CORS_ORIGINS. Never "*" together with credentials.
  4. Observability — point OTEL_EXPORTER_OTLP_ENDPOINT at your collector, or leave traces off.
  5. TLS — terminate HTTPS in front of both containers. Secure cookies are dropped over http.
  6. Re-run this script any time; it will only fill in .env files that do not exist yet.

  Next: docker compose up -d  →  pnpm db:migrate  →  pnpm dev
`);
}

main().catch((error: unknown) => {
  console.error('\nSetup failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
