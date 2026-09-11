/**
 * `pnpm gen:module <name>` — clone the `items` reference slice (doc 09 §6).
 *
 * The checklist in doc 09 §6 has seven steps and exactly one of them leaks tenant
 * data when skipped: writing the RLS policy. A generator exists so that step is
 * never the one that gets forgotten — the migration stub it emits already carries
 * ENABLE + FORCE + the policy, and the RLS integration test is copied along with
 * the slice. The steps a script cannot do safely are printed at the end.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
const API_ROOT = path.join(REPO_ROOT, 'apps/api');
const SOURCE_MODULE = path.join(API_ROOT, 'src/modules/items');
const MODULES_DIR = path.join(API_ROOT, 'src/modules');
const TEST_DIR = path.join(API_ROOT, 'test');
const DRIZZLE_DIR = path.join(API_ROOT, 'drizzle');

const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

// ── naming ───────────────────────────────────────────────────────────────────

function singulariseWord(word: string): string {
  if (word.length > 3 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(?:s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('ss')) return word;
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function singularise(kebab: string): string {
  const parts = kebab.split('-');
  const last = parts.pop();
  if (last === undefined) return kebab;
  return [...parts, singulariseWord(last)].join('-');
}

const capitalise = (word: string): string =>
  word === '' ? word : word[0]!.toUpperCase() + word.slice(1);
const toCamel = (kebab: string): string =>
  kebab
    .split('-')
    .map((w, i) => (i === 0 ? w : capitalise(w)))
    .join('');
const toPascal = (kebab: string): string => kebab.split('-').map(capitalise).join('');
const toSnake = (kebab: string): string => kebab.replace(/-/g, '_');
const toConst = (kebab: string): string => toSnake(kebab).toUpperCase();

interface Names {
  readonly pluralKebab: string;
  readonly singularKebab: string;
  readonly pluralCamel: string;
  readonly singularCamel: string;
  readonly pluralPascal: string;
  readonly singularPascal: string;
  readonly pluralSnake: string;
  readonly singularSnake: string;
  readonly pluralConst: string;
  readonly singularConst: string;
}

function deriveNames(pluralKebab: string): Names {
  const singularKebab = singularise(pluralKebab);
  return {
    pluralKebab,
    singularKebab,
    pluralCamel: toCamel(pluralKebab),
    singularCamel: toCamel(singularKebab),
    pluralPascal: toPascal(pluralKebab),
    singularPascal: toPascal(singularKebab),
    pluralSnake: toSnake(pluralKebab),
    singularSnake: toSnake(singularKebab),
    pluralConst: toConst(pluralKebab),
    singularConst: toConst(singularKebab),
  };
}

// ── rewriting ────────────────────────────────────────────────────────────────

type Style = 'code' | 'sql' | 'path';

/**
 * Matches either a quoted relative import specifier or one of the `item` tokens.
 * The specifier alternative comes first so `'./items.service'` is rewritten with
 * kebab-case (matching the renamed file) rather than camelCase like an identifier.
 */
const TOKENS = /(['"`])(\.{1,2}\/[^'"`\n]*)\1|ITEMS|ITEM|Items|Item|items|item/g;

function replaceToken(token: string, names: Names, style: Style): string {
  switch (token) {
    case 'ITEMS':
      return names.pluralConst;
    case 'ITEM':
      return names.singularConst;
    case 'Items':
      return names.pluralPascal;
    case 'Item':
      return names.singularPascal;
    case 'items':
      return style === 'code'
        ? names.pluralCamel
        : style === 'sql'
          ? names.pluralSnake
          : names.pluralKebab;
    case 'item':
      return style === 'code'
        ? names.singularCamel
        : style === 'sql'
          ? names.singularSnake
          : names.singularKebab;
    default:
      return token;
  }
}

function rewrite(source: string, names: Names, style: Style): string {
  return source.replace(TOKENS, (match, quote?: string, specifier?: string) => {
    if (quote !== undefined && specifier !== undefined) {
      return `${quote}${rewrite(specifier, names, 'path')}${quote}`;
    }
    return replaceToken(match, names, style);
  });
}

const styleFor = (file: string): Style => (file.endsWith('.sql') ? 'sql' : 'code');
const rewriteFilename = (name: string, names: Names): string => rewrite(name, names, 'path');

function copyTree(from: string, to: string, names: Names, copied: string[]): void {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const target = path.join(to, rewriteFilename(entry.name, names));
    const source = path.join(from, entry.name);
    if (entry.isDirectory()) {
      copyTree(source, target, names, copied);
    } else if (entry.isFile()) {
      writeFileSync(
        target,
        rewrite(readFileSync(source, 'utf8'), names, styleFor(entry.name)),
        'utf8',
      );
      copied.push(path.relative(REPO_ROOT, target));
    }
  }
}

/** Copies every test file whose name mentions `items`, keeping its position in the tree. */
function copyMatchingTests(dir: string, names: Names, copied: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const source = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      copyMatchingTests(source, names, copied);
      continue;
    }
    if (!entry.isFile() || !entry.name.includes('item')) continue;
    const target = path.join(dir, rewriteFilename(entry.name, names));
    if (existsSync(target)) continue;
    writeFileSync(
      target,
      rewrite(readFileSync(source, 'utf8'), names, styleFor(entry.name)),
      'utf8',
    );
    copied.push(path.relative(REPO_ROOT, target));
  }
}

// ── migration stub ───────────────────────────────────────────────────────────

function timestamp(): string {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

function migrationSql(names: Names): string {
  const table = names.pluralSnake;
  const policy = `${table}_tenant_isolation`;
  return `-- RLS migration stub for "${table}", emitted by pnpm gen:module.
--
-- drizzle-kit generates the CREATE TABLE for you from the schema file; it does NOT
-- generate row-level security. Fold the three blocks below into the migration that
-- drizzle-kit produces (or keep this file and add it to drizzle/meta/_journal.json),
-- and do it in the SAME migration as the CREATE TABLE. A table that exists for even
-- one deploy without FORCE ROW LEVEL SECURITY is a silent cross-tenant read.

SET lock_timeout = '5s';

-- 1. Adjust to match apps/api/src/modules/${names.pluralKebab} — tenant_id is the part that matters.
CREATE TABLE IF NOT EXISTS "${table}" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"  uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "${table}_tenant_id_idx" ON "${table}" ("tenant_id");

-- 2. ENABLE turns the policy on for everyone except the table owner;
--    FORCE removes that exemption, so migrations run as the owner are covered too.
ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;

-- 3. NULLIF makes a missing app.tenant_id compare as NULL, which matches no row:
--    fail-closed. Without it, an unset GUC would raise and leak through error paths.
DROP POLICY IF EXISTS "${policy}" ON "${table}";
CREATE POLICY "${policy}" ON "${table}"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "${table}" TO app_runtime;
GRANT SELECT ON "${table}" TO app_readonly;
`;
}

function rlsTestTemplate(names: Names): string {
  return `import { describe, expect, it } from 'vitest';

/**
 * Tenant isolation for "${names.pluralSnake}" — emitted by pnpm gen:module because the
 * items reference slice had no RLS test to copy. Wire it to the same integration
 * harness the rest of apps/api/test uses (doc 09 §4: migrate as app_owner, connect
 * as app_runtime — running these as a superuser bypasses RLS and proves nothing).
 */
describe('${names.pluralSnake} — tenant isolation', () => {
  it.todo('tenant A cannot read a row belonging to tenant B');
  it.todo('tenant A cannot update a row belonging to tenant B');
  it.todo('tenant A cannot delete a row belonging to tenant B');
  it.todo('INSERT with a foreign tenant_id is rejected by WITH CHECK');
  it.todo('a query with no app.tenant_id set returns zero rows (fail-closed)');
  it.todo('app.tenant_id does not leak between two requests sharing a pooled connection');

  it('is a placeholder until the cases above are written', () => {
    expect(true).toBe(true);
  });
});
`;
}

// ── main ─────────────────────────────────────────────────────────────────────

function usage(message: string): never {
  console.error(`\n  ${message}\n`);
  console.error('  Usage: pnpm gen:module <name>\n');
  console.error('  <name> is the kebab-case plural of the resource, e.g.');
  console.error('    pnpm gen:module invoices');
  console.error('    pnpm gen:module purchase-orders\n');
  console.error('  It clones apps/api/src/modules/items, rewrites every casing of item/items,');
  console.error('  emits an RLS migration stub and copies the RLS integration test.\n');
  process.exit(1);
}

function main(): void {
  const raw = process.argv[2];
  if (raw === undefined || raw.trim() === '') usage('No module name given.');

  const name = raw.trim();
  if (!KEBAB_CASE.test(name)) {
    usage(`"${name}" is not kebab-case. Use lowercase letters, digits and single dashes.`);
  }
  if (name === 'items' || name === 'item') {
    usage('"items" is the reference slice itself. Pick a different name.');
  }

  if (!existsSync(SOURCE_MODULE)) {
    console.error(
      `\n  Cannot generate: the reference slice ${path.relative(REPO_ROOT, SOURCE_MODULE)} does not exist yet.`,
    );
    console.error(
      '  This generator clones that slice. Build it first (doc 02 §1.1), then re-run.\n',
    );
    process.exit(1);
  }

  const target = path.join(MODULES_DIR, name);
  if (existsSync(target)) {
    console.error(`\n  Refusing to overwrite: ${path.relative(REPO_ROOT, target)} already exists.`);
    console.error('  Delete it first, or pick another name.\n');
    process.exit(1);
  }

  const names = deriveNames(name);
  const copied: string[] = [];

  copyTree(SOURCE_MODULE, target, names, copied);
  copyMatchingTests(TEST_DIR, names, copied);

  const hasRlsTest = copied.some((file) => /rls/i.test(file));
  if (!hasRlsTest) {
    const fallbackDir = path.join(TEST_DIR, 'integration');
    mkdirSync(fallbackDir, { recursive: true });
    const fallback = path.join(fallbackDir, `${names.pluralKebab}.rls.spec.ts`);
    if (!existsSync(fallback)) {
      writeFileSync(fallback, rlsTestTemplate(names), 'utf8');
      copied.push(path.relative(REPO_ROOT, fallback));
    }
  }

  mkdirSync(DRIZZLE_DIR, { recursive: true });
  const migration = path.join(DRIZZLE_DIR, `${timestamp()}_${names.pluralSnake}_rls.sql`);
  writeFileSync(migration, migrationSql(names), 'utf8');
  copied.push(path.relative(REPO_ROOT, migration));

  console.log(`\n  Generated module "${names.pluralKebab}" (entity ${names.singularPascal})\n`);
  for (const file of copied) console.log(`    + ${file}`);

  console.log(`
  Seven things a script must not guess
  ────────────────────────────────────
  1. Register ${names.pluralPascal}Module in apps/api/src/app.module.ts.
  2. Export the slice's public surface from its index.ts — nothing else may deep-import it.
  3. Add "${names.singularPascal}" to the CASL Subject union and to defineAbilityFor
     in packages/shared. An unknown subject silently denies everything.
  4. Add the Drizzle table to the schema, run pnpm db:generate, then merge the RLS
     statements from the stub into the generated migration (the stub explains how).
  5. Fill in the RLS integration test — the copied cases still assert against items.
  6. Regenerate the API contract: pnpm api:contract, then commit the result.
  7. Frontend slice, if this resource has UI:
     cp -r apps/web/src/features/items apps/web/src/features/${names.pluralKebab}

  Then: pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration
`);
}

main();
