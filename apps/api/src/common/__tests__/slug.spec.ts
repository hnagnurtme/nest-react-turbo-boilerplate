import { describe, expect, it } from 'vitest';
import { isSlug, slugify, uniqueSlug } from '../utils/slug';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('folds Vietnamese diacritics instead of dropping the characters', () => {
    expect(slugify('Đà Nẵng')).toBe('da-nang');
    expect(slugify('Tiếng Việt')).toBe('tieng-viet');
  });

  it('collapses runs of separators and trims the edges', () => {
    expect(slugify('  --a___b!!  ')).toBe('a-b');
  });

  it('returns an empty string when nothing survives', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('isSlug', () => {
  it.each([
    ['a', true],
    ['a-b-c', true],
    ['A', false],
    ['a--b', false],
    ['-a', false],
    ['', false],
  ])('isSlug(%s) === %s', (value, expected) => {
    expect(isSlug(value)).toBe(expected);
  });
});

describe('uniqueSlug', () => {
  it('returns the plain slug when free', () => {
    expect(uniqueSlug('My Tenant', [])).toBe('my-tenant');
  });

  it('suffixes until free', () => {
    expect(uniqueSlug('My Tenant', ['my-tenant', 'my-tenant-2'])).toBe('my-tenant-3');
  });
});
