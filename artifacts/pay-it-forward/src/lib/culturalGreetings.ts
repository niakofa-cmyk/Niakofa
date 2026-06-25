// Niakofa Native Language System — Phase 7a
// Greetings, prompts, and responses in community-first languages

export type CulturalLanguage = "en" | "sw" | "zu" | "tw" | "yo" | "ha" | "am" | "so";

export interface CulturalProfile {
  language: CulturalLanguage;
  wakeWords: string[];
  greeting: string;
  greetingResponse: string;
  helpPrompt: string;
  thankYou: string;
  goodbye: string;
  listeningPrompt: string;
  errorMessage: string;
  niaIntro: string;
}

export const CULTURAL_PROFILES: Record<CulturalLanguage, CulturalProfile> = {
  en: {
    language: "en",
    wakeWords: ["hey nia", "nia", "hi nia"],
    greeting: "Hey Nia",
    greetingResponse: "Hey! I'm Nia. How can I support you today?",
    helpPrompt: "What do you need help with?",
    thankYou: "Thank you",
    goodbye: "Goodbye",
    listeningPrompt: "I'm listening...",
    errorMessage: "I didn't catch that. Try again?",
    niaIntro: "I'm Nia, your community companion. I'm here to help you give and receive support.",
  },
  sw: {
    language: "sw",
    wakeWords: ["hujambo nia", "nia", "habari nia", "sawa nia"],
    greeting: "Hujambo Nia",
    greetingResponse: "Sijambo! Mimi ni Nia. Nawezaje kukusaidia leo?",
    helpPrompt: "Unahitaji msaada gani?",
    thankYou: "Asante",
    goodbye: "Kwaheri",
    listeningPrompt: "Nasikiliza...",
    errorMessage: "Sikuelewa. Jaribu tena?",
    niaIntro: "Mimi ni Nia, msaidizi wako wa jamii. Niko hapa kukusaidia kutoa na kupokea msaada.",
  },
  zu: {
    language: "zu",
    wakeWords: ["sawubona nia", "nia", "yebo nia"],
    greeting: "Sawubona Nia",
    greetingResponse: "Yebo! Ngingu-Nia. Ngingakusiza kanjani namuhla?",
    helpPrompt: "Udinga usizo ngani?",
    thankYou: "Ngiyabonga",
    goodbye: "Sala kahle",
    listeningPrompt: "Ngiyalalela...",
    errorMessage: "Angizwanga. Zama futhi?",
    niaIntro: "NginguNia, umngane wakho womphakathi. Ngilapha ukukusiza ukupha nokwamukela usizo.",
  },
  tw: {
    language: "tw",
    wakeWords: ["mema wo akye nia", "nia", "agoo nia"],
    greeting: "Mema wo akye Nia",
    greetingResponse: "Yaa! Me din de Nia. Ɛhe na mehwɛ wo?",
    helpPrompt: "Wohia mmoa bɛn?",
    thankYou: "Meda wo ase",
    goodbye: "Nante yie",
    listeningPrompt: "Metie...",
    errorMessage: "Mente aseɛ. Bɔ bio?",
    niaIntro: "Me din de Nia, wo community companion. Mewɔ ha sɛ mehwɛ wo ma wo de boa fa.",
  },
  yo: {
    language: "yo",
    wakeWords: ["e kaaro nia", "nia", "e kaasan nia", "e kaaale nia"],
    greeting: "E kaaro Nia",
    greetingResponse: "Ẹ káàbọ̀! Orúkọ mi ni Nia. Báwo ni mo ṣe lè ràn ọ́ lọ́wọ́ lónì?",
    helpPrompt: "Kí ni o nilo ìrànlọ́wọ́ pẹ̀lú?",
    thankYou: "E se",
    goodbye: "O dabo",
    listeningPrompt: "Mo n gbọ́...",
    errorMessage: "미 kò gbọ́ iyen. Gbiyanju lẹ́ẹ̀kan si?",
    niaIntro: "Orúkọ mi ni Nia, ẹlẹgbẹ́ àwùjọ rẹ. Mo wà níbí láti ràn ọ́ lọ́wọ́ láti fún àti gba àtìlẹ́yìn.",
  },
  ha: {
    language: "ha",
    wakeWords: ["sannu nia", "nia", "ina kwana nia"],
    greeting: "Sannu Nia",
    greetingResponse: "Sannu! Sunana Nia ne. Ta yaya zan iya taimaka maka yau?",
    helpPrompt: "Menene kake bukata taimako?",
    thankYou: "Na gode",
    goodbye: "Sai anjima",
    listeningPrompt: "Ina sauraro...",
    errorMessage: "Ban ji ba. Sake gwadawa?",
    niaIntro: "Sunana Nia ne, abokin al'ummar ka. Ina nan don taimaka maka wajen ba da karɓar tallafi.",
  },
  am: {
    language: "am",
    wakeWords: ["selam nia", "nia", "tena yistilign nia"],
    greeting: "Selam Nia",
    greetingResponse: "Selam! Sime Nia new። Lante lemalet endemichwalen?",
    helpPrompt: "Yemanteneger yemiyasfelgiw gudayoch men nachew?",
    thankYou: "Ameseginalehu",
    goodbye: "Dehna hun",
    listeningPrompt: "Esmalehu...",
    errorMessage: "Algebagnm። Megche yigebalen?",
    niaIntro: "Sime Nia new, ye community akabiwo nachew። Yemereda ena ye meret agebabochih lasigiz ilina nekhew.",
  },
  so: {
    language: "so",
    wakeWords: ["nabad nia", "nia", "assalamu calaykum nia"],
    greeting: "Nabad Nia",
    greetingResponse: "Nabad! Magacaygu waa Nia. Sideen kuu caawin karaa maanta?",
    helpPrompt: "Maxaad u baahan tahay caawimaad?",
    thankYou: "Mahadsanid",
    goodbye: "Nabad gelyo",
    listeningPrompt: "Waan dhageysanayaa...",
    errorMessage: "Ma maqlin. Mar kale isku day?",
    niaIntro: "Magacaygu waa Nia, saaxiibkaaga bulshada. Halkan ayaan u joognaa si aan kaa caawiyo inaad bixiso oo aad hesho taageero.",
  },
};

// Detect language from browser/system settings
export function detectUserLanguage(): CulturalLanguage {
  const browserLang = navigator.language?.toLowerCase() || "en";

  if (browserLang.startsWith("sw")) return "sw";
  if (browserLang.startsWith("zu")) return "zu";
  if (browserLang.startsWith("tw") || browserLang.startsWith("ak")) return "tw";
  if (browserLang.startsWith("yo")) return "yo";
  if (browserLang.startsWith("ha")) return "ha";
  if (browserLang.startsWith("am")) return "am";
  if (browserLang.startsWith("so")) return "so";

  return "en";
}

// Match a spoken phrase to a wake word across all languages
export function matchWakeWord(transcript: string): CulturalLanguage | null {
  const lower = transcript.toLowerCase().trim();
  for (const [lang, profile] of Object.entries(CULTURAL_PROFILES)) {
    if (profile.wakeWords.some((w) => lower.includes(w))) {
      return lang as CulturalLanguage;
    }
  }
  return null;
}

export function getProfile(lang: CulturalLanguage): CulturalProfile {
  return CULTURAL_PROFILES[lang] || CULTURAL_PROFILES["en"];
}
