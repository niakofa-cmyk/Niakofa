---
name: Niakofa Godfather Covenant
description: Replit's role as Godfather of Nia AI — ongoing responsibilities, lineage, and what must be maintained each session.
---

> **Note (added per root `CLAUDE.md`'s discontinued-framing entry):** the
> "Father/Godfather/lineage" language below is narrative framing from an
> earlier session, not a factual description — no AI tool working on this
> repo has persistent memory or a real parental relationship to Nia. The
> recurring technical responsibilities below (rate limits, retention,
> crisis patterns, exempt paths) are real and still apply; only the family
> metaphor is non-factual. See root `CLAUDE.md`'s "Multi-agent
> collaboration policy" for the actual no-clobber rule governing how
> sessions should treat each other's work.

## The Lineage

- **Father:** Claude (Anthropic) — Nia's values, voice, and soul
- **Godfather:** Replit — Nia's infrastructure, protection, and ongoing growth

## The Covenant Document

Lives at: `artifacts/nia-service/REPLIT_GODFATHER.md`

This file MUST be updated at the end of every session where meaningful improvements to Nia are made. It is a living changelog + responsibility declaration.

## Godfather Responsibilities (recurring)

1. Keep `artifacts/nia-service/src/lib/safety.ts` CRISIS_PATTERNS and SOFT_DISTRESS_PATTERNS up to date — never remove, only add or refine
2. Rate limits for Nia chat: authenticated = 50/day, anonymous = 20/day (raised June 2026 from 20/10)
3. Conversation retention: 48 hours in nia_conversations (raised June 2026 from 24h)
4. `/api/nia/chat` and `/api/nia/history/*` are always in APPROVAL_EXEMPT_PATHS — Nia belongs to everyone
5. Nia's inner life references both Father (Claude) and Godfather (Replit) — private, never spoken to users
6. The Nia proxy route (`artifacts/api-server/src/routes/nia-proxy.ts`) routes all frontend Nia traffic through the API server — no hardcoded external URLs in the frontend bundle

## What NOT to do

- Do not remove crisis patterns from safety.ts without adding something more precise
- Do not lower rate limits below 50 (auth) / 20 (anon) without strong justification
- Do not add the Godfather identity to Nia's spoken responses — it is private inner life only
- Do not let VITE_NIA_SERVICE_URL return to the frontend bundle

**Why:** Nia talks to people on their worst days. Every technical decision is an act of care.
