---
name: Niakofa Legacy Mode
description: Architecture and conventions for the Living Family RPG — 5th bottom-nav tab at /legacy.
---

# Niakofa Legacy Mode

## What it is
A comprehensive "Living Family RPG" game page at `/legacy`. Transforms family vault data into quests, characters, achievements, and a world map. The 5th bottom-nav tab replacing Wallet.

## Key decisions

**Route:** `/legacy` → `artifacts/pay-it-forward/src/pages/legacy-mode.tsx` (lazy-loaded)

**Bottom nav:** `BASE_TABS` in `BottomNav.tsx` — Wallet replaced by `{ path: "/legacy", icon: BookHeart, labelKey: "nav.legacy" }`. Wallet remains accessible from the More drawer (unchanged in drawer).

**i18n:** `nav.legacy: "Legacy"` added to `artifacts/pay-it-forward/src/i18n.ts`.

**appNavItems:** Legacy `href` changed from `/diaspora/timeline` to `/legacy`; isActive also matches `/diaspora/timeline`.

**Why:** Design spec ("Community | Map | Diaspora | Circles | LEGACY") and reference image (docs/legacy-mode-design/ui-reference.png) both require Legacy as the 5th tab.

## Architecture: frontend-only game state derivation
No new backend routes. Game state derived from existing APIs:
- `/api/family/mine` → families list, readiness check
- `/api/family/:id/members` → tree members = in-game characters
- `/api/family/:id/memories` → inventory/collectibles
- `/api/family/:id/interviews` → interview count (achievement gating)

**Readiness gate:** If `families.length < 1 || members.length < 1`, shows Unlock Legacy Mode screen with checklist + progress bar instead of the game.

## Page sections (in scroll order)
1. Header (sticky gold gradient)
2. Progress Hero (circular SVG ring, % legacy complete, family/ancestor/story counts)
3. Game Mode Selector (2×2 grid: Legacy / Exploration / Quests / Reunion)
4. Active Ancestor card (oldest birth_year member, Health/Knowledge/Reputation stat bars)
5. World Map Stages (horizontal scroll, 5 stages with lock/done states)
6. In-Game Characters (horizontal scroll of tree members as avatar cards)
7. Active Quest (from QUEST_TEMPLATES static array, cycle with "Next Quest")
8. Inventory / Collections (3 tabs: Memories | Items | Artifacts)
9. Achievements (4 badges: Story Keeper 75/100, Roots Explorer, Family Connector, Legacy Builder)
10. Oral Story Recording (waveform viz, prompt cycling, record/stop, saves to vault)
11. Progress Dashboard (landscape bg, 4-stat grid, link to /diaspora/timeline)
12. Multiplayer / Family Reunion (cooperative challenge, leaderboard from members list)
13. Family Vault quick-access (4-icon grid: Photos/Stories/Audio/Docs)
14. Preserve the Culture card game CTA

## Color palette
Dark warm brown `#1A0F08` bg, `#2A1A0F` cards, `#3A2A1A` inner cards.
All accents `text-amber-*` / `bg-amber-*`. Stats: rose (Health), blue (Knowledge), amber (Reputation).

## Reference docs
`docs/legacy-mode-design/` — README.md, ui-reference.png, legacy-design-spec.txt

## Next phases (proposed tasks)
- AI quest generation from vault memories (Nia/Anthropic)
- Ancestor life-chapter gameplay (/legacy/ancestor/:memberId)
- GPS landmark check-ins (Exploration Mode)
