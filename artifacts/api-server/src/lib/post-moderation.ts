/**
 * Niakofa — Content Moderation (first pass)
 *
 * Two exported functions:
 *   moderatePostText(message)         — community/gratitude posts
 *   moderateRequestText(title, desc)  — help request title + description
 *
 * Both are deterministic, zero-dependency screens applied at write-time.
 * They are NOT replacements for human review — they decide whether content
 * goes straight to "approved" or gets held as "pending" for an admin.
 *
 * Deliberately conservative: false positives (held for review) are an
 * acceptable cost; false negatives (harmful content going live) are not.
 * When in doubt, return "pending".
 *
 * Help requests are treated differently from community posts:
 * - Emergency requests ALWAYS bypass the heuristic (life safety > screening).
 * - The spam patterns are retained, but we also check for illegal-service
 *   signals that someone might embed in the "other" category free-text.
 * - "Pending" requests still go live (helper community should not be
 *   blocked from helping someone in genuine need), but they are flagged for
 *   admin review via GET /admin/requests/flagged.
 */

/**
 * Hate-speech and targeted harassment signals.
 *
 * Strategy: word-boundary (`\b`) matching, case-insensitive. Patterns match
 * the *use* of slurs as attacks, not neutral/reclaimed usage in context —
 * but a regex cannot understand context, so false positives are possible.
 * All matches send content to admin review ("pending"), never auto-block.
 *
 * Maintenance notes:
 *  - Keep patterns narrow. A pattern that matches a slur as a substring of an
 *    innocent word is worse than missing the slur.
 *  - Prefer `\b` word boundaries over partial-string matches.
 *  - When in doubt, err toward "pending" rather than auto-reject.
 *  - This list is a first-pass heuristic. Pair it with the admin queue and
 *    user reporting for comprehensive coverage.
 */
const BLOCKED_PATTERNS: RegExp[] = [
  // Racial slurs (n-word variants, hard-r and soft-r)
  /\bn[i1!]+g{1,2}[ae3@]+r?\b/i,
  /\bn[i1!]+g{1,2}[ae3@]z\b/i,
  // Antisemitic slurs
  /\bk[i1!]+k[e3]+\b/i,
  /\bsp[i1!]+c[k]?\b/i,
  // Homophobic slurs (common attack form)
  /\bf[a4@]+g{1,2}[o0]+t?\b/i,
  /\bd[y1!]+k[e3]+\b/i,
  // Transphobic slurs
  /\btr[a4@]+nn[y1!]+\b/i,
  // Ableist slur used as an attack
  /\br[e3]+t[a4@]+rd\b/i,
  // Explicit white-supremacist code (88 = HH = Heil Hitler, 1488)
  /\b1[4]88\b/,
  /\bheil\s+h[i1!]+tl[e3]+r\b/i,
  // Direct targeted attack phrases
  /\b(go|get)\s+back\s+to\s+(your\s+country|africa|mexico)\b/i,
  /\b(you|they)\s+(people|all)\s+(are\s+)?(all\s+)?(criminals?|animals?|subhuman)\b/i,
  // Death threats / violent targeting (combined with a slur or group)
  /\b(kill|hang|lynch|shoot)\s+(all\s+)?(the\s+)?(blacks?|whites?|jews?|muslims?|gays?|trans)\b/i,
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

// ── Request-specific illegal/unsafe service patterns ─────────────────────────
// These detect signals that someone may be using the free-text category "other"
// to request illegal goods or services. Positive matches always → "pending".
// Patterns are intentionally narrow to avoid false-positives on legitimate
// requests (e.g. "prescription pickup" → medical category, not flagged here).
const ILLEGAL_SERVICE_PATTERNS: RegExp[] = [
  // Controlled substances
  /\b(buy|sell|get|find|deliver|score)\s+(me\s+)?(drugs?|weed|marijuana|cocaine|heroin|meth|fentanyl|pills)\b/i,
  /\b(controlled\s+substance|illegal\s+substance)\b/i,
  // Weapons (not lawful transfers — the "buy" intent is the signal)
  /\b(buy|sell|get)\s+(me\s+)?(unlicensed\s+)?(gun|firearm|ammo|ammunition|weapon)\b/i,
  // Solicitation / trafficking signals — requires intent context to avoid
  // false-positives on benign requests like "escort my mother to an appointment"
  /\b(hire|book|find|get|need)\s+(an?\s+)?(escort|sex\s+worker|prostitut)\b/i,
  /\b(prostitut|sex\s+work|adult\s+service|happy\s+ending)\b/i,
  // Fraud / document forgery
  /\b(fake\s+(id|passport|license|document)|forge|counterfeit)\b/i,
  // Hacking / unauthorized access
  /\b(hack\s+(into|an?|my)|crack\s+(password|account)|ddos|phishing)\b/i,
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

/**
 * moderateRequestText — heuristic screen for help request title + description.
 *
 * Key differences from moderatePostText:
 * 1. Checks illegal-service patterns (drugs, weapons, solicitation, etc.)
 * 2. Does NOT fast-track positivity — short help requests are normal and
 *    should not be auto-approved if other signals fire.
 * 3. Spam patterns still apply (raw links, phone numbers, etc.)
 *
 * Returns "approved" or "pending". The caller decides what to do with
 * "pending" — for help requests, the convention is: let the request go live
 * (someone may genuinely need help) but flag it for admin review.
 *
 * Emergency requests should bypass this entirely — life safety > screening.
 */
export function moderateRequestText(title: string, description: string): ModerationResult {
  const combined = `${title} ${description}`.trim();

  if (combined.length < 3) {
    return { status: "pending", reason: "too short to evaluate" };
  }

  // Illegal service signals — most important check
  for (const pattern of ILLEGAL_SERVICE_PATTERNS) {
    if (pattern.test(combined)) {
      return { status: "pending", reason: "possible illegal service request" };
    }
  }

  // Spam patterns — same as community posts
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(combined)) {
      return { status: "pending", reason: `spam signal: ${pattern.source.slice(0, 40)}` };
    }
  }

  // Hard-block patterns (future: real classifier)
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(combined)) {
      return { status: "pending", reason: "matched blocked content pattern" };
    }
  }

  if (EXCESSIVE_CAPS.test(combined)) {
    return { status: "pending", reason: "excessive capitalization" };
  }

  if (EXCESSIVE_PUNCTUATION.test(combined)) {
    return { status: "pending", reason: "excessive punctuation" };
  }

  if (/(.)\1{9,}/.test(combined)) {
    return { status: "pending", reason: "repeated character flood" };
  }

  return { status: "approved", reason: null };
}
