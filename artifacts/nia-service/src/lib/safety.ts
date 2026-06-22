const CRISIS_PATTERNS = [
  /\b(suicide|suicidal|kill myself|end my life|want to die|don't want to live)\b/i,
  /\b(self.?harm|cutting myself|hurting myself)\b/i,
  /\b(overdose|od'ing)\b/i,
  /\b(abuse|being abused|someone is hurting me)\b/i,
];

export interface SafetyResult {
  flagged: boolean;
  escalationMessage?: string;
}

export function checkSafety(message: string): SafetyResult {
  const isCrisis = CRISIS_PATTERNS.some((p) => p.test(message));
  if (!isCrisis) return { flagged: false };
  return {
    flagged: true,
    escalationMessage: [
      "I hear you, and I'm glad you reached out. 💙",
      "",
      "Please contact one of these resources right now:",
      "• 988 Suicide & Crisis Lifeline — call or text 988 (US)",
      "• Crisis Text Line — text HOME to 741741",
      "• Emergency services — call 911 if you're in immediate danger",
      "",
      "You don't have to go through this alone. Is there someone nearby you trust that you can reach out to?",
    ].join("\n"),
  };
}
