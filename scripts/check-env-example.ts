/**
 * CI gate: `apps/api/.env.example` must list exactly the variables the Zod env
 * schema declares. Drift here means someone clones the repo, follows the README
 * and gets a crash at bootstrap for a variable nobody told them about.
 *
 * The schema is parsed *statically*. Importing it would execute the module, which
 * validates process.env and calls process.exit(1) on the spot (doc 00 §2, fail-fast
 * configuration) — the gate would then report "invalid env" instead of the drift.
 */
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
const SCHEMA_FILE = path.join(REPO_ROOT, 'apps/api/src/config/env.schema.ts');
const EXAMPLE_FILE = path.join(REPO_ROOT, 'apps/api/.env.example');

/** Extracts the balanced `{ ... }` body of the first `envSchema = z.object(` in the file. */
function extractSchemaBody(source: string): string | null {
  const anchor = /envSchema\s*(?::[^=]+)?=\s*z\s*\.\s*object\s*\(\s*\{/.exec(source);
  if (!anchor) return null;

  const start = anchor.index + anchor[0].length;
  let depth = 1;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i);
    }
  }
  return null;
}

/**
 * Collects the top-level keys. Env variables are SCREAMING_SNAKE_CASE by
 * convention, which is what lets a regex tell a key apart from anything nested
 * inside a `z.object({...})` refinement or a default value.
 */
function schemaKeys(body: string): Set<string> {
  const keys = new Set<string>();
  const pattern = /(?:^|[{,])\s*['"]?([A-Z][A-Z0-9_]*)['"]?\s*:/gm;
  for (let m = pattern.exec(body); m !== null; m = pattern.exec(body)) {
    const key = m[1];
    if (key !== undefined) keys.add(key);
  }
  return keys;
}

function exampleKeys(source: string): Set<string> {
  const keys = new Set<string>();
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=/.exec(trimmed);
    const key = match?.[1];
    if (key !== undefined) keys.add(key);
  }
  return keys;
}

function report(title: string, keys: readonly string[], hint: string): void {
  console.error(`\n  ${title}`);
  for (const key of keys) console.error(`    - ${key}`);
  console.error(`  → ${hint}`);
}

function main(): void {
  const hasSchema = existsSync(SCHEMA_FILE);
  const hasExample = existsSync(EXAMPLE_FILE);

  if (!hasSchema && !hasExample) {
    // apps/api has not been scaffolded yet — nothing to compare, and nothing broken.
    console.log(
      'check:env — apps/api has no env schema and no .env.example yet. Nothing to check.',
    );
    return;
  }
  if (!hasSchema) {
    console.error(
      `check:env FAILED — ${path.relative(REPO_ROOT, EXAMPLE_FILE)} exists but ${path.relative(REPO_ROOT, SCHEMA_FILE)} does not.`,
    );
    console.error(
      '  → Every variable in .env.example must be declared in the Zod schema. Create the schema.',
    );
    process.exit(1);
  }
  if (!hasExample) {
    console.error(
      `check:env FAILED — ${path.relative(REPO_ROOT, SCHEMA_FILE)} exists but ${path.relative(REPO_ROOT, EXAMPLE_FILE)} does not.`,
    );
    console.error(
      '  → Someone cloning the repo has no template to copy. Create apps/api/.env.example.',
    );
    process.exit(1);
  }

  const body = extractSchemaBody(readFileSync(SCHEMA_FILE, 'utf8'));
  if (body === null) {
    console.error(
      `check:env FAILED — could not find an "envSchema = z.object({ ... })" declaration in ${path.relative(REPO_ROOT, SCHEMA_FILE)}.`,
    );
    console.error(
      '  → This gate parses that exact shape. Keep the schema in that form, or update scripts/check-env-example.ts.',
    );
    process.exit(1);
  }

  const declared = schemaKeys(body);
  if (declared.size === 0) {
    console.error('check:env FAILED — the envSchema object declares no SCREAMING_SNAKE_CASE keys.');
    console.error(
      '  → Either the schema is empty, or its keys do not follow the env-variable naming convention.',
    );
    process.exit(1);
  }

  const documented = exampleKeys(readFileSync(EXAMPLE_FILE, 'utf8'));

  const missing = [...declared].filter((k) => !documented.has(k)).sort();
  const extra = [...documented].filter((k) => !declared.has(k)).sort();

  if (missing.length === 0 && extra.length === 0) {
    console.log(`check:env OK — ${declared.size} variables, schema and .env.example agree.`);
    return;
  }

  console.error('\n::error::.env.example and the Zod env schema disagree.');
  if (missing.length > 0) {
    report(
      `Declared in env.schema.ts but MISSING from .env.example (${missing.length}):`,
      missing,
      'add each one to apps/api/.env.example with a safe placeholder value.',
    );
  }
  if (extra.length > 0) {
    report(
      `Present in .env.example but NOT declared in env.schema.ts (${extra.length}):`,
      extra,
      'either declare them in the schema or delete them from .env.example — an undeclared variable is never read.',
    );
  }
  console.error('');
  process.exit(1);
}

main();
