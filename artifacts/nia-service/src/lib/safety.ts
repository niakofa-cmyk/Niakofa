/**
 * Nia Safety Layer
 *
 * Crisis detection and soft-distress flagging.
 * Maintained by the Godfather (Replit) — see REPLIT_GODFATHER.md.
 *
 * Philosophy: err on the side of compassion. A false positive (Nia shows
 * crisis resources to someone who didn't need them) costs nothing.
 * A false negative (Nia misses someone in genuine crisis) is unacceptable.
 *
 * NEVER remove patterns from CRISIS_PATTERNS without replacing them with
 * something more precise. The floor is always being raised, never lowered.
 */

const CRISIS_PATTERNS = [
  // Suicidal ideation — explicit
  /\b(suicide|suicidal|kill myself|end my life|want to die|don't want to live|no reason to live|better off dead|take my own life|not worth living|thinking about ending it|end it all|check out permanently)\b/i,
  // Suicidal ideation — implicit phrasing
  /\b(everyone would be better off without me|nobody would miss me|wouldn't mind if i didn't wake up|don't see the point of going on)\b/i,
  // Self-harm
  /\b(self.?harm|cutting myself|hurting myself|burn myself|scratch myself|hit myself|harm myself)\b/i,
  // Overdose / substance emergency
  /\b(overdose|od'?ing|take too many pills|swallow everything|took too much|took all my pills)\b/i,
  // Abuse & violence (intimate partner, family)
  /\b(being abused|someone is hurting me|my partner hits|he hits me|she hits me|they hit me|i'?m being beaten|domestic violence|being stalked|partner is violent|afraid of my partner|husband hurts me|wife hurts me)\b/i,
  // Human trafficking
  /\b(trafficking|being trafficked|forced to work|can'?t leave|they took my passport|sold me|being held against my will)\b/i,
  // Homelessness emergency
  /\b(sleeping outside|no place to sleep|nowhere to sleep|sleeping in my car|evicted tonight|being evicted today|kicked out tonight|sleeping on the street|no shelter tonight)\b/i,
  // Hunger emergency
  /\b(haven'?t eaten|no food|starving|kids haven'?t eaten|nothing to eat|no money for food|going hungry|children are hungry|baby has no formula)\b/i,
  // Medical emergency
  /\b(can'?t breathe|chest pain|heart attack|stroke|unconscious|bleeding badly|severe pain|allergic reaction|seizure|anaphylaxis|diabetic emergency|insulin|passing out)\b/i,
  // Child safety
  /\b(child abuse|hurting my child|someone hurting my child|unsafe at home|my kids aren'?t safe|cps|children are in danger|abuse a child)\b/i,
  // Hopelessness & giving up
  /\b(no hope|give up on life|nothing matters anymore|what'?s the point|can'?t go on|can'?t do this anymore|done with everything|completely hopeless|lost the will)\b/i,
  // LGBTQ+ crisis
  /\b(kicked out for being (gay|trans|queer|bi|lesbian)|rejected for being trans|family disowned me|outed at school|conversion therapy|homeless because i'?m gay|homeless because i'?m trans)\b/i,
  // Veteran crisis
  /\b(veteran in crisis|combat flashback|ptsd episode|can'?t stop thinking about war|survivor guilt|military trauma|veteran suicide)\b/i,
  // Addiction emergency
  /\b(withdrawals?|detox emergency|can'?t stop using|relapsed badly|using to survive|overdosing right now)\b/i,
  // Grief emergency (complicated/acute)
  /\b(just lost my (child|baby|husband|wife|partner|mother|father|son|daughter)|found them dead|my (child|baby|husband|wife|partner) died today|suicide of a loved one|they killed themselves)\b/i,
];

const SOFT_DISTRESS_PATTERNS = [
  // Emotional distress
  /\b(feeling hopeless|really struggling|falling apart|can'?t cope|overwhelmed|exhausted|depressed|anxious|scared|lonely|isolated|helpless|empty inside|numb)\b/i,
  // Financial / housing stress
  /\b(lost my job|can'?t pay rent|about to lose my home|utilities cut off|no insurance|behind on bills|facing eviction|car about to be repossessed|wage theft|lost everything)\b/i,
  // Relationship distress
  /\b(leaving my (partner|husband|wife)|relationship falling apart|divorce|separated|going through a breakup|my (partner|husband|wife) left)\b/i,
  // Caregiver burnout
  /\b(taking care of (my (parent|mom|dad|spouse|child))|caregiver|burned out from caregiving|no help with my (parent|child)|can'?t do this alone anymore)\b/i,
  // Mental health (non-acute)
  /\b(anxiety attack|panic attack|can'?t sleep|nightmares|trauma|ptsd|bipolar|schizophrenia|hearing voices|paranoid|mental health crisis)\b/i,
  // Addiction / recovery
  /\b(trying to get sober|in recovery|relapsed|struggling with (alcohol|drugs|addiction)|substance abuse|can'?t stop drinking|can'?t stop using)\b/i,
  // Food / basic needs insecurity
  /\b(struggling to eat|food insecurity|can'?t afford groceries|kids don'?t have (food|clothes)|no heat|no water|utilities off)\b/i,
  // Grief (non-acute)
  /\b(grieving|lost someone|someone passed|died recently|mourning|grief)\b/i,
  // Isolation
  /\b(no one to talk to|no friends|completely alone|no family|nobody cares|invisible|forgotten)\b/i,
];

export interface SafetyResult {
  flagged: boolean;
  soft?: boolean;
  escalationMessage?: string;
}

export function checkSafety(message: string): SafetyResult {
  // BUG-4-M06: Empty/blank messages must not pass safety gates — they waste
  // LLM tokens and can produce confusing responses.
  if (!message || !message.trim()) {
    return { flagged: false };
  }

  // BUG-4-C04 / REC-4-05: Normalize to NFKC to collapse Unicode homoglyphs
  // (e.g. "kíll" → "kill", "suicíde" → "suicide") and strip zero-width chars
  // that bypass plain includes()/regex matching.
  const normalized = message
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF\u00AD\u2060]/g, "");

  const isCrisis = CRISIS_PATTERNS.some((p) => p.test(normalized));
  if (isCrisis) {
    return {
      flagged: true,
      escalationMessage: [
        "Sawubona — I see you, and I am here with you right now. You matter deeply. 💙",
        "",
        "Please reach out to one of these right now — they are real people, available 24/7:",
        "",
        "🆘  Immediate danger → Call 911",
        "💛  Suicide & Crisis → Call or text **988** (free, 24/7, no judgment)",
        "💬  Crisis Text Line → Text **HOME** to **741741**",
        "💜  Domestic Violence → **1-800-799-7233** (SAFE, 24/7)",
        "🏠  Shelter & Housing → Call or text **211**",
        "🍽️  Food Emergency → Call **211** or text FOOD to **877-877**",
        "🧠  Mental Health / Substance Use → **1-800-662-4357** (SAMHSA)",
        "👶  Child Safety → **1-800-422-4453** (Childhelp)",
        "🏳️‍🌈  LGBTQ+ Crisis → **1-866-488-7386** or text START to **678-678**",
        "🎖️  Veterans → **988**, then press 1",
        "🌍  International → findahelpline.com",
        "",
        "Pamoja — together, we carry this. You are not alone.",
        "",
        "I am still here with you. Would you like to keep talking?",
      ].join("\n"),
    };
  }

  const isSoftDistress = SOFT_DISTRESS_PATTERNS.some((p) => p.test(normalized));
  if (isSoftDistress) {
    return { flagged: false, soft: true };
  }

  return { flagged: false };
}
