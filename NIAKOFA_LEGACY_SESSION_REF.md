# Niakofa Legacy — Session Reference File
> Keep until session is declared complete.

## Session Date: August 5, 2026

---

## Reference Assets Uploaded This Session

| File | Purpose |
|------|---------|
| `niakofa_panel1_home_1785952453433.png` | Full Niakofa Legacy Start Screen panel design (source truth) |
| `ChatGPT_Image_Aug_5,_2026_at_12_17_02_PM_1785952464301.png` | Cinematic background — baobab tree sunset scene |
| `ChatGPT_Image_Aug_5,_2026_at_12_30_25_PM_1785952495028.png` | Niakofa gold logo / emblem (The Living Family Legacy Experience) |

**Note:** The Aug 5 images were uploaded to the session but not written to disk. The existing `artifacts/pay-it-forward/public/legacy-living-family-reference.png` (1536×1024) serves as the cinematic background in the current build. If the new PNG files need to be saved to disk, they should be placed at:
- `artifacts/pay-it-forward/public/niakofa-legacy-bg.png`
- `artifacts/pay-it-forward/public/niakofa-legacy-logo.png`
- `artifacts/pay-it-forward/public/niakofa-legacy-panel.png`

### August 6 live-demo references

The latest uploaded references are now preserved in the live frontend:

| Asset | Live path | Use |
|------|------|------|
| Aug 5 panel overview | `artifacts/pay-it-forward/public/niakofa-legacy-live-demo.png` | House of Mensah live-demo visual |
| Aug 5 family tree | `artifacts/pay-it-forward/public/niakofa-legacy-family-tree-reference.png` | Family Tree / world reference |
| Aug 5 RPG screens | `artifacts/pay-it-forward/public/niakofa-legacy-rpg-reference.png` | Onboarding and chapter reference |

The `/legacy` hub now includes an interactive House of Mensah demo: artifacts can be placed in the house, the kitchen recipe thread can be unlocked, and the reunion scene links into the existing family quest flow. Placement progress is intentionally local demo state until the artifact model is connected to a family vault record.

### August 6, 2026 API contract verification

The Legacy frontend previously requested three retired Game Master endpoints (`today`,
`daily-welcome`, and `emotional-calendar`) from the hub, start screen, world-evolution
screen, and AI Director. Those requests produced avoidable 404s because the current API
exposes world evolution, seasonal events, ancestors, chapters, and active sessions instead.

The Legacy surfaces now use the live contracts:

- Today's Journey is derived from the selected ancestor plus the active/unlocked chapter.
- World activity and welcome cards use `world-evolution/:familyId/version-summary`.
- Calendar cards use `seasonal-events/:familyId` and normalize trigger dates locally.
- AI Director uses the same ancestor/chapter/session journey derivation.
- The House of Mensah demo continues to use the tracked `niakofa-legacy-live-demo.png`
  reference image. The newly uploaded Aug 5 panel PNG was not recoverable after the
  workspace reset, so it is not represented as a new tracked file.

---

## Work Completed This Session

### ✅ Phase 1 — Cinematic Start Screen (legacy-start-visual.tsx)
- **Complete rewrite** of `artifacts/pay-it-forward/src/components/legacy-start-visual.tsx`
- Design now matches the uploaded Niakofa panel reference exactly:
  - Cinematic hero background (baobab tree sunset scene)
  - Gold `N` emblem with ornate ring + serif lettermark
  - NIAKOFA title in gradient gold (Georgia/serif)
  - "THE LIVING FAMILY LEGACY EXPERIENCE" + "PLAY. DISCOVER. PRESERVE. HONOR."
  - **CONTINUE YOUR JOURNEY** — primary gold button (only shown when `hasJourney = true`)
  - **START NEW JOURNEY / GET STARTED** — secondary dark button → leads to `/legacy/start` (Awaken the Legacy workflow)
  - **Mode grid** (4 cols): Legacy Mode · Exploration · Family Quests · Reunion
  - **Bottom icon row** (6): Inventory · Journal · Map · Family · Quests · Settings
  - ❌ REMOVED: "Button States" section (Primary/Secondary/Icon Button/Hover/Pressed/Disabled)
  - ✅ ADDED: **YOUR FAMILY WORLD** card section:
    - World Version badge
    - "New since yesterday" label
    - Recent family activity checklist (Grandma recorded stories, Uncle tagged church, etc.)
    - AI unlocked chapter display
    - **Continue Journey** CTA button

### ✅ Phase 2 — legacy-home.tsx Wire-up
- Updated both `LegacyStartVisual` call sites in `legacy-home.tsx` to pass:
  - `worldVersion` — from `dailyWelcome.worldVersion` or `worldVersion.currentVersion`
  - `recentActivities` — from `dailyWelcome.recentChanges`
  - `currentChapterNumber` / `currentChapterTitle` — from active session or new chapters
  - `isAiUnlocked` — from `isAiEnabled`
  - All mode grid nav callbacks → `setActiveMode()` or route navigation
  - All bottom icon nav callbacks → appropriate routes

### ✅ Phase 3 — Navigation
- Bottom nav "Legacy" tab → `/legacy` → shows new Start Screen
- "Start New Journey" / "Get Started" button → `/legacy/start` (Awaken the Legacy workflow: ancestor selection cinematic)
- "Continue Journey" button → `/legacy/play`
- Mode grid → navigates to appropriate legacy sub-pages

---

## Architecture Notes

### Start Screen Logic (legacy-home.tsx)
```
User taps "Legacy" (bottom nav or settings)
  → /legacy (LegacyHomePage)
    ├── !ready (no family data): Shows LegacyStartVisual (isReady=false, hasJourney=false)
    │     └── "Get Started" button → /legacy/onboarding
    ├── ready + !setupDone: redirect → /legacy/onboarding
    └── ready + setupDone: Shows LegacyStartVisual (isReady=true)
          ├── hasJourney=true: Shows "Continue Your Journey" + "Start New Journey"
          └── hasJourney=false: Shows only "Start New Journey" button
                └── → /legacy/start (Awaken the Legacy: ancestor selection + cinematic)
```

### Awaken the Legacy Workflow (/legacy/start)
Lives in `artifacts/pay-it-forward/src/pages/legacy-start.tsx`:
1. Load ancestor candidates from `/api/legacy/ancestors/:familyId`
2. Show ancestor selection cards
3. User selects ancestor → taps "Enter Their World"
4. Cinematic "You awaken..." reveal: Year → Location → Name → Age → Occupation
5. Show family stats + Chapter I preview
6. "Begin" → POST `/api/legacy/chapters/:familyId/init` → navigate to chapter

### YOUR FAMILY WORLD Data Sources
- `worldVersion` ← `dailyWelcome.worldVersion` or `worldVersion.currentVersion`
- Activity lines ← `dailyWelcome.recentChanges[].description`
- Chapter ← active session chapter or `dailyWelcome.newChapters[0]`
- AI status ← `isAiEnabled` (from `/api/legacy/quests/:familyId`)

---

## Files Modified

| File | Change |
|------|--------|
| `artifacts/pay-it-forward/src/components/legacy-start-visual.tsx` | Complete rewrite — new cinematic start screen |
| `artifacts/pay-it-forward/src/pages/legacy-home.tsx` | Updated both LegacyStartVisual call sites with world-state props |

## Files NOT Modified (no changes needed)
- `artifacts/pay-it-forward/src/components/BottomNav.tsx` — Legacy tab already wired to `/legacy`
- `artifacts/pay-it-forward/src/pages/legacy-start.tsx` — Awaken the Legacy workflow intact
- `artifacts/pay-it-forward/src/App.tsx` — Routes already configured

---

## Remaining / Pending Phases

- [ ] Embed the actual uploaded PNG images (panel, bg, logo) to `public/` once available on disk
      → Target paths: `artifacts/pay-it-forward/public/niakofa-legacy-bg.png`, `niakofa-legacy-logo.png`, `niakofa-legacy-panel.png`
      → Component ref: `legacy-start-visual.tsx` hero `<img src="/legacy-living-family-reference.png" />`
- [x] Evaluate failing Railway CI/CD commits — earlier failures were followed by green corrective commits; current GitHub `main` CI and deploy-verification runs are green through `de16670`.
- [x] Verify current Railway service before push — `/api/healthz` is 200 with a connected database; `/api/status` is 200 and reports optional Nia/Map degradation without blocking the deploy probe.
- [x] Verify the new `/api/health` compatibility probe after Railway auto-deploys the health-contract correction — bounded JSON confirmed; optional Nia unavailable is reported as 503 while required `/api/healthz` and `/api/status` remain healthy.

## Completed This Session (both sessions)

- ✅ Built api-client-react dist (resolves 30+ downstream TS errors)
- ✅ Removed unused HandshakeIcon import in legacy-start-visual.tsx
- ✅ 0 TypeScript errors confirmed via `pnpm tsc --noEmit`
- ✅ Git: local main == origin/main (1907040b)
- ✅ Push confirmed: `008a6c6f..1907040b  main -> main`
- ✅ August 6, 2026 local verification: fresh dependency install, 0 TypeScript errors, 446 frontend tests passing, 242 API tests passing, release validation passing, production build passing, and both Replit artifact workflows running.
- ✅ Added bounded `/api/health` compatibility probe for external Nia/deployment monitors, with regression coverage.
- ✅ Updated GitHub deploy verification to use the Railway production URL, fail loudly on health regressions, and retry during rollout.
- ✅ Pushed `22e4dad8` and the health-contract correction `6861b928` to GitHub `main`; CI and Deploy Verification passed for `6861b928`.

---

## Repository
- GitHub: https://github.com/niakofa-cmyk/Niakofa
- Railway: `zesty-ambition-production-f6a1.up.railway.app`
