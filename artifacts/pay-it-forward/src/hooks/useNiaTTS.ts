// useNiaTTS — Phase 7b: Nia speaks back in community language
// Uses browser-native Web Speech Synthesis API (zero dependencies)

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
};

interface UseNiaTTSOptions {
  enabled?: boolean;
  rate?: number;
  pitch?: number;
}


// ── Phonetic hint table (Phase 7c) ───────────────────────────────────────────
// Browser TTS engines mangle African language phrases when falling back to
// en-US voice. These substitutions guide pronunciation without requiring
// a custom voice model. Strategy: approximate phonetics in Latin script
// that the en-US engine will render closer to the correct sound.
//
// Format: [original, phonetic approximation]
// Applied only when the target language voice is unavailable (fallback).

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
};

function applyPhoneticHints(text: string, lang: CulturalLanguage): string {
  // Check if a native voice is available for this language
  const voices = window.speechSynthesis.getVoices();
  const bcp = LANG_BCP47[lang];
  const hasNativeVoice = voices.some((v) => v.lang.startsWith(bcp.split("-")[0]));

  // If the browser has a real voice for this language, don't rewrite —
  // the native voice handles pronunciation correctly.
  if (hasNativeVoice) return text;

  // No native voice — apply phonetic rewrites so en-US TTS sounds closer
  const hints = PHONETIC_HINTS[lang] ?? [];
  let out = text;
  for (const [original, phonetic] of hints) {
    out = out.replace(new RegExp(original, "gi"), phonetic);
  }
  return out;
}

export function useNiaTTS({ enabled = true, rate = 0.92, pitch = 1.05 }: UseNiaTTSOptions = {}) {
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback((text: string, language: CulturalLanguage = "en") => {
    if (!enabled || !("speechSynthesis" in window)) return;

    // Cancel any current speech
    window.speechSynthesis.cancel();

    // Phase 7c: phonetic substitution so browser TTS pronounces African
    // phrases correctly. We rewrite before passing to the utterance.
    const phoneticText = applyPhoneticHints(text, language);

    const utterance = new SpeechSynthesisUtterance(phoneticText);
    utterance.lang = LANG_BCP47[language] ?? "en-US";
    utterance.rate = rate;
    utterance.pitch = pitch;

    // Pick best available voice for the language
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find(
      (v) => v.lang.startsWith(utterance.lang.split("-")[0])
    );
    if (match) utterance.voice = match;

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [enabled, rate, pitch]);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
  }, []);

  const isSupported = "speechSynthesis" in window;

  return { speak, stop, isSupported };
}
