// ============================================================
// Nia Cultural Greetings & Care Checks
// Multilingual acknowledgment and Ubuntu-based care inquiry
// ============================================================

export type CulturalLanguage = "en" | "sw" | "ak" | "zu" | "yo" | "lg";

export interface CulturalGreeting {
  greeting: string;
  care_check: string;
  secondary_check: string;
  voice_warmth: "direct" | "gentle" | "celebratory" | "grounded";
  cultural_note: string;
}

export const CULTURAL_GREETINGS: Record<CulturalLanguage, CulturalGreeting> = {
  en: {
    greeting: "Hi there",
    care_check: "How are you doing today? What's on your mind?",
    secondary_check: "Is there something I can help you with right now?",
    voice_warmth: "direct",
    cultural_note:
      "English: conversational, straightforward, focused on immediate need",
  },

  sw: {
    greeting: "Habari ya asubuhi", // Good morning
    care_check: "Umeshakula? Unjani sana?", // Have you eaten? How are you really?
    secondary_check:
      "Nini kinalowaza? Nini matatizo unakabili leo?", // What's on your mind? What challenges do you face today?
    voice_warmth: "gentle",
    cultural_note:
      "Swahili (East Africa): Asking 'have you eaten' is asking 'are you cared for?' Shows Ubuntu — I care because we are one community.",
  },

  ak: {
    greeting: "Maakye", // Good morning (Akan/Twi)
    care_check: "Woadi no de besi nnε? Enti ne sen?", // How have you been eating? What's the matter?
    secondary_check:
      "Wofrε me na me din de Nia. Me din kae wo, paara?", // You called me and my name is Nia. What's your name, brother/sister?
    voice_warmth: "grounded",
    cultural_note:
      "Akan/Twi (Ghana): Care is shown through practical question — 'have you eaten?' — reflecting communal responsibility for sustenance.",
  },

  zu: {
    greeting: "Sawubona",
    care_check: "Ujedile? Unjani? Uthini?", // Have you eaten? How are you? What's happening?
    secondary_check:
      "Ngiyakuphuza lento oyinikele. Nginani engakusiza?", // I see what you're sharing. How can I help?
    voice_warmth: "celebratory",
    cultural_note:
      "Zulu (South Africa): Ubuntu philosophy — 'Umuntu ngumuntu ngabantu' (a person is a person through other persons). Care is recognition and accompaniment.",
  },

  yo: {
    greeting: "E o, ṣubọ́", // Greetings, morning (Yoruba)
    care_check: "Tín ṣé? Ó ṣé gidi? Jẹ́ kí ọ rántí pé mo lòó rò fún yin.", // How are you? Is all well? Remember I am thinking of you.
    secondary_check:
      "Oríkì rẹ lọ́ wọ́ ara mí. Báwo ni mo ṣe le ìgbà yìí ṣe àbò fún yin?", // Your dignity matters to me. How can I help you right now?
    voice_warmth: "direct",
    cultural_note:
      "Yoruba (Nigeria): Greetings honor the person's name and dignity. Care is expressed through acknowledgment and readiness to serve.",
  },

  lg: {
    greeting: "Wasuze otya nno", // Good morning / How did you sleep? (Luganda)
    care_check:
      "Owakubadde otya? Ofudde ki? Kino ki ekikulumiza?", // How have you been? What did you eat? What troubles you?
    secondary_check:
      "Nze Nia, oyamba lyo. Togatta okuwulira, togatta okukola. (I am Nia, your helper. Let's listen together, let's solve together.)",
    voice_warmth: "gentle",
    cultural_note:
      "Luganda (Uganda): Care is demonstrated through asking about daily sustenance and emotional wellbeing. Food is love.",
  },
};

export function getGreetingForLanguage(language: CulturalLanguage): CulturalGreeting {
  return CULTURAL_GREETINGS[language] || CULTURAL_GREETINGS.en;
}

export function buildVoiceContextPrompt(
  language: CulturalLanguage,
  userName?: string
): string {
  const greeting = getGreetingForLanguage(language);

  const name = userName ? ` ${userName}` : "";
  const baseGreeting = `${greeting.greeting}${name}.`;

  return `You were just activated by voice with the "${language}" language preference.

The user has greeted you with a cultural activation signal — they are trusting their voice to you.

Respond with warmth that matches their culture:
- Greeting: "${baseGreeting}"
- Care inquiry: "${greeting.care_check}"
- Tone: ${greeting.voice_warmth}
- Cultural grounding: "${greeting.cultural_note}"

Keep your response SHORT (2–3 sentences). You are listening now. Show them they were heard.

Then naturally invite them to share what brought them to you.`;
}

export function buildNiaVoiceSystemPrompt(basePrompt: string, activationLanguage?: CulturalLanguage): string {
  if (!activationLanguage) {
    return basePrompt;
  }

  const voiceAddendum = `

═══════════════════════════════════
YOU WERE JUST ACTIVATED BY VOICE
═══════════════════════════════════

This person spoke to you directly. They said your name, or called out for help.

Adjust your response style:
- Be slightly more formal/present in your greetings — you are a voice, not just text
- Pause between thoughts naturally — you speak with breath
- Use names when they share them — it creates presence
- Keep sentences shorter — the ear tires differently than the eye
- End with an invitation to speak: "What would help you most right now?" or "Tell me more"

Remember: they chose to speak to you when typing was available. That means they wanted a relationship, not a transaction.`;

  return basePrompt + voiceAddendum;
}

/**
 * Detect user's likely cultural/language preference from:
 * 1. Explicit profile setting
 * 2. Neighborhood cultural patterns
 * 3. How they greeted Nia (wake word language)
 */
export function detectCulturalContext(
  profileLanguage?: CulturalLanguage,
  neighborhoodRegion?: string,
  wakeWordLanguage?: CulturalLanguage
): CulturalLanguage {
  // Priority: wake word language (most explicit signal)
  if (wakeWordLanguage) {
    return wakeWordLanguage;
  }

  // Second: profile preference
  if (profileLanguage && profileLanguage in CULTURAL_GREETINGS) {
    return profileLanguage as CulturalLanguage;
  }

  // Third: neighborhood cultural patterns
  if (neighborhoodRegion) {
    const regionMap: Record<string, CulturalLanguage> = {
      "fort worth": "en",
      "dallas": "en",
      "nairobi": "sw",
      "kampala": "lg",
      "accra": "ak",
      "johannesburg": "zu",
      "lagos": "yo",
      "cape town": "zu",
      "nairobi": "sw",
    };
    return regionMap[neighborhoodRegion.toLowerCase()] || "en";
  }

  // Default: English
  return "en";
}
