import { describe, expect, it } from 'vitest';
import { addDuration, isExpired, parseDuration } from '../utils/duration';

describe('parseDuration', () => {
  it.each([
    ['500ms', 500],
    ['30s', 30_000],
    ['15m', 900_000],
    ['2h', 7_200_000],
    ['30d', 2_592_000_000],
  ])('parses %s', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it.each(['', '15', 'm', '15 minutes', '-1m', '1.5h'])('rejects %s', (input) => {
    expect(() => parseDuration(input)).toThrow(/Invalid duration/);
  });
});

describe('addDuration', () => {
  it('adds to the given instant without mutating it', () => {
    const from = new Date('2024-01-01T00:00:00.000Z');
    expect(addDuration(from, '15m').toISOString()).toBe('2024-01-01T00:15:00.000Z');
    expect(from.toISOString()).toBe('2024-01-01T00:00:00.000Z');
  });
});

describe('isExpired', () => {
  const now = new Date('2024-01-01T00:00:00.000Z');

  it('treats the exact expiry instant as expired', () => {
    expect(isExpired(now, now)).toBe(true);
  });

  it('is false while there is time left', () => {
    expect(isExpired(new Date(now.getTime() + 1), now)).toBe(false);
  });
});
