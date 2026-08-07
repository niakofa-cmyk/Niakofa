/**
 * Server-side text sanitization helpers.
 *
 * These are applied to user-supplied free-text fields (request title,
 * description, notes) before they are stored in the database or included in
 * emails. The goal is defence-in-depth: even if a client skips client-side
 * validation, HTML tags and null-bytes are stripped server-side so stored
 * content is always plain text.
 *
 * NOTE: This is NOT a substitute for proper output-encoding in templates
 * (e.g. React's JSX escaping handles that for us). It IS a guard against
 * persistence of raw HTML in the database.
 */

/**
 * Strip HTML/XML tags and null-bytes from a user-supplied string.
 * Returns the trimmed plain-text result.
 *
 * - Strips any `<...>` sequences (tags, comments, doctype, etc.)
 * - Removes null-bytes (\x00) that can poison downstream parsers
 * - Decodes common HTML entities so "&lt;script&gt;" stored verbatim
 *   (not as injected markup) is normalised to "<script>" in plain text
 * - Trims surrounding whitespace
 */
export function stripTags(value: string): string {
  return value
    .replace(/\x00/g, "")          // null-bytes
    .replace(/<[^>]*>/g, "")       // HTML/XML tags
    .trim();
}

/**
 * Sanitize a string value from req.body for safe DB storage.
 * Returns null when the value is absent, null, or not a string.
 */
export function sanitizeTextField(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const cleaned = stripTags(value);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Sanitize a required string field — throws if the result is empty.
 * Use for fields like `title` that must be non-empty after sanitization.
 */
export function sanitizeRequiredTextField(value: unknown, fieldName = "field"): string {
  const cleaned = sanitizeTextField(value);
  if (!cleaned) throw new Error(`${fieldName} must be a non-empty string`);
  return cleaned;
}
