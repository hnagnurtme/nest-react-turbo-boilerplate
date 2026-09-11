/**
 * Only ever used to read the non-httpOnly `csrf_token` cookie for the
 * double-submit header (doc 03 section 2.2). The refresh token itself stays
 * httpOnly and is never readable from JS — that is the whole point of it
 * being a cookie in the first place.
 */
export function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1] ?? '') : null;
}
