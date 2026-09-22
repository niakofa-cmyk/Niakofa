/**
 * Niakofa / Nia AI — Voice Profile Registry
 *
 * Philosophy: Authentic community voices, not accent caricatures.
 *
 * Each profile represents a real speech community (AAVE, Nigerian English,
 * Jamaican English, etc.).  A profile only goes "live" (available: true) when
 * the corresponding ELEVENLABS_VOICE_<NAME> env var AND ELEVENLABS_API_KEY are
 * both set.  If either is missing, the endpoint still exists and is callable —
 * it simply falls back to the OpenAI "nova" voice.  This way:
 *
 *   1. The API never pretends to offer an authentic voice it doesn't have.
 *   2. A client settings screen can discover which voices are ready without
 *      any code changes once a voice is licensed.
 *   3. Operators can light up voices one at a time as licenses are acquired.
 *
 * What's left (code cannot do this for you):
 *   - License or record real voices via ElevenLabs Professional Voice Cloning,
 *     or license ElevenLabs' existing regional voices where available.
 *   - Set ELEVENLABS_VOICE_<PROFILE_KEY> + ELEVENLABS_API_KEY in Replit Secrets
 *     (or Railway env vars) — nothing else in the codebase changes.
 *   - Add a voice picker in account settings hitting GET /api/nia/voice/profiles
 *     so users choose their own Nia voice rather than having one auto-assigned
 *     (choice, not stereotype imposed by the app).
 *
 * Reference for ElevenLabs voice IDs:
 *   https://api.elevenlabs.io/v1/voices  (list all voices on your account)
 */

export interface VoiceProfile {
  /** Machine-readable key stored in user preferences (nia_voice_profile) */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Short description shown in the settings picker */
  description: string;
  /** Speech community this voice represents */
  community: string;
  /** BCP-47 language tag (used for browser TTS fallback) */
  bcp47: string;
  /**
   * ElevenLabs voice ID — populated from env var.
   * null means the voice is not yet licensed / configured.
   */
  elevenLabsVoiceId: string | null;
  /**
   * true  → ElevenLabs key + voice ID are configured; real voice available.
   * false → falls back to OpenAI nova (still works, just not community-authentic).
   */
  available: boolean;
}

/** All registered Nia voice profiles */
export const VOICE_PROFILES: Record<string, VoiceProfile> = {
  // ── African American Vernacular English ──────────────────────────────────
  aave_warm: {
    id: "aave_warm",
    name: "Nia — Warm AAVE",
    description: "Warm, expressive African American English — feels like family",
    community: "African American",
    bcp47: "en-US",
    elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_AAVE_WARM ?? null,
    available: !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_AAVE_WARM),
  },

  // ── West African — Nigerian English ─────────────────────────────────────
  nigerian_en: {
    id: "nigerian_en",
    name: "Nia — Nigerian English",
    description: "Clear, warm Nigerian English — grounded and energetic",
    community: "Nigerian",
    bcp47: "en-NG",
    elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_NIGERIAN_EN ?? null,
    available: !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_NIGERIAN_EN),
  },

  // ── Caribbean — Jamaican English ─────────────────────────────────────────
  jamaican_en: {
    id: "jamaican_en",
    name: "Nia — Jamaican English",
    description: "Vibrant, warm Jamaican English with natural rhythm",
    community: "Jamaican",
    bcp47: "en-JM",
    elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_JAMAICAN_EN ?? null,
    available: !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_JAMAICAN_EN),
  },

  // ── Southern Africa — South African English ──────────────────────────────
  south_african_en: {
    id: "south_african_en",
    name: "Nia — South African English",
    description: "Warm South African English — Ubuntu spirit in every word",
    community: "South African",
    bcp47: "en-ZA",
    elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_SOUTH_AFRICAN_EN ?? null,
    available: !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_SOUTH_AFRICAN_EN),
  },

  // ── West Africa — Ghanaian English ──────────────────────────────────────
  ghanaian_en: {
    id: "ghanaian_en",
    name: "Nia — Ghanaian English",
    description: "Bright, clear Ghanaian English full of community warmth",
    community: "Ghanaian",
    bcp47: "en-GH",
    elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_GHANAIAN_EN ?? null,
    available: !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_GHANAIAN_EN),
  },

  // ── East Africa — Kenyan English ─────────────────────────────────────────
  kenyan_en: {
    id: "kenyan_en",
    name: "Nia — Kenyan English",
    description: "Precise, warm Kenyan English — confident and caring",
    community: "Kenyan",
    bcp47: "en-KE",
    elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_KENYAN_EN ?? null,
    available: !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_KENYAN_EN),
  },

  // ── Caribbean — Haitian Creole / French Creole speaker ──────────────────
  haitian_en: {
    id: "haitian_en",
    name: "Nia — Haitian English",
    description: "Warm English with Haitian Creole warmth and rhythm",
    community: "Haitian",
    bcp47: "en-HT",
    elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_HAITIAN_EN ?? null,
    available: !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_HAITIAN_EN),
  },

  // ── Default — neutral, works without ElevenLabs ──────────────────────────
  default_en: {
    id: "default_en",
    name: "Nia — Standard",
    description: "Clear, warm standard English — always available",
    community: "General",
    bcp47: "en-US",
    elevenLabsVoiceId: null, // always falls back to OpenAI
    available: true, // always available (OpenAI fallback)
  },
};

/** Ordered list for the settings picker — community voices first, default last */
export const VOICE_PROFILE_LIST: VoiceProfile[] = [
  VOICE_PROFILES.aave_warm,
  VOICE_PROFILES.nigerian_en,
  VOICE_PROFILES.ghanaian_en,
  VOICE_PROFILES.kenyan_en,
  VOICE_PROFILES.south_african_en,
  VOICE_PROFILES.jamaican_en,
  VOICE_PROFILES.haitian_en,
  VOICE_PROFILES.default_en,
];

/**
 * Resolve a profile ID string to a VoiceProfile.
 * Falls back to default_en for unknown / missing IDs.
 */
export function resolveVoiceProfile(profileId: string | undefined | null): VoiceProfile {
  if (profileId && VOICE_PROFILES[profileId]) {
    return VOICE_PROFILES[profileId];
  }
  return VOICE_PROFILES.default_en;
}

/** ElevenLabs global API key */
export const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? null;

/** Base URL for ElevenLabs TTS v1 */
export const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";
