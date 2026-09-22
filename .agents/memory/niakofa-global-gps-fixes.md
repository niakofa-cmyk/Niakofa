---
name: Niakofa Global GPS & Location Fixes
description: AppContext hardcoded Fort Worth removed; IP fallback on GPS error; culturalGreetings detectUserLanguage localStorage-first; NiaDrawer CrisisStrip global emergency numbers; request-new IP map center.
---

## AppContext.tsx — No More Hardcoded Fort Worth

**Rule:** `myLocation` and `locationRef` must initialize to `null`. NEVER initialize to a hardcoded coordinate.

**Why:** A user in Lagos or London with GPS denied would silently be placed at Fort Worth (32.75, -97.33). Their help requests would be posted at Fort Worth coordinates. They would see Fort Worth helpers, not local ones.

**How to apply:**
- `useState<Location | null>(null)` — not a default city
- `useRef<Location | null>(null)` — same
- `tryIpFallback()` helper is called when:
  1. `navigator.geolocation` is undefined (no GPS hardware)
  2. `watchPosition` error callback fires (any error code: denied, timeout, unavailable)
- `tryIpFallback` guards: `if (locationRef.current) return;` — skips if GPS already delivered a fix
- `getIpLocation()` is imported from `./locale-utils` (ipapi.co, 24h localStorage cache)

## culturalGreetings.ts — detectUserLanguage() Priority

**Rule:** Check `localStorage.getItem("niakofa_lang")` BEFORE `navigator.language`.

**Why:** A user who changed their app language to Swahili in Settings expects Nia to greet them in Swahili, not revert to browser locale on next open.

**APP_LANG_TO_CULTURAL must cover ALL 15 i18n codes — no holes.**

| app code | CulturalLanguage | notes |
|---|---|---|
| en | en | |
| sw | sw | |
| zu | zu | |
| tw | tw | |
| yo | yo | |
| ha | ha | |
| am | am | |
| so | so | |
| lg | lg | |
| ig | pcm | closest voice profile |
| es | en | no ES cultural profile |
| fr | en | no FR cultural profile |
| pt | en | no PT cultural profile |
| wo | en | no WO cultural profile |
| ht | en | no HT cultural profile |
| ar | en | no AR cultural profile |

Missing codes fall through to `navigator.language` which breaks stored-preference priority.

## NiaDrawer — CrisisStrip & QuickPrompts

**CrisisStrip** now accepts `lang?: CulturalLanguage` prop.
- Title shows in sw/yo/ha/am/so/pcm based on userLang
- First row: "Emergency services → Call 112 (global) or 999 (UK)"
- Second row: "Emergency (US/Canada) → Call 911"
- Remaining rows: US-specific resources kept, labeled with "(US)" in title
- **Never** hardcode "Call 911" alone — 911 is US-only, 112 works globally

**QuickPrompts** now accepts `lang?: CulturalLanguage` prop.
- `getQuickPrompts(lang)` returns translated arrays for sw/yo/ha/am/so/pcm
- Falls back to English for zu/tw/lg and any unmapped language
- QUICK_PROMPTS_BY_LANG: object keyed by CulturalLanguage

Call sites in NiaDrawer render: `<CrisisStrip lang={userLang} />` and `<QuickPrompts lang={userLang} ... />`

## request-new.tsx — IP Fallback Map Center

**Rule:** Show the map with IP-approximate center when GPS is unavailable; do NOT show "Waiting for GPS…" as the only state.

**State:** `const [ipMapCenter, setIpMapCenter] = useState<{ lat; lng } | null>(null);`

**Effect (mount only):**
```tsx
useEffect(() => {
  if (myLocation || pinLocation) return;
  getIpLocation().then(loc => {
    if (!loc || pinLocation || myLocation) return;
    setIpMapCenter({ lat: loc.lat, lng: loc.lng });
  });
}, []);
```

**Map render condition:** `webGLSupported && (pinLocation ?? ipMapCenter)`
- When only ipMapCenter: zoom=11 (city level), overlay "Tap map to place your location"
- When pinLocation: zoom=14 (street level), draggable Marker
- Submit button still requires `pinLocation` — user must tap to confirm

**Import:** `import { getIpLocation } from "@/lib/locale-utils";`
