// useNiaTTS — Nia speaks back in community language
//
// Priority chain:
//   1. Server-side TTS: POST /api/nia/voice/speak (ElevenLabs community voice
//      if licensed, OpenAI nova as fallback) — plays real audio, honors the
//      user's saved nia_voice_profile preference from localStorage.
//   2. Browser Web Speech API — zero-dependency fallback when the server call
//      fails (OPENAI_API_KEY not set, network error, user is offline, etc.).
//      African language phonetic hints are applied before passing text to the
//      browser engine so pronunciation is as close as possible.
//
// Voice profile is stored in localStorage as "nia_voice_profile" (e.g.
// "nigerian_en", "aave_warm", "default_en"). The settings screen should write
// this key when the user picks a voice from GET /api/nia/voice/profiles.

import { useCallback, useRef } from "react";
import { CulturalLanguage } from "../lib/culturalGreetings";

const LANG_BCP47: Record<CulturalLanguage, string> = {
  en: "en-US",
  sw: "sw-KE",
  zu: "zu-ZA",
  tw: "ak-GH",
  yo: "yo-NG",
  ha: "ha-NG",
  am: "am-ET",
  so: "so-SO",
  pcm: "en-NG",
  lg: "lg-UG",
};

interface UseNiaTTSOptions {
  enabled?: boolean;
  rate?: number;
  pitch?: number;
}

// ── Phonetic hint table ───────────────────────────────────────────────────────
// Browser TTS engines mangle African language phrases when falling back to
// en-US voice. These substitutions guide pronunciation without requiring
// a custom voice model — applied only when the target language voice is
// unavailable on the device.
const PHONETIC_HINTS: Record<string, [string, string][]> = {
  sw: [
    ["Umeshakula", "Oo-mesh-ah-KOO-lah"],
    ["Habari ya asubuhi", "Ha-BAH-ree yah ah-soo-BOO-hee"],
    ["Habari za mchana", "Ha-BAH-ree zah mm-CHA-nah"],
    ["Habari za jioni", "Ha-BAH-ree zah jee-OH-nee"],
    ["Sijambo", "See-JAM-boh"],
    ["Asante", "Ah-SAHN-teh"],
    ["Kwaheri", "Kwah-HEH-ree"],
    ["Nasikiliza", "Nah-see-kee-LEE-zah"],
    ["Niko hapa", "NEE-koh HAH-pah"],
    ["Sijala", "See-JAH-lah"],
    ["Bado", "BAH-doh"],
  ],
  zu: [
    ["Sawubona", "Sah-woo-BOH-nah"],
    ["Ngiyabonga", "Ngee-yah-BOHN-gah"],
    ["Ngiyalalela", "Ngee-yah-lah-LEH-lah"],
    ["Udle na", "Oo-DLEH nah"],
    ["Angidlanga", "Ahn-gee-DLAHN-gah"],
    ["NginguNia", "Ngee-ngoo-NEE-ah"],
    ["Ngilapha", "Ngee-LAH-pah"],
  ],
  tw: [
    ["Mema wo akye", "Meh-mah woh AH-cheh"],
    ["Woadi no de besi", "Woh-AH-dee noh deh BEH-see"],
    ["Woadi anpa", "Woh-AH-dee AHN-pah"],
    ["Meda wo ase", "Meh-dah woh AH-seh"],
    ["Nante yie", "NAHN-teh yee-EH"],
    ["Mewɔ ha", "Meh-woh HAH"],
    ["Akwaaba", "Ah-KWAH-bah"],
    ["daabi", "DAH-bee"],
  ],
  yo: [
    ["E kaaro", "Eh KAH-roh"],
    ["E kaasan", "Eh KAH-sahn"],
    ["E kaaale", "Eh KAH-leh"],
    ["Ẹ káàbọ̀", "Eh KAH-boh"],
    ["Ngiyabonga", "Ngee-yah-BOHN-gah"],
    ["Ṣe o ti jẹun", "Sheh oh tee JEH-oon"],
    ["Bawo ni", "BAH-woh nee"],
    ["O dabo", "Oh DAH-boh"],
    ["rara", "RAH-rah"],
  ],
  ha: [
    ["Ina kwana", "EE-nah KWAH-nah"],
    ["Ina yini", "EE-nah YEE-nee"],
    ["Barka da yamma", "BAR-kah dah YAH-mah"],
    ["Na gode", "Nah GOH-deh"],
    ["Sai anjima", "Sigh ahn-JEE-mah"],
    ["Ka ci abinci", "Kah chee ah-BEEN-chee"],
    ["Kana lafiya", "KAH-nah lah-FEE-yah"],
  ],
  am: [
    ["Selam", "SEH-lahm"],
    ["Tena yistilign", "Teh-nah yees-tee-LEEN"],
    ["Ameseginalehu", "Ah-meh-seh-gee-nah-LEH-hoo"],
    ["Dehna hun", "DEH-nah hoon"],
    ["Tewat beltehal", "Teh-WAHT bel-teh-HAHL"],
    ["Enjet beltehal", "En-JET bel-teh-HAHL"],
  ],
  so: [
    ["Subax wanaagsan", "Soo-BAHK wah-NAHG-sahn"],
    ["Galab wanaagsan", "GAH-lahb wah-NAHG-sahn"],
    ["Fiid wanaagsan", "Feed wah-NAHG-sahn"],
    ["Ma cuntay", "Mah COON-tay"],
    ["Mahadsanid", "Mah-hahd-SAH-nid"],
    ["Nabad gelyo", "NAH-bahd GEL-yoh"],
    ["Sideed tahay", "See-DEED tah-HY"],
    ["maya", "MAH-yah"],
  ],
  en: [], // no substitutions needed
  pcm: [
    ["How far", "How FAH"],
    ["I dey", "Ah DEY"],
    ["You don chop", "You don CHOP"],
    ["Wetin", "WEH-tin"],
    ["I gatchu", "Ah GOT-choo"],
  ],
  lg: [
    ["Wasuze otya", "Wah-SOO-zeh OH-tyah"],
    ["Osibye otya", "Oh-SEE-byeh OH-tyah"],
    ["Osiibye otya", "Oh-SEE-byeh OH-tyah"],
    ["Olidde", "Oh-LEE-deh"],
    ["Weebale", "Weh-BAH-leh"],
    ["Weeraba", "Weh-RAH-bah"],
    ["Nina Nia", "NEE-nah NEE-ah"],
    ["Ndi wano", "Ndee WAH-noh"],
  ],
};

function applyPhoneticHints(text: string, lang: CulturalLanguage): string {
  const voices = window.speechSynthesis.getVoices();
  const bcp = LANG_BCP47[lang];
  const hasNativeVoice = voices.some((v) => v.lang.startsWith(bcp.split("-")[0]));
  if (hasNativeVoice) return text; // native voice — no rewrite needed
  const hints = PHONETIC_HINTS[lang] ?? [];
  let out = text;
  for (const [original, phonetic] of hints) {
    out = out.replace(new RegExp(original, "gi"), phonetic);
  }
  return out;
}

// ── Server TTS helper ─────────────────────────────────────────────────────────
// Tries POST /api/nia/voice/speak. Returns an AudioContext-based player so the
// hook can cancel on re-render. Returns null on any failure (caller falls back
// to browser speechSynthesis).
async function tryServerTTS(
  text: string,
  token: string | null,
  voiceProfile: string
): Promise<{ stop: () => void } | null> {
  if (!token) return null;
  try {
    const resp = await fetch("/api/nia/voice/speak", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text, voiceProfile }),
      // AbortSignal.timeout is widely supported (Chrome 103+, Firefox 100+, Safari 16+).
      // Older browsers fall back to the speechSynthesis path below — acceptable.
      signal: typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
        ? AbortSignal.timeout(15_000)
        : undefined,
    });
    if (!resp.ok || !resp.body) return null;

    const arrayBuffer = await resp.arrayBuffer();
    if (!arrayBuffer.byteLength) return null;

    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    // Close the AudioContext when playback finishes naturally so contexts
    // don't accumulate (browsers cap them at ~6 per page).
    source.onended = () => { audioCtx.close().catch(() => {}); };
    source.start();

    return {
      stop: () => {
        try {
          source.stop(); // triggers onended → audioCtx.close()
        } catch {
          // already stopped; close directly as safety net
          audioCtx.close().catch(() => {});
        }
      },
    };
  } catch {
    return null; // network error, timeout, no key — silent fallback
  }
}

// ── Read auth token from localStorage (Niakofa storage key) ──────────────────
function getStoredToken(): string | null {
  try {
    return localStorage.getItem("niakofa_token") ?? null;
  } catch {
    return null;
  }
}

// ── Read saved voice profile from localStorage ────────────────────────────────
function getStoredVoiceProfile(): string {
  try {
    return localStorage.getItem("nia_voice_profile") ?? "default_en";
  } catch {
    return "default_en";
  }
}

export function useNiaTTS({ enabled = true, rate = 0.92, pitch = 1.05 }: UseNiaTTSOptions = {}) {
  const serverPlayerRef = useRef<{ stop: () => void } | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback(
    async (text: string, language: CulturalLanguage = "en") => {
      if (!enabled) return;

      // Stop any current playback
      serverPlayerRef.current?.stop();
      serverPlayerRef.current = null;
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();

      const voiceProfile = getStoredVoiceProfile();
      const token = getStoredToken();

      // ── Priority 1: Server TTS (ElevenLabs or OpenAI) ──────────────────
      if (token) {
        const player = await tryServerTTS(text, token, voiceProfile);
        if (player) {
          serverPlayerRef.current = player;
          return; // real audio playing — done
        }
      }

      // ── Priority 2: Browser Web Speech API (offline / no key fallback) ──
      if (!("speechSynthesis" in window)) return;

      const phoneticText = applyPhoneticHints(text, language);
      const utterance = new SpeechSynthesisUtterance(phoneticText);
      utterance.lang = LANG_BCP47[language] ?? "en-US";
      utterance.rate = rate;
      utterance.pitch = pitch;

      const voices = window.speechSynthesis.getVoices();
      const match = voices.find((v) => v.lang.startsWith(utterance.lang.split("-")[0]));
      if (match) utterance.voice = match;

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [enabled, rate, pitch]
  );

  const stop = useCallback(() => {
    serverPlayerRef.current?.stop();
    serverPlayerRef.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const isSupported =
    "speechSynthesis" in window ||
    !!getStoredToken(); // server TTS works even without browser support

  return { speak, stop, isSupported };
}
