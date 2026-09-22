---
name: Niakofa Global Coverage — v2 comprehensive fixes
description: All gaps for Africa/diaspora/underserved US coverage; safety.ts FR/PT/HT/AR patterns; diacritic-free matching; nia.ts globally-aware emergency protocol; no unconditional "call 911".
---

## Crisis Safety Layer — safety.ts

### Languages now fully covered (crisis + soft-distress)
- English, Spanish, French, Portuguese, Haitian Creole, Arabic
- Swahili, Zulu, Twi, Yoruba, Hausa, Amharic, Somali, Nigerian Pidgin, Luganda, Igbo, Wolof

### Diacritic-free double-matching (CRITICAL)
```typescript
const accentless = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const isCrisis = CRISIS_PATTERNS.some(
  (p) => p.test(normalized) || p.test(accentless)
);
```
**Why:** Mobile users in PT/FR/ES communities often skip accent marks ("nao" not "não", "epuise" not "épuisé"). Without this, crisis patterns with diacritics silently fail on real user input. BOTH checks are required — the diacritic-preserving form is needed for Yoruba/Amharic/Twi which use accents meaningfully.

**Same fix applied to:** SOFT_DISTRESS_PATTERNS, post-moderation.ts moderatePostText + moderateRequestText.

### Escalation message — regional emergency numbers
```
"112 (most of Europe & Africa) · 999 (UK) · 911 (US/Canada) · or your local emergency number"
```
**Never say:** "112 (global)" — 112 is NOT universal. It's widespread but not truly global.

## Nia System Prompt — nia.ts

### Emergency number rule
All 911/988 references must be either:
1. Scoped: "911 (US/Canada)", "988 (US)"
2. Paired with global alternative: "112 · 999 (UK) · 911 (US)"
3. Replaced with global-first: "call local emergency services (112 in most countries, 999 UK, 911 US/Canada)"

**Never:** bare "call 911" or "call 988" in non-US-specific context.

**Checked files:** nia.ts, NiaDrawer.tsx, safety.ts. All clear after this session.

### Underserved US communities (added to prompt)
Explicit guidance added for:
- **Rural Appalachia** — no condescension, no assumption of broadband/nearby services, substance use stigma context
- **Navajo Nation / tribal lands** — sovereignty/IHS context, respect for traditional healing, connectivity gaps, Navajo language note
- **South Texas border** — Spanish-primary, immigration sensitivity, mixed-status households, binational resources
- **Puerto Rico** — US territory (not foreign), Boricua identity, FEMA/Medicaid Puerto Rico-specific rules
- **Rural communities broadly** — ask about proximity before recommending resources

### Crisis Protocol section (lines ~423-437)
Structure now:
1. GLOBAL FIRST (112/999/911, findahelpline.com, befrienders.org)
2. US-specific clearly labeled
3. Fort Worth/Tarrant County specific

**Any future edit must preserve this order.**

## Post-Moderation — post-moderation.ts

### Portuguese ILLEGAL_SERVICE_PATTERNS added
Target community: São Paulo (largest African-descended pop. outside Africa), Angola, Mozambique.

Patterns cover: drugs (comprar/vender drogas, maconha, cocaína, heroína, fentanil), solicitation (prostituição, garota de programa), document fraud, hacking.

### Diacritic-free matching
Both `moderatePostText` and `moderateRequestText` now compute `accentless` and check both forms.

## request-active.tsx — Equatorial City Fix

### `?? 0` NOT `|| 0` for lat/lng
```tsx
start_lat: myLocation?.lat ?? 0,  // ✅
start_lng: myLocation?.lng ?? 0,  // ✅
// NOT:
start_lat: myLocation?.lat || 0,  // ❌ treats lat=0 (Kampala, Libreville) as falsy!
```
Kampala UG is at lat 0.3°N — with `|| 0`, this becomes 0 (Gulf of Guinea), routing to the ocean.

**Check:** any lat/lng arithmetic using `|| 0` anywhere in the codebase — all must use `?? 0`.

## Admin Panel — auto-refresh coverage

### WorkerHealth (admin.tsx) — 30s auto-refresh added
```tsx
useEffect(() => {
  loadHealth();
  loadHardship();
  const id = setInterval(loadHealth, 30_000);
  return () => clearInterval(id);
}, []);
```

### Sections that DO auto-refresh (60s or 30s)
- GlobalOpsSection: 60s ✅
- PoolBalanceBanner: 60s ✅
- WorkerHealth: 30s ✅ (added this session)

### Sections that do NOT auto-refresh (static)
- UsersTab, HelpersTab, PledgePoolDashboard, AuditLogTable, NiaTab, AnalyticsTab, SettingsTab, ReportsTab
- These fetch on mount and require manual reload/tab switch to refresh
- Not a bug — data doesn't change rapidly enough to warrant background polling

## NiaDrawer.tsx — Fallback error strings

All error/fallback messages (Nia unavailable, rate-limit, stream error, network error) now show:
```
"Emergency: 112 (global) · 999 (UK) · 911 (US). Crisis support: findahelpline.com"
```
Footer line: "Emergency: 112 · 999 · 911 · Crisis: findahelpline.com"
