/**
 * Niakofa — Community Post Moderation (first pass)
 *
 * This is a deterministic, zero-dependency screen applied at write-time to
 * every community post (thanks/offer/resource/update) before it's allowed
 * into the public feed. It is NOT a replacement for human review — it only
 * decides whether a post goes straight to "approved" or gets held as
 * "pending" for an admin to look at via the moderation queue
 * (GET/POST /admin/moderation-queue).
 *
 * Deliberately conservative: false positives (good posts held for review)
 * are an acceptable cost; false negatives (harmful posts going live
 * unreviewed) are not. When in doubt, this returns "pending".
 *
 * This does NOT call any AI model. A future iteration could route flagged
 * posts through Nia or another classifier for a second opinion, but that
 * adds latency, cost, and a new failure mode — start with the cheap,
 * explainable version and only add AI scoring if false-positive rate on
 * "pending" turns out to be too high in practice.
 */

const BLOCKED_PATTERNS: RegExp[] = [
  // Intentionally empty in this first pass. Hate speech/slur detection needs
  // a real, maintained classifier or word list — hardcoding one here would
  // be incomplete, hard to keep current, and risks false confidence that
  // this filter catches abuse it doesn't. Until a real provider (e.g. a
  // moderation API) is wired in, that category relies on the admin
  // moderation queue + user reports, not this heuristic.
];

const SPAM_PATTERNS: RegExp[] = [
  /\b(https?:\/\/|www\.)\S+/i,                 // raw links — resource posts should use the dedicated url field, not inline links in free text
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/,          // phone numbers in free text — push users toward the app's own contact flow instead
  /\$\d+.*\bnow\b.*\bclick\b/i,                  // classic spam phrasing
  /\b(crypto|bitcoin|forex|mlm|pyramid scheme)\b/i,
];

const EXCESSIVE_CAPS = /^[^a-z]*[A-Z]{8,}/;       // long all-caps runs — common in spam/scam posts
const EXCESSIVE_PUNCTUATION = /[!?]{4,}/;

export interface ModerationResult {
  status: "approved" | "pending";
  reason: string | null;
}

export function moderatePostText(message: string): ModerationResult {
  const trimmed = message.trim();

  if (trimmed.length < 3) {
    return { status: "pending", reason: "too short to evaluate" };
  }

  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { status: "pending", reason: "matched spam heuristic" };
    }
  }

  if (EXCESSIVE_CAPS.test(trimmed)) {
    return { status: "pending", reason: "excessive capitalization" };
  }

  if (EXCESSIVE_PUNCTUATION.test(trimmed)) {
    return { status: "pending", reason: "excessive punctuation" };
  }

  // Repeated-character flood (e.g. "aaaaaaaaaaaaaaaaaa") — cheap flood/spam tell
  if (/(.)\1{9,}/.test(trimmed)) {
    return { status: "pending", reason: "repeated character flood" };
  }

  return { status: "approved", reason: null };
}
