/**
 * locale-utils.ts — Global locale detection for Niakofa
 *
 * Detects user locale (units, language) and resolves IP-based fallback
 * location when browser GPS is unavailable. Covers all diaspora and
 * African communities the platform serves.
 */

// Countries that use Imperial (miles/feet) — US, UK, Liberia, Myanmar
const IMPERIAL_REGIONS = new Set(["US", "GB", "LR", "MM"]);

// Mapbox Directions API supported language codes
// https://docs.mapbox.com/api/navigation/directions/#optional-parameters
export const MAPBOX_SUPPORTED_LANGS = new Set([
  "ar", "de", "en", "es", "fr", "it", "ja", "ko",
  "nl", "pt", "ru", "sw", "vi", "zh",
]);

// Map from app language code → full BCP-47 TTS locale (for Web Speech API).
// Where no exact region is universal, we pick the most widely-used variant.
const APP_LANG_TO_VOICE_LOCALE: Record<string, string> = {
  en: "en-US", es: "es-MX", fr: "fr-FR", pt: "pt-BR",
  sw: "sw-KE", so: "so-SO", am: "am-ET",
  yo: "yo-NG", ha: "ha-NG", ig: "ig-NG",
  tw: "ak-GH",   // Akan/Twi — ISO 639-1 is "ak"
  wo: "wo-SN", ht: "ht-HT", ar: "ar-SA", zu: "zu-ZA",
};

/**
 * Get the app's currently selected language code (e.g. "sw", "fr", "yo").
 * Prefers the stored app preference over browser locale.
 */
export function getAppLanguage(): string {
  try {
    return localStorage.getItem("niakofa_lang") ?? "en";
  } catch {
    return "en";
  }
}

/**
 * Detect whether the user's locale uses metric or imperial units.
 * Uses navigator.language region tag and timezone as signals.
 */
export function detectUnits(): "metric" | "imperial" {
  try {
    const lang = navigator.language ?? "en-US";
    const region = lang.split("-")[1]?.toUpperCase() ?? "";
    if (IMPERIAL_REGIONS.has(region)) return "imperial";

    // Secondary: check timezone — US-specific timezones
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const US_TZ_PREFIXES = [
      "America/New_York", "America/Chicago", "America/Denver",
      "America/Los_Angeles", "America/Phoenix", "America/Anchorage",
      "America/Honolulu", "America/Indiana", "America/Detroit",
      "America/Kentucky", "America/North_Dakota",
    ];
    if (US_TZ_PREFIXES.some(us => tz.startsWith(us))) return "imperial";
  } catch {
    // ignore — fall through to metric
  }
  return "metric";
}

/**
 * Get the best Mapbox Directions API language code.
 * Prefers stored app language → browser locale → "en".
 * Languages unsupported by Mapbox (yo, ig, ha, tw, wo, etc.) fall back to "en"
 * since Mapbox voice is English-only for those — Nia handles in-language text.
 */
export function detectMapLanguage(): string {
  try {
    // Prefer the user's explicit app language choice
    const appLang = getAppLanguage();
    if (MAPBOX_SUPPORTED_LANGS.has(appLang)) return appLang;

    // Fall back to browser locale language tag
    const lang = navigator.language ?? "en";
    const primary = lang.split("-")[0].toLowerCase();
    return MAPBOX_SUPPORTED_LANGS.has(primary) ? primary : "en";
  } catch {
    return "en";
  }
}

/**
 * Get the BCP-47 locale tag for TTS voice selection (Web Speech API).
 * Prefers stored app language (with full locale mapping) → browser locale.
 */
export function detectVoiceLocale(): string {
  try {
    const appLang = getAppLanguage();
    if (APP_LANG_TO_VOICE_LOCALE[appLang]) return APP_LANG_TO_VOICE_LOCALE[appLang];
    return navigator.language ?? "en-US";
  } catch {
    return "en-US";
  }
}

/**
 * Select the best available TTS voice for the given locale.
 * Tries exact match → language-root match → any non-local voice → default.
 */
export function pickBestVoice(locale: string): SpeechSynthesisVoice | null {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  const lang = locale.split("-")[0].toLowerCase();

  // 1. Exact locale, prefer cloud/network voice
  const exactCloud = voices.find(v => v.lang === locale && !v.localService);
  if (exactCloud) return exactCloud;
  const exact = voices.find(v => v.lang === locale);
  if (exact) return exact;

  // 2. Same language root, prefer cloud
  const rootCloud = voices.find(v => v.lang.split("-")[0].toLowerCase() === lang && !v.localService);
  if (rootCloud) return rootCloud;
  const root = voices.find(v => v.lang.split("-")[0].toLowerCase() === lang);
  if (root) return root;

  // 3. Any non-local voice
  const anyCloud = voices.find(v => !v.localService);
  if (anyCloud) return anyCloud;

  return null;
}

/**
 * Format a distance for display.
 * @param meters - distance in meters
 * @param units - "metric" | "imperial"
 */
export function formatDistance(meters: number, units: "metric" | "imperial"): string {
  if (units === "metric") {
    const km = meters / 1000;
    return km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
  }
  const mi = meters / 1609.34;
  return mi >= 10 ? `${Math.round(mi)} mi` : `${mi.toFixed(1)} mi`;
}

export interface IpLocation {
  lat: number;
  lng: number;
  city?: string;
  country?: string;
  countryCode?: string;
  zoom?: number;
}

/**
 * Get approximate user location from IP address using ipapi.co (free, no key).
 * Caches result for 24 hours. Times out after 3 s.
 * Returns null if unavailable.
 */
export async function getIpLocation(): Promise<IpLocation | null> {
  const CACHE_KEY = "niakofa_ip_location";
  const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 h

  // Return from cache if still valid
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const { data, ts } = JSON.parse(raw) as { data: IpLocation; ts: number };
      if (Date.now() - ts < CACHE_TTL) return data;
    }
  } catch { /* corrupt cache — ignore */ }

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 3000);
    const res = await fetch("https://ipapi.co/json/", { signal: controller.signal });
    clearTimeout(tid);
    if (!res.ok) return null;

    const json = await res.json() as {
      latitude?: number;
      longitude?: number;
      city?: string;
      country_name?: string;
      country_code?: string;
      error?: boolean;
    };

    if (json.error || !json.latitude || !json.longitude) return null;

    const data: IpLocation = {
      lat: json.latitude,
      lng: json.longitude,
      city: json.city,
      country: json.country_name,
      countryCode: json.country_code,
      zoom: 11, // City-level zoom
    };

    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
    } catch { /* quota — ignore */ }

    return data;
  } catch {
    return null; // Network error or abort
  }
}

/**
 * Localize Mapbox label layers after map load.
 * Falls back to English name → raw name for any layer that lacks the target language.
 */
export function localizeMapLabels(map: { setLayoutProperty: (layer: string, prop: string, value: unknown) => void }, lang: string): void {
  if (lang === "en") return; // en is the default; no change needed

  const labelLayers = [
    "country-label",
    "state-label",
    "settlement-label",
    "settlement-subdivision-label",
    "poi-label",
    "road-label",
    "waterway-label",
    "natural-point-label",
    "airport-label",
  ];

  const textField = [
    "coalesce",
    ["get", `name_${lang}`],
    ["get", "name_en"],
    ["get", "name"],
  ];

  for (const layer of labelLayers) {
    try {
      map.setLayoutProperty(layer, "text-field", textField);
    } catch {
      // Layer may not exist in this style — ignore
    }
  }
}
