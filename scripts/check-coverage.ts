/**
 * CI gate: per-area line coverage (doc 09 §5).
 *
 * A single repo-wide number is easy to game — 100% in `utils/` next to 40% in
 * `auth/` averages out to something respectable and ships an unsafe system.
 * These thresholds are ordered by blast radius instead: a gap in the RLS
 * plumbing leaks tenant data, a gap in a helper does not.
 */
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
const API_ROOT = path.join(REPO_ROOT, 'apps/api');

/**
 * Two separate vitest runs, two separate reports (doc 09 section 5):
 * TransactionManager and friends only ever execute against a real database,
 * so their line coverage is always 0% from the unit run alone. Both are
 * required for the `core/database` area to mean anything; only the unit one
 * is required to exist at all (a fresh clone might not have Docker running).
 */
const UNIT_SUMMARY_FILE = path.join(API_ROOT, 'coverage/coverage-summary.json');
const INTEGRATION_SUMMARY_FILE = path.join(API_ROOT, 'coverage/integration/coverage-summary.json');

interface Area {
  /** Human label used in the report table. */
  readonly label: string;
  /** Path prefixes, relative to apps/api, that belong to this area. */
  readonly prefixes: readonly string[];
  /** Minimum line coverage, in percent. */
  readonly minLines: number;
}

/**
 * Evaluated top to bottom; the first area whose prefix matches a file claims it,
 * so the catch-all must stay last.
 */
const AREAS: readonly Area[] = [
  { label: 'core/database (RLS, transactions)', prefixes: ['src/core/database/'], minLines: 95 },
  { label: 'modules/auth', prefixes: ['src/modules/auth/'], minLines: 90 },
  {
    label: 'core/filters + core/interceptors',
    prefixes: ['src/core/filters/', 'src/core/interceptors/'],
    minLines: 90,
  },
  { label: 'everything else', prefixes: [], minLines: 70 },
];

interface LineCounts {
  readonly total: number;
  readonly covered: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads `{ lines: { total, covered } }` from one entry of coverage-summary.json. */
function readLineCounts(entry: unknown): LineCounts | null {
  if (!isRecord(entry)) return null;
  const lines = entry['lines'];
  if (!isRecord(lines)) return null;
  const total = lines['total'];
  const covered = lines['covered'];
  if (typeof total !== 'number' || typeof covered !== 'number') return null;
  return { total, covered };
}

/**
 * The areas above are declared relative to apps/api. Vitest normally writes
 * absolute keys, but depending on its `root` it may write paths relative to the
 * repo instead — so both spellings are folded to the same form here.
 */
function toRelative(key: string): string {
  const relative = path.isAbsolute(key) ? path.relative(API_ROOT, key) : key;
  const normalised = relative.split(path.sep).join('/').replace(/^\.\//, '');
  return normalised.startsWith('apps/api/') ? normalised.slice('apps/api/'.length) : normalised;
}

function areaFor(relativePath: string): Area {
  for (const area of AREAS) {
    if (area.prefixes.some((prefix) => relativePath.startsWith(prefix))) return area;
  }
  // The catch-all has no prefixes, so it always ends up here.
  const fallback = AREAS[AREAS.length - 1];
  if (fallback === undefined) throw new Error('AREAS must not be empty');
  return fallback;
}

interface Tally {
  files: number;
  total: number;
  covered: number;
}

function fail(message: string, hint: string): never {
  console.error(`\n::error::${message}`);
  console.error(`  → ${hint}\n`);
  process.exit(1);
}

function readSummary(file: string, required: boolean): Record<string, unknown> | null {
  if (!existsSync(file)) {
    if (required) {
      fail(
        `Coverage summary not found at ${path.relative(REPO_ROOT, file)}.`,
        'Run the API unit tests with the vitest "json-summary" coverage reporter enabled before this gate (pnpm test).',
      );
    }
    console.warn(
      `  (skipping ${path.relative(REPO_ROOT, file)} — not found; run "pnpm test:integration" for full core/database coverage)`,
    );
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  } catch (error) {
    fail(
      `Could not parse ${path.relative(REPO_ROOT, file)}: ${error instanceof Error ? error.message : String(error)}`,
      'The file is truncated or not JSON. Delete apps/api/coverage and re-run the tests.',
    );
  }
  if (!isRecord(parsed)) {
    fail(
      `${path.relative(REPO_ROOT, file)} is not a JSON object.`,
      'Expected the vitest json-summary reporter output.',
    );
  }
  return parsed;
}

function main(): void {
  const summaries = [
    readSummary(UNIT_SUMMARY_FILE, true),
    readSummary(INTEGRATION_SUMMARY_FILE, false),
  ].filter((s): s is Record<string, unknown> => s !== null);

  // Merged per file by taking the higher `covered` count seen for that path
  // across the unit and integration runs. This is an approximation (line-level
  // hit data isn't in the summary format, only per-file totals), but it is
  // monotonic and can never overstate coverage the way naively summing the
  // two runs' `covered` counts would.
  const bestPerFile = new Map<string, LineCounts>();
  for (const parsed of summaries) {
    for (const [key, entry] of Object.entries(parsed)) {
      if (key === 'total') continue; // the reporter's own repo-wide roll-up
      const counts = readLineCounts(entry);
      if (counts === null) continue;

      const relative = toRelative(key);
      const existing = bestPerFile.get(relative);
      if (!existing || counts.covered > existing.covered) {
        bestPerFile.set(relative, counts);
      }
    }
  }

  const tallies = new Map<string, Tally>(
    AREAS.map((area) => [area.label, { files: 0, total: 0, covered: 0 }]),
  );

  for (const [relative, counts] of bestPerFile) {
    const tally = tallies.get(areaFor(relative).label);
    if (tally === undefined) continue;
    tally.files += 1;
    tally.total += counts.total;
    tally.covered += counts.covered;
  }

  const rows: string[] = [];
  const failures: string[] = [];

  for (const area of AREAS) {
    const tally = tallies.get(area.label) ?? { files: 0, total: 0, covered: 0 };

    // An area with no source files yet is not a failure — the slice simply is not
    // built. It becomes a failure the moment the first file lands under it.
    if (tally.files === 0 || tally.total === 0) {
      rows.push(
        `  ○  ${area.label.padEnd(36)} ${'—'.padStart(7)}  (min ${area.minLines}%)   no files yet, skipped`,
      );
      continue;
    }

    const pct = (tally.covered / tally.total) * 100;
    const ok = pct + 1e-9 >= area.minLines;
    const marker = ok ? '✓' : '✗';
    rows.push(
      `  ${marker}  ${area.label.padEnd(36)} ${pct.toFixed(2).padStart(6)}%  (min ${area.minLines}%)   ${tally.covered}/${tally.total} lines in ${tally.files} files`,
    );
    if (!ok) {
      failures.push(
        `${area.label}: ${pct.toFixed(2)}% < ${area.minLines}% (${tally.total - tally.covered} uncovered lines)`,
      );
    }
  }

  console.log('\n  Coverage gate — line coverage per area\n');
  for (const row of rows) console.log(row);
  console.log('');

  if (failures.length > 0) {
    console.error(`::error::Coverage gate failed in ${failures.length} area(s):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(
      '\n  → Add tests for the uncovered lines. Thresholds live at the top of scripts/check-coverage.ts',
    );
    console.error('    and are deliberately higher where a bug leaks data or lets someone in.\n');
    process.exit(1);
  }

  console.log('  Coverage gate passed.\n');
}

main();
