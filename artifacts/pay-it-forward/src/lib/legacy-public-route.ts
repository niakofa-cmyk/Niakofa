/**
 * Canonicalize public Legacy URLs without changing unrelated application routes.
 *
 * The Legacy tree is intentionally case-insensitive because links can come
 * from old bookmarks and deployment platforms may preserve the original URL
 * casing. Wouter's route matching is case-sensitive, so canonicalization must
 * happen before the authenticated shell gets a chance to handle the path.
 */
export function isLegacyPathname(pathname: string): boolean {
  return /^\/legacy(?:\/|$)/i.test(pathname);
}

export function normalizeLegacyPathname(pathname: string): string {
  const withoutTrailingSlash =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  return isLegacyPathname(withoutTrailingSlash)
    ? withoutTrailingSlash.toLowerCase()
    : withoutTrailingSlash;
}