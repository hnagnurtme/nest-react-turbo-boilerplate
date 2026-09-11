import { SLUG_REGEX } from '../constants';

/**
 * Lowercase, ASCII-only, hyphen separated. The NFD normalisation step folds
 * Vietnamese diacritics (and `đ`, which has no combining form) so "Đà Nẵng"
 * becomes "da-nang" instead of being stripped to "-ng".
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isSlug(value: string): boolean {
  return SLUG_REGEX.test(value);
}

/** Appends `-2`, `-3`, ... until the slug is unique within `taken`. */
export function uniqueSlug(base: string, taken: readonly string[]): string {
  const slug = slugify(base);
  if (!taken.includes(slug)) return slug;

  let suffix = 2;
  while (taken.includes(`${slug}-${suffix}`)) suffix += 1;
  return `${slug}-${suffix}`;
}
