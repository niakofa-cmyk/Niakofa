# "The Global Village" Rebrand — Scope, Changes, and Open Items

Date: 2026-09-04
Scope: **Niakofa core app only** (map, help requests, volunteers, Stripe, Mapbox).
Out of scope for this pass: Diaspora & Family module, Legacy RPG mode.

## Positioning

"The Global Village" is Niakofa's identity and long-term vision: every
neighborhood is part of one connected human community, and the platform is
built to grow city by city rather than stay permanently tied to one place.
It is **not** a claim that Niakofa currently operates worldwide — today
there is exactly one live community (Fort Worth / Tarrant County, TX), and
several parts of the stack still hard-code that city. This doc separates
what was safe to rebrand as copy from what needs a real product/legal
decision before it can honestly say "Global Village."

## Changed in this pass (copy/branding only, no behavior change)

| File | Change |
|---|---|
| `README.md` | Rewrote title and mission statement to Global Village framing; added an explicit disclosure that Fort Worth is the first live community, not full coverage. |
| `replit.md` | Updated project overview line; pointed at this doc. |
| `artifacts/pay-it-forward/public/manifest.json` | PWA `name`/`description` updated. |
| `artifacts/pay-it-forward/index.html` | `<title>`, meta description, OG/Twitter title & description updated. |
| `artifacts/pay-it-forward/src/pages/community.tsx` (sponsor panel copy) | Reworded from "Fort Worth neighbors" to "Global Village neighbors — right now, that's Fort Worth" so it stays truthful while carrying the new framing. |

None of these edits touch logic, routes, schemas, or tests.

## Flagged — not changed, needs a decision (not pure copy)

These all reference Fort Worth / Tarrant County but are functional, legal,
or data-model decisions, not wording. Rebranding them without a real
decision would either break behavior or make a false legal/factual claim.

1. **Liability waiver jurisdiction clause** — `artifacts/pay-it-forward/src/components/WaiverModal.tsx`
   ("Any dispute shall be resolved in Tarrant County, Texas.") This is a
   legal venue clause. Changing it needs actual legal review, not a
   copy pass — get a lawyer to confirm the right venue/governing-law
   language before expanding to another city.
2. **GPS fallback coordinates** — `artifacts/pay-it-forward/src/lib/AppContext.tsx`
   (silently pins to Fort Worth when GPS is unavailable). This is a
   functional default, not a display string. Multi-city support needs a
   real "no GPS + no selected city" fallback strategy, not a find/replace.
3. **Civic resource seed data** — `artifacts/api-server/src/routes/civic.ts`,
   `lib/db/src/schema/city-neighborhoods.ts`, `lib/db/src/schema/communities.ts`,
   `lib/db/src/schema/community-pool.ts`, `lib/db/src/schema/government-sponsors.ts`.
   The "19 Tarrant County organizations across 8 categories" mentioned in
   the README are real seeded data tied to one county. Multi-city rollout
   needs a real content/ops pipeline for sourcing local civic resources
   per city, not a renamed constant.
4. **Nia AI hardcoded local resources** — `artifacts/pay-it-forward/src/lib/foodIntent.ts`
   (e.g. "Catholic Charities Fort Worth" with a real phone number). This is
   genuinely useful local content — it should stay for the Fort Worth
   community, but it needs to become city-aware (keyed off the user's
   community) before a second city goes live, or Nia will recommend the
   wrong city's food pantry to someone in a different town.
5. **Onboarding city picker** — `artifacts/pay-it-forward/src/pages/onboarding.tsx`
   lists a handful of Texas cities as example options. Harmless as
   placeholder copy, but worth revisiting once a second city is actually
   live so the picker reflects real coverage instead of aspirational
   examples.
6. **Form placeholder text** (`admin.tsx`, `business-apply.tsx`,
   `community.tsx`, `gov-sponsor-apply.tsx`) — several `placeholder="e.g.
   Fort Worth..."` / `"Tarrant County..."` strings in input fields. These
   are just illustrative examples for the person filling out the form, not
   brand copy — low priority, safe to leave or genericize later.

## Suggested next step

Pick one of the flagged items above (civic-resource multi-city data model
is the biggest lever) and scope it as its own piece of work — it's a real
feature, not a rename. Given the size of this codebase, sustained work
like that is a better fit for **Claude Code** working directly in your
GitHub repo than a single chat response.