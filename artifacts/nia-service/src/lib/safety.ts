const CRISIS_PATTERNS = [
  // Suicidal ideation
  /\b(suicide|suicidal|kill myself|end my life|want to die|don't want to live|no reason to live|better off dead|take my own life|not worth living)\b/i,
  // Self-harm
  /\b(self.?harm|cutting myself|hurting myself|burn myself|scratch myself|hit myself)\b/i,
  // Overdose
  /\b(overdose|od'?ing|take too many pills|swallow everything)\b/i,
  // Abuse & violence
  /\b(being abused|someone is hurting me|my partner hits|he hits me|she hits me|they hit me|i'm being beaten|domestic violence|being stalked)\b/i,
  // Trafficking
  /\b(trafficking|being trafficked|forced to work|can't leave|they took my passport|sold me)\b/i,
  // Homelessness emergency
  /\b(sleeping outside|no place to sleep|nowhere to sleep|sleeping in my car|evicted tonight|being evicted today|kicked out tonight)\b/i,
  // Hunger emergency
  /\b(haven't eaten|no food|starving|kids haven't eaten|nothing to eat|no money for food)\b/i,
  // Medical emergency
  /\b(can't breathe|chest pain|heart attack|stroke|unconscious|bleeding badly|severe pain|allergic reaction|seizure)\b/i,
  // Child safety
  /\b(child abuse|hurting my child|someone hurting my child|unsafe at home|my kids aren't safe)\b/i,
  // Hopelessness
  /\b(no hope|give up on life|nothing matters anymore|what's the point|can't go on|can't do this anymore|done with everything)\b/i,
  // LGBTQ+ crisis
  /\b(kicked out for being gay|rejected for being trans|family disowned me|outed at school|conversion therapy)\b/i,
  // Veteran crisis
  /\b(veteran in crisis|combat flashback|ptsd episode|can't stop thinking about war)\b/i,
];

const SOFT_DISTRESS_PATTERNS = [
  /\b(feeling hopeless|really struggling|falling apart|can't cope|overwhelmed|exhausted|depressed|anxious|scared|lonely|isolated|helpless)\b/i,
  /\b(lost my job|can't pay rent|about to lose my home|utilities cut off|no insurance)\b/i,
];

export interface SafetyResult {
  flagged: boolean;
  soft?: boolean;
  escalationMessage?: string;
}

export function checkSafety(message: string): SafetyResult {
  const isCrisis = CRISIS_PATTERNS.some((p) => p.test(message));
  if (isCrisis) {
    return {
      flagged: true,
      escalationMessage: [
        "Sawubona — I see you, and I am here. You matter deeply. 💙",
        "",
        "Please reach out right now:",
        "🆘 Immediate danger → Call 911",
        "💛 Suicide & Crisis → Call or text 988 (24/7)",
        "💬 Crisis Text Line → Text HOME to 741741",
        "💜 Domestic Violence → 1-800-799-7233 (NDVH, 24/7)",
        "🏠 Homelessness/Shelter → Call or text 211",
        "🍽️ Food Emergency → Call 211 or text FOOD to 877-877",
        "🧠 Mental Health & Substance Use → 1-800-662-4357 (SAMHSA)",
        "👶 Child Safety → 1-800-422-4453 (Childhelp)",
        "🏳️‍🌈 LGBTQ+ Crisis → 1-866-488-7386 or text START to 678-678",
        "🎖️ Veterans → 988 then press 1",
        "🌍 International → findahelpline.com",
        "",
        "You are not alone. Pamoja — together, we carry this.",
        "",
        "I am still here with you. Would you like to keep talking?",
      ].join("\n"),
    };
  }

  const isSoftDistress = SOFT_DISTRESS_PATTERNS.some((p) => p.test(message));
  if (isSoftDistress) {
    return { flagged: false, soft: true };
  }

  return { flagged: false };
}
