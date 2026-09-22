// foodIntent.ts — Phase 7c
// Detects when a user signals food insecurity (explicitly or implicitly)
// so Nia can surface resources without making them ask.
//
// Philosophy: we never assume. We listen for signals, build a confidence score,
// and respond with care — not a diagnosis.

export type FoodIntentSignal =
  | "explicit_no"      // "no", "haven't", "nope" in response to "have you eaten?"
  | "implicit_no"      // "not yet", "been busy", "no money", "can't afford"
  | "distress"         // "I'm hungry", "starving", "nothing in the house"
  | "deflection"       // "I'm fine" after a care check (may need gentle follow-up)
  | "affirmative"      // "yes", "I ate", "I'm good"
  | "none";            // no food signal detected

export interface FoodIntentResult {
  signal: FoodIntentSignal;
  confidence: number;       // 0–1
  shouldSurfaceResources: boolean;
  followUpPrompt?: string;  // what Nia should say if confidence is medium
}

// Phrases that strongly suggest food need
const EXPLICIT_NO = [
  "no", "nope", "nah", "haven't", "have not", "didn't", "did not",
  "not yet", "not today", "no i haven't", "no i have not",
  // Swahili
  "bado", "sijala", "hapana",
  // Akan/Twi
  "daabi", "mente",
  // Yoruba
  "rara", "mi o jẹun",
  // Zulu
  "cha", "angidlanga",
  // Hausa
  "a'a", "ban ci",
  // Somali
  "maya", "ma cunin",
  // Amharic
  "aydelem", "albelam",
  // Luganda
  "nedda", "sirikuriire",
];

const IMPLICIT_NO = [
  "not really", "been busy", "forgot", "no money", "can't afford",
  "nothing at home", "nothing in the house", "empty fridge", "broke",
  "struggling", "tight", "don't have", "ran out", "no food",
  "hungry", "starving", "haven't had a chance",
  // cross-language hunger signals
  "njaa",        // Swahili: hunger
  "ebi",         // Yoruba: hunger
  "yunwa",       // Hausa: hunger
  "gose",        // Amharic: hunger
  "gaajo",       // Somali: hunger
  "enjala",      // Luganda: hunger
];

const DISTRESS = [
  "i'm hungry", "im hungry", "very hungry", "so hungry", "starving",
  "haven't eaten all day", "nothing to eat", "no food at home",
  "kids haven't eaten", "kids are hungry", "my kids", "my children",
  "nothing in the fridge", "empty", "we have nothing",
];

const AFFIRMATIVE = [
  "yes", "yeah", "yep", "yup", "i did", "i ate", "i have", "i'm good",
  "i'm okay", "already ate", "just ate", "had breakfast", "had lunch",
  "had dinner", "ndio",   // Swahili yes
  "aane",                  // Twi yes
  "bẹẹni",                 // Yoruba yes
  "ii",                    // Hausa yes
  "yebo",                  // Zulu yes
  "haa",                   // Somali yes
  "awo",                   // Amharic yes
  "yee",                   // Luganda yes
];

const DEFLECTION = [
  "i'm fine", "im fine", "fine", "okay", "ok", "don't worry",
  "it's fine", "its fine", "never mind", "i'll be okay",
];

function score(text: string, patterns: string[]): number {
  const lower = text.toLowerCase().trim();
  let hits = 0;
  for (const p of patterns) {
    if (lower.includes(p)) hits++;
  }
  return Math.min(hits / 1, 1); // cap at 1
}

export function detectFoodIntent(
  userMessage: string,
  priorNiaMessage: string = ""
): FoodIntentResult {
  const wasCarCheck = /eaten|chop|umeshakula|woadi|jẹun|ci abinci|ma cuntay|beltehal|olidde/i.test(priorNiaMessage);

  const explicitScore = score(userMessage, EXPLICIT_NO);
  const implicitScore = score(userMessage, IMPLICIT_NO);
  const distressScore = score(userMessage, DISTRESS);
  const affirmScore   = score(userMessage, AFFIRMATIVE);
  const deflectScore  = score(userMessage, DEFLECTION);

  // Strong affirmative — no resources needed
  if (affirmScore > 0 && distressScore === 0 && explicitScore === 0) {
    return { signal: "affirmative", confidence: affirmScore, shouldSurfaceResources: false };
  }

  // Distress — highest priority
  if (distressScore > 0) {
    return {
      signal: "distress",
      confidence: Math.min(0.6 + distressScore * 0.4, 1),
      shouldSurfaceResources: true,
    };
  }

  // Explicit no — especially after a care check
  if (explicitScore > 0) {
    return {
      signal: "explicit_no",
      confidence: wasCarCheck ? 0.92 : 0.65,
      shouldSurfaceResources: true,
    };
  }

  // Implicit signals
  if (implicitScore > 0) {
    return {
      signal: "implicit_no",
      confidence: Math.min(0.45 + implicitScore * 0.3, 0.85),
      shouldSurfaceResources: implicitScore >= 1,
      followUpPrompt: implicitScore < 1
        ? "Just want to make sure — do you have what you need to eat today?"
        : undefined,
    };
  }

  // Deflection after a care check — soft follow-up
  if (deflectScore > 0 && wasCarCheck) {
    return {
      signal: "deflection",
      confidence: 0.35,
      shouldSurfaceResources: false,
      followUpPrompt: "Of course. And if you ever need help finding food, I know some good spots nearby.",
    };
  }

  return { signal: "none", confidence: 0, shouldSurfaceResources: false };
}

// ── Habit tracking (sessionStorage) ──────────────────────────────────────────
// Tracks whether this user has signaled food need before in this session,
// so Nia can be more proactive without repeating herself.

const FOOD_SIGNAL_KEY = "nia_food_signal_count";
const FOOD_RESOURCE_SHOWN_KEY = "nia_food_resources_shown";

export function recordFoodSignal(): void {
  const count = parseInt(sessionStorage.getItem(FOOD_SIGNAL_KEY) ?? "0", 10);
  sessionStorage.setItem(FOOD_SIGNAL_KEY, String(count + 1));
}

export function getFoodSignalCount(): number {
  return parseInt(sessionStorage.getItem(FOOD_SIGNAL_KEY) ?? "0", 10);
}

export function markFoodResourcesShown(): void {
  sessionStorage.setItem(FOOD_RESOURCE_SHOWN_KEY, "1");
}

export function foodResourcesAlreadyShown(): boolean {
  return sessionStorage.getItem(FOOD_RESOURCE_SHOWN_KEY) === "1";
}

// ── Food resource message builder ─────────────────────────────────────────────
// Builds a warm, specific food resource message.
// Keeps it short — 2–3 resources max, not a wall of text.

import type { CulturalLanguage } from "./culturalGreetings";
import { getTimeOfDay } from "./culturalGreetings";

interface FoodResourceOptions {
  lang?: CulturalLanguage;
  userName?: string | null;
  location?: { lat: number; lon: number } | null;
  signal: FoodIntentSignal;
  isRepeat?: boolean;
}

export function buildFoodResourceMessage(opts: FoodResourceOptions): string {
  const { lang = "en", userName, signal, isRepeat } = opts;
  const tod = getTimeOfDay();
  const name = userName ? `, ${userName}` : "";
  const isDistress = signal === "distress";
  const isRepeatSignal = isRepeat && getFoodSignalCount() > 1;

  const opener: Record<CulturalLanguage, string> = {
    en:  isDistress
           ? `Let me help you find food right now${name}.`
           : `I've got you${name}. Here's where you can get food today:`,
    sw:  `Niko hapa kukusaidia kupata chakula${name}.`,
    zu:  `Ngilapha ukukusiza ukuthola ukudla${name}.`,
    tw:  `Mewɔ ha sɛ mehwɛ wo ama wo de aduan${name}.`,
    yo:  `Mo wà níbí láti ràn ọ́ lọ́wọ́ láti rí oúnjẹ${name}.`,
    ha:  `Ina nan don taimaka maka nemo abinci${name}.`,
    am:  `Migib lasigiz lante neno yimetal${name}.`,
    so:  `Halkan ayaan u joognaa si aan kaaga caawiyo helitaanka cunto${name}.`,
    pcm: isDistress
           ? `Make I help you find food sharp sharp${name}.`
           : `I gatchu${name}. See where you fit get food today:`,
    lg:  `Ndi wano okukuyamba okufuna emmere${name}.`,
  };

  // Local food resources (Fort Worth area) — time-aware; national: 211, feedingamerica.org
  const morningResources = [
    "🍽️ **Tarrant Area Food Bank** — open Mon–Fri 8am–5pm · tarrantareafoodbank.org",
    "📱 **Text FOOD to 877-877** — connects you to local food pantries right now",
    "☎️ **211 Texas** — call or text 211, available 24/7, finds food near you",
  ];
  const afternoonResources = [
    "📱 **Text FOOD to 877-877** — immediate pantry locations near you",
    "🍽️ **Tarrant Area Food Bank** — tarrantareafoodbank.org · 817-332-6226",
    "🏪 **Catholic Charities Fort Worth** — food pantry, no appointment needed some days · 817-534-0814",
  ];
  const eveningResources = [
    "🏠 **Presbyterian Night Shelter** — hot meals served evenings · 817-632-0000",
    "📱 **Text FOOD to 877-877** — 24/7 food resource locator",
    "☎️ **211 Texas** — text 211 for evening and weekend food options",
  ];
  const nightResources = [
    "🏠 **Presbyterian Night Shelter** — meals available · 817-632-0000",
    "☎️ **211 Texas** — text or call 211 anytime, even at night",
    "📱 **Text FOOD to 877-877** — finds what's open near you right now",
  ];

  const resources = {
    morning: morningResources,
    afternoon: afternoonResources,
    evening: eveningResources,
    night: nightResources,
  }[tod];

  const closer = isRepeatSignal
    ? "\n\nI notice this comes up for you. Would it help to set up a recurring food request on Niakofa so neighbors can bring groceries on a regular schedule?"
    : "\n\nYou don't have to go through this alone. I'm right here.";

  return `${opener[lang] ?? opener.en}\n\n${resources.join("\n")}${closer}`;
}
