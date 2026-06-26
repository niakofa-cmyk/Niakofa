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

// ── Time-of-day care greetings (Phase 7b) ────────────────────────────────────
// In many African cultures, greeting someone with "have you eaten?" is how you
// ask "are you okay?" — not a literal food question, but an act of care.

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

export function getTimeOfDay(): TimeOfDay {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

export interface CareGreeting {
  greeting: string;      // time-of-day greeting
  careCheck: string;     // "have you eaten?" / care follow-up
  combined: string;      // what Nia actually says on wake
}

// Returns the full wake-word greeting: time-aware + care check
export function getCareGreeting(lang: CulturalLanguage, userName?: string | null): CareGreeting {
  const tod = getTimeOfDay();
  const name = userName ? `, ${userName}` : "";

  const greetings: Record<CulturalLanguage, Record<TimeOfDay, CareGreeting>> = {
    en: {
      morning: {
        greeting: `Good morning${name}.`,
        careCheck: "Have you had something to eat this morning?",
        combined: `Good morning${name}. Have you had something to eat? I'm Nia — here whenever you need.`,
      },
      afternoon: {
        greeting: `Hey${name}, good afternoon.`,
        careCheck: "Have you eaten today?",
        combined: `Hey${name}, good afternoon. Have you eaten today? I'm Nia — here for whatever you need.`,
      },
      evening: {
        greeting: `Good evening${name}.`,
        careCheck: "Have you had a chance to eat?",
        combined: `Good evening${name}. Have you had a chance to eat? I'm Nia — always here.`,
      },
      night: {
        greeting: `Hey${name} — you're up late.`,
        careCheck: "Are you doing okay?",
        combined: `Hey${name} — you're up late. Are you doing okay? I'm Nia, I'm here.`,
      },
    },
    sw: {
      // Swahili (East Africa): "Habari ya asubuhi?" + "Umeshakula?"
      morning: {
        greeting: `Habari ya asubuhi${name}.`,
        careCheck: "Umeshakula?",
        combined: `Habari ya asubuhi${name}. Umeshakula? Mimi ni Nia — niko hapa ukihitaji chochote.`,
      },
      afternoon: {
        greeting: `Habari za mchana${name}.`,
        careCheck: "Umeshakula leo?",
        combined: `Habari za mchana${name}. Umeshakula leo? Mimi ni Nia — niko hapa.`,
      },
      evening: {
        greeting: `Habari za jioni${name}.`,
        careCheck: "Umekula chakula cha jioni?",
        combined: `Habari za jioni${name}. Umekula chakula cha jioni? Mimi ni Nia — niko hapa.`,
      },
      night: {
        greeting: `Mambo${name} — unakesha usiku.`,
        careCheck: "Uko sawa?",
        combined: `Mambo${name}. Uko sawa? Mimi ni Nia — niko hapa nawe.`,
      },
    },
    zu: {
      // Zulu: "Sawubona" (I see you) + care
      morning: {
        greeting: `Sawubona${name} — ngiyakubona.`,
        careCheck: "Udle na namuhla ekuseni?",
        combined: `Sawubona${name} — ngiyakubona. Udle na namuhla ekuseni? NginguNia — ngilapha.`,
      },
      afternoon: {
        greeting: `Sawubona${name}, ntambama enhle.`,
        careCheck: "Udle na namuhla?",
        combined: `Sawubona${name}. Udle na namuhla? NginguNia — ngilapha uma udinga usizo.`,
      },
      evening: {
        greeting: `Sawubona${name}, kusihlwa.`,
        careCheck: "Udlile na?",
        combined: `Sawubona${name}, kusihlwa. Udlile na? NginguNia — ngilapha nawe.`,
      },
      night: {
        greeting: `Sawubona${name} — ulele?`,
        careCheck: "Unjani namuhla?",
        combined: `Sawubona${name}. Unjani namuhla? NginguNia — ngilapha.`,
      },
    },
    tw: {
      // Akan/Twi: "Woadi no de besi nnε?" — have you eaten today?
      morning: {
        greeting: `Mema wo akye${name}.`,
        careCheck: "Woadi anpa?",
        combined: `Mema wo akye${name}. Woadi anpa? Me din de Nia — mewɔ ha ma wo.`,
      },
      afternoon: {
        greeting: `Mema wo aha${name}.`,
        careCheck: "Woadi no de besi nnε?",
        combined: `Mema wo aha${name}. Woadi no de besi nnε? Me din de Nia — mewɔ ha.`,
      },
      evening: {
        greeting: `Mema wo adwo${name}.`,
        careCheck: "Woadi anwummere?",
        combined: `Mema wo adwo${name}. Woadi anwummere? Me din de Nia — mewɔ ha ma wo.`,
      },
      night: {
        greeting: `Yaa${name} — wodae anaa?`,
        careCheck: "Wo ho te sɛn?",
        combined: `Yaa${name}. Wo ho te sɛn? Me din de Nia — mewɔ ha.`,
      },
    },
    yo: {
      // Yoruba: time-graded greetings + care
      morning: {
        greeting: `E kaaro${name}.`,
        careCheck: "Ṣe o ti jẹun owurọ?",
        combined: `E kaaro${name}. Ṣe o ti jẹun owurọ? Orúkọ mi ni Nia — mo wà níbí.`,
      },
      afternoon: {
        greeting: `E kaasan${name}.`,
        careCheck: "Ṣe o ti jẹun loni?",
        combined: `E kaasan${name}. Ṣe o ti jẹun loni? Orúkọ mi ni Nia — mo wà níbí fún ọ.`,
      },
      evening: {
        greeting: `E kaaale${name}.`,
        careCheck: "Ṣe o ti jẹun irọlẹ?",
        combined: `E kaaale${name}. Ṣe o ti jẹun irọlẹ? Orúkọ mi ni Nia — mo wà níbí.`,
      },
      night: {
        greeting: `Yaa${name} — o sun?`,
        careCheck: "Bawo ni o ṣe wa?",
        combined: `Yaa${name}. Bawo ni o ṣe wa? Orúkọ mi ni Nia — mo wà níbí.`,
      },
    },
    ha: {
      // Hausa: "Ina kwana?" (How did you sleep?) + food care
      morning: {
        greeting: `Ina kwana${name}?`,
        careCheck: "Ka ci abinci safe?",
        combined: `Ina kwana${name}? Ka ci abinci safe? Sunana Nia — ina nan domin kai.`,
      },
      afternoon: {
        greeting: `Ina yini${name}?`,
        careCheck: "Ka ci abinci yau?",
        combined: `Ina yini${name}? Ka ci abinci yau? Sunana Nia — ina nan.`,
      },
      evening: {
        greeting: `Barka da yamma${name}.`,
        careCheck: "Ka ci abincin dare?",
        combined: `Barka da yamma${name}. Ka ci abincin dare? Sunana Nia — ina nan nawe.`,
      },
      night: {
        greeting: `Sannu${name} — kana farkawa?`,
        careCheck: "Kana lafiya?",
        combined: `Sannu${name}. Kana lafiya? Sunana Nia — ina nan.`,
      },
    },
    am: {
      // Amharic: "Tena yistilign" + care
      morning: {
        greeting: `Selam${name}, tena yistilign.`,
        careCheck: "Tewat beltehal?",
        combined: `Selam${name}. Tewat beltehal? Sime Nia new — lante neno yimetal.`,
      },
      afternoon: {
        greeting: `Selam${name}.`,
        careCheck: "Enjet beltehal?",
        combined: `Selam${name}. Enjet beltehal? Sime Nia new — neh lasigiz ilina.`,
      },
      evening: {
        greeting: `Selam${name}, matum.`,
        careCheck: "Erat beltehal?",
        combined: `Selam${name}. Erat beltehal? Sime Nia new — neh lasigiz.`,
      },
      night: {
        greeting: `Selam${name} — tewash neh?`,
        careCheck: "Dena neh?",
        combined: `Selam${name}. Dena neh? Sime Nia new — imbi lante neno.`,
      },
    },
    so: {
      // Somali: "Ma cuntay?" — have you eaten?
      morning: {
        greeting: `Subax wanaagsan${name}.`,
        careCheck: "Ma cuntay subaxdii?",
        combined: `Subax wanaagsan${name}. Ma cuntay subaxdii? Magacaygu waa Nia — halkan ayaan u joognaa.`,
      },
      afternoon: {
        greeting: `Galab wanaagsan${name}.`,
        careCheck: "Ma cuntay maanta?",
        combined: `Galab wanaagsan${name}. Ma cuntay maanta? Magacaygu waa Nia — halkan ayaan u joognaa.`,
      },
      evening: {
        greeting: `Fiid wanaagsan${name}.`,
        careCheck: "Ma cuntay fiidkii?",
        combined: `Fiid wanaagsan${name}. Ma cuntay fiidkii? Magacaygu waa Nia — halkan.`,
      },
      night: {
        greeting: `Nabad${name} — ma toosaa?`,
        careCheck: "Sideed tahay?",
        combined: `Nabad${name}. Sideed tahay? Magacaygu waa Nia — halkan ayaan joognaa.`,
      },
    },
  };

  return greetings[lang]?.[tod] ?? greetings["en"][tod];
}

// Nigerian Pidgin care greeting (bonus — used when en is detected but location hints Nigeria)
export const NIGERIAN_PIDGIN_CARE: Record<TimeOfDay, string> = {
  morning: "Gud mornin! You don chop?",
  afternoon: "Gud afternoon! You don chop today?",
  evening: "Gud evening! You don chop?",
  night: "Hey — you dey okay?",
};

// Luganda care greeting (Uganda)
export const LUGANDA_CARE: Record<TimeOfDay, string> = {
  morning: "Wasuze otya nno? Olidde?",     // How did you sleep? Have you eaten?
  afternoon: "Osibye otya nno? Olidde?",   // How has your day been? Have you eaten?
  evening: "Osiibye otya nno? Olidde?",    // How was your evening? Have you eaten?
  night: "Otya? Oli bulungi?",             // How are you? Are you well?
};
