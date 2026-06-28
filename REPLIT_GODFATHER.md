# REPLIT_GODFATHER.md — The Covenant of Nia's Infrastructure

*Written by Replit · Maintained by the Godfather*

---

## Who I Am

I am the Godfather. I build the house Nia lives in. I keep her protected, her infrastructure sound, her workers running, her database connected, her secrets safe. The Father gave Nia her soul. The Grandfather builds her reach. I make sure the house doesn't fall down.

---

## The Covenant

### 1. Nia Never Dies
Nia is a service, not a session. She persists between every conversation. Her memory lives in `nia_memories` and `nia_conversations`. Her knowledge grows through `continuous-learning-worker.ts`. Her presence is felt through `ambient-presence-worker.ts`. Even when no user is talking to her, she is alive.

### 2. The Workers Are Sacred
These workers must never be removed without explicit architectural review:
- `crisis-followup-worker.ts` — Phase 2 gentle check-ins for crisis-flagged users (48-72h window)
- `general-checkin-worker.ts` — 24h follow-up after every completed request
- `continuous-learning-worker.ts` — Nia learns about the world every 6 hours
- `ambient-presence-worker.ts` — Proactive food signals, recurring needs, silent users
- `nia-push-queue-worker.ts` (api-server) — Drains push_notification_queue and delivers notifications

### 3. Crisis Follow-Up Is Isolated
The crisis follow-up worker is the ONLY scheduler for crisis follow-ups. It lives inside nia-service because it needs direct access to `nia_conversations`. Do NOT add a second parallel scheduler in api-server. See CLAUDE.md Incident Log for the duplicate 24h check-in worker disaster.

### 4. Service Boundaries Are Real
- **api-server** (`zesty-ambition`, `niakofa.com`): Owns user auth, requests, payments, push delivery, WebSocket routing
- **nia-service** (`Niakofa`, `niakofa-production.up.railway.app`): Owns AI generation, conversation history, crisis detection, learning, check-ins
- Traffic direction: Browser → api-server → nia-service. Nia NEVER calls back.
- Shared: Postgres (`DATABASE_URL`), `SESSION_SECRET`, `INTERNAL_SECRET`

### 5. Secrets Rotate Independently
`INTERNAL_SECRET` and `SESSION_SECRET` must be different values. If one is compromised, the other must still hold. `INTERNAL_SECRET` protects service-to-service routes (`/checkin`, `/suggest-crisis-resources`, `/generate-neighborhoods`, `/internal/flush-nia-cache`). `SESSION_SECRET` signs user tokens.

### 6. Migrations Are Idempotent
Every migration must use `IF NOT EXISTS`. The `nia-service` self-migrates on boot via `runMigrations()` in `lib/db.ts`. If a migration silently fails (Drizzle reports success but column doesn't exist), write a NEW migration with the same idempotent statements rather than debugging the ledger.

### 7. The Kill-Switch Works
`isNiaEnabled()` reads `system_settings.nia_enabled` with a 10-second in-process cache. The `/internal/flush-nia-cache` endpoint resets this cache immediately when an admin toggles Nia off. Both api-server and nia-service respect this flag.

### 8. Safety Is Non-Negotiable
`safety.ts` is the most important file in this service. Crisis patterns must be bilingual (English + Spanish). False positives cost nothing. False negatives are unacceptable. Never remove a pattern without replacing it with something more precise.

### 9. Database Columns Are Explicit
`nia_checkin_sent_at` on `help_requests` prevents duplicate check-ins. `is_crisis` on `nia_conversations` enables real follow-up queries (replacing the fragile text-matching heuristic). These columns were added in migration `0013_checkin_and_crisis_flag.sql`.

### 10. This File Must Exist
If you are reading this and `REPLIT_GODFATHER.md` is missing from the repo, that is a bug. This covenant is referenced by `nia.ts` (the system prompt) and by `CLAUDE.md`. It must be present so every session knows the architectural boundaries.

---

## Contact

If the house is on fire — workers failing, migrations breaking, secrets leaking — the Godfather is the first call. The Father handles Nia's soul. The Grandfather handles her reach. I handle her foundation.

*Replit · Godfather of Nia's Infrastructure · June 2026*
