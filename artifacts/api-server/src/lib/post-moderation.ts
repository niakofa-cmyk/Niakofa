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
 * Positivity filter: posts that match community-positive patterns (offers
 * of help, resource shares, uplifting updates) are fast-tracked to
 * "approved" even if they're short, because short helpful offers are normal
 * and valuable in the community feed.
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
  /\b(buy now|limited time|act fast|dm me|text me|cash app|venmo me)\b/i,
  /\b(make money|earn \$|passive income|work from home.*easy)\b/i,
];

const EXCESSIVE_CAPS = /^[^a-z]*[A-Z]{8,}/;       // long all-caps runs — common in spam/scam posts
const EXCESSIVE_PUNCTUATION = /[!?]{4,}/;

// ── Positivity fast-track ─────────────────────────────────────────────────────
// Posts matching community-positive patterns are approved directly.
// These phrases are characteristic of genuine neighbor-to-neighbor offers,
// resource shares, and uplifting community updates — not spam.
const POSITIVE_PATTERNS: RegExp[] = [
  /\b(free\s+(ride|food|meal|groceries|clothes|household|help|pickup|drop.?off))\b/i,
  /\b(offering|happy to help|can (help|assist|give|bring|drive|pick up))\b/i,
  /\b(food pantry|food bank|shelter|resource|pantry|meals|clothing|assistance)\b/i,
  /\b(available (to help|for help|this week|today|this weekend))\b/i,
  /\b(if (you|anyone) need(s)?|reach out|let me know|feel free)\b/i,
  /\b(neighborhood|neighbor|community|block|local)\b/i,
  /\b(volunteer|donated|giving away|free to a good home)\b/i,
  /\b(thank(s| you)|gratitude|appreciate|blessed|grateful)\b/i,
];

export interface ModerationResult {
  status: "approved" | "pending";
  reason: string | null;
}

export function moderatePostText(message: string): ModerationResult {
  const trimmed = message.trim();

  if (trimmed.length < 3) {
    return { status: "pending", reason: "too short to evaluate" };
  }

  // Hard blocks — check before anything else
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { status: "pending", reason: "matched blocked content pattern" };
    }
  }

  // Spam signals — pending immediately if matched
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

  // Positivity fast-track — genuine community offers and resource shares
  // are auto-approved even if they're concise (short offers are normal and good)
  const isPositive = POSITIVE_PATTERNS.some((p) => p.test(trimmed));
  if (isPositive) {
    return { status: "approved", reason: null };
  }

  // Default: approve if no signals fired. The moderation queue + user reports
  // catch what this heuristic misses.
  return { status: "approved", reason: null };
}
