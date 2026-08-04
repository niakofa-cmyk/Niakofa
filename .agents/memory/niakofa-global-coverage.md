---
name: Niakofa Global Coverage — locale, navigation, Nia multilingual
description: Key patterns and pitfalls from the Global Coverage feature (locale detection, IP fallback map, multilingual safety/moderation, language switcher).
---

## locale-utils.ts patterns

**Preference order for language detection:**
1. `localStorage.getItem("niakofa_lang")` (user's app preference)
2. `navigator.language` browser locale
3. Fallback to "en"

Both `detectMapLanguage()` and `detectVoiceLocale()` follow this order. Always check app preference first.

**Why:** Users who manually switch app language to "sw" must get Swahili navigation voice, not English — browser locale and app language diverge for diaspora users.

**IP geolocation fallback for map:**
- `getIpLocation()` is async — `initialViewState` is read at mount, so must also call `mapRef.current?.jumpTo()` when fallback resolves later.
- Cache key: `niakofa_ip_location` in localStorage, 24h TTL.
- Endpoint: `https://ipapi.co/json/` — free, no key needed, 3s timeout.

**Mapbox label localization:**
- Call `localizeMapLabels(map, lang)` in `onLoad` callback.
- Uses `["coalesce", ["get", "name_${lang}"], ["get", "name_en"], ["get", "name"]]` — graceful fallback chain.
- No-op when lang is "en" (already the default).

**TTS voice selection:**
- `pickBestVoice(locale)` — returns null if voices not yet loaded (first call timing gap).
- Always set `utt.lang = locale` even if no voice found — browser uses its default for that language.
- APP_LANG_TO_VOICE_LOCALE maps app language codes to full BCP-47 TTS locales (e.g. "sw" → "sw-KE").

## Navigation API

**Mapbox Directions API language support:**
- Supported: ar, de, en, es, fr, it, ja, ko, nl, pt, ru, sw, vi, zh
- NOT supported: yo, ha, ig, tw, wo, so, am, ht, zu — these fall back to "en" for voice
- Navigation cache key MUST include lang+units to avoid cross-locale cache poisoning.
- `voice_units=metric` (km) vs `voice_units=imperial` (miles) — driven by user locale, not hardcoded.

## Auto-assign dispatch

**Radius:** configurable via `?radius_miles` (default 10, max 50). Old hardcoded 5 was too small for rural/sparse areas.

**CRITICAL:** lat/lng 0 is valid (equator/prime meridian). Always use `!= null` checks, never truthy `&&` checks on coordinates.

## i18n

**Partial translations:** Use `function p(partial: Partial<typeof en>): typeof en { return partial as typeof en; }`. Missing keys fall back to English via `fallbackLng: "en"`. The cast suppresses TypeScript errors — i18next handles fallback at runtime.

**15 languages:** en, es, fr, pt, sw, so, am, yo, ha, ig, tw, wo, ht, ar, zu.

## Safety patterns

**Igbo (ig) and Wolof (wo) crisis patterns** added to nia-service/src/lib/safety.ts.

**Same rule as all African patterns:** No `\b` word boundaries — Igbo uses dotted characters (ị, ọ, ụ), Wolof uses apostrophes. Both break ASCII word boundary matching.

## Content moderation

**Multilingual ILLEGAL_SERVICE_PATTERNS** now covers: English, French (fr), Swahili (sw), Arabic (ar), Yoruba (yo), Somali (so).

**Phone spam regex** internationalized: E.164 `\+\d{1,3}...`, US NANP, African/European `0xx`-prefixed patterns.

## How to apply

- Any new locale feature: check `getAppLanguage()` first, then browser locale.
- New language added to switcher: add to i18n.ts translations, APP_LANG_TO_VOICE_LOCALE mapping, and Nia LANGUAGE ADAPTATION section.
- New safety crisis language: add no-\\b patterns to both CRISIS_PATTERNS and SOFT_DISTRESS_PATTERNS in nia-service/src/lib/safety.ts.
