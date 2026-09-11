const UNIT_MS = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const;

type Unit = keyof typeof UNIT_MS;

const DURATION_REGEX = /^(\d+)(ms|s|m|h|d)$/;

/**
 * Parses the same duration strings JWT TTLs use (`15m`, `30d`).
 * Throws rather than defaulting: a silently wrong token lifetime is a security
 * bug that no test would catch.
 */
export function parseDuration(value: string): number {
  const match = DURATION_REGEX.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration "${value}": expected <number><ms|s|m|h|d>, e.g. "15m"`);
  }

  const [, amount, unit] = match;
  return Number(amount) * UNIT_MS[unit as Unit];
}

export function addDuration(from: Date, duration: string): Date {
  return new Date(from.getTime() + parseDuration(duration));
}

export function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}
