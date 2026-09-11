import { describe, expect, it } from 'vitest';
import { err, isErr, isOk, mapResult, ok, unwrap } from '../types/result';

describe('Result', () => {
  it('narrows on ok', () => {
    const result = ok(1);
    expect(isOk(result)).toBe(true);
    expect(unwrap(result)).toBe(1);
  });

  it('narrows on err', () => {
    const result = err(new Error('boom'));
    expect(isErr(result)).toBe(true);
    expect(() => unwrap(result)).toThrow('boom');
  });

  it('wraps non-Error failures before throwing', () => {
    expect(() => unwrap(err('nope'))).toThrow('nope');
  });

  it('maps only the success branch', () => {
    expect(mapResult(ok(2), (n) => n * 2)).toEqual({ ok: true, value: 4 });
    const failure = err('bad');
    expect(mapResult(failure, (n: number) => n * 2)).toBe(failure);
  });
});
