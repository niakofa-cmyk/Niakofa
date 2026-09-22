#!/usr/bin/env python3
"""
Niakofa Audit Patch — Critical & Build-Blocking Fixes
Run from repo root: python3 patch_audit_fixes.py

Fixes applied:
  BUG-1  startNiaCheckinWorker never called in index.ts
  BUG-2  nia-voice router never registered (routes/index.ts + app.ts)
  BUG-3  Missing Drizzle schema columns:
           users.ts     — is_suspended, suspended_at, suspended_reason, helper_skills
           requests.ts  — voice_activated, voice_language
           user-settings.ts — preferred_language
  BUG-4  POST /users/register leaks password_hash
  BUG-5  GET /users/:id leaks password_hash
  BUG-12 Missing rate limiter exports (crisisAwareChatLimiter,
          niaChatHistoryLimiter, adminLimiter, voiceLimiter)
  BUG-7  railway.toml missing migrate step in startCommand
"""

import sys
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
errors = []

def patch(rel_path, old, new, label):
    path = os.path.join(ROOT, rel_path)
    with open(path, "r") as f:
        src = f.read()
    if old not in src:
        errors.append(f"  SKIP [{label}]: pattern not found in {rel_path}")
        return
    if new in src:
        print(f"  ALREADY [{label}]: already patched in {rel_path}")
        return
    with open(path, "w") as f:
        f.write(src.replace(old, new, 1))
    print(f"  OK    [{label}]: {rel_path}")

print("\n── BUG-1: Wire startNiaCheckinWorker in index.ts ──────────────────────────")
patch(
    "artifacts/api-server/src/index.ts",
    # Old: anomaly worker starts but checkin never does
    "  startAnomalyDetectionWorker();",
    "  startAnomalyDetectionWorker();\n  startNiaCheckinWorker();",
    "NiaCheckinWorker start"
)

print("\n── BUG-2a: Register nia-voice router in routes/index.ts ───────────────────")
patch(
    "artifacts/api-server/src/routes/index.ts",
    "import niaContextRouter from \"./nia-context\";",
    "import niaContextRouter from \"./nia-context\";\nimport niaVoiceRouter from \"./nia-voice\";",
    "import niaVoiceRouter"
)
patch(
    "artifacts/api-server/src/routes/index.ts",
    "router.use(niaContextRouter);",
    "router.use(niaContextRouter);\nrouter.use(niaVoiceRouter);",
    "router.use niaVoiceRouter"
)

print("\n── BUG-2b: Mount voiceAudioRawParser in app.ts BEFORE express.json() ──────")
patch(
    "artifacts/api-server/src/app.ts",
    "import router from \"./routes\";",
    "import router from \"./routes\";\nimport { voiceAudioRawParser } from \"./routes/nia-voice\";",
    "import voiceAudioRawParser"
)
patch(
    "artifacts/api-server/src/app.ts",
    "app.use(\"/api/verification/identity/webhook\", express.raw({ type: \"application/json\" }));",
    "app.use(\"/api/verification/identity/webhook\", express.raw({ type: \"application/json\" }));\n// Voice STT endpoint needs raw audio bytes before express.json() runs\napp.use(\"/api/nia/voice/transcribe\", voiceAudioRawParser);",
    "voiceAudioRawParser mount"
)

print("\n── BUG-3a: Add is_suspended + helper_skills to users Drizzle schema ────────")
patch(
    "lib/db/src/schema/users.ts",
    "  is_admin: boolean(\"is_admin\").notNull().default(false),\n  password_hash: text(\"password_hash\"),",
    "  is_admin: boolean(\"is_admin\").notNull().default(false),\n  password_hash: text(\"password_hash\"),\n  // Suspension (migration 0015)\n  is_suspended: boolean(\"is_suspended\").notNull().default(false),\n  suspended_at: timestamp(\"suspended_at\"),\n  suspended_reason: text(\"suspended_reason\"),\n  // Helper skills — free-text array used by matching engine\n  helper_skills: text(\"helper_skills\").array(),",
    "users: is_suspended + helper_skills"
)

print("\n── BUG-3b: Add voice_activated + voice_language to requests Drizzle schema ─")
patch(
    "lib/db/src/schema/requests.ts",
    "  cancelled_at: timestamp(\"cancelled_at\"),\n}, (t) => [",
    "  cancelled_at: timestamp(\"cancelled_at\"),\n  // Voice analytics (migration 0014)\n  voice_activated: boolean(\"voice_activated\").notNull().default(false),\n  voice_language: text(\"voice_language\"),\n  // Nia check-in (migration 0013)\n  nia_checkin_sent_at: timestamp(\"nia_checkin_sent_at\"),\n}, (t) => [",
    "requests: voice_activated + nia_checkin_sent_at"
)

print("\n── BUG-3c: Add preferred_language to user_settings Drizzle schema ──────────")
patch(
    "lib/db/src/schema/user-settings.ts",
    "  specialties: text(\"specialties\"),\n\n  updated_at: timestamp(\"updated_at\").defaultNow().notNull(),",
    "  specialties: text(\"specialties\"),\n  // Language preference (migration 0017)\n  preferred_language: text(\"preferred_language\").notNull().default(\"en\"),\n\n  updated_at: timestamp(\"updated_at\").defaultNow().notNull(),",
    "user-settings: preferred_language"
)

print("\n── BUG-3d: Allow preferred_language through PUT /users/:id/settings ─────────")
patch(
    "artifacts/api-server/src/routes/users.ts",
    "    \"service_radius_miles\", \"max_travel_miles\", \"specialties\",\n  ];",
    "    \"service_radius_miles\", \"max_travel_miles\", \"specialties\", \"preferred_language\",\n  ];",
    "settings allowed list: preferred_language"
)

print("\n── BUG-4: Strip password_hash from POST /users/register response ────────────")
patch(
    "artifacts/api-server/src/routes/users.ts",
    "    const token = signTokenById(user.id);\n    return res.status(201).json({ user, token });\n  } catch (err) {\n    logger.error({ err }, \"register: database error\");",
    "    const token = signTokenById(user.id);\n    const { password_hash: _ph, ...safeUser } = user as any;\n    return res.status(201).json({ user: safeUser, token });\n  } catch (err) {\n    logger.error({ err }, \"register: database error\");",
    "register: strip password_hash"
)

print("\n── BUG-5: Strip password_hash from GET /users/:id response ──────────────────")
patch(
    "artifacts/api-server/src/routes/users.ts",
    "  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.data.id)).limit(1);\n  if (!user) return res.status(404).json({ error: \"User not found\" });\n  return res.json(user);\n});\n\nrouter.patch(\"/users/:id\",",
    "  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.data.id)).limit(1);\n  if (!user) return res.status(404).json({ error: \"User not found\" });\n  const { password_hash: _ph, ...safeUser } = user as any;\n  return res.json(safeUser);\n});\n\nrouter.patch(\"/users/:id\",",
    "GET /users/:id: strip password_hash"
)

print("\n── BUG-12: Add missing rate limiter exports ──────────────────────────────────")
RATE_LIMIT_ADDITIONS = """
// ── 7. Crisis-Aware Chat (20 / min per user, tighter during crisis window) ───
// Used by nia-proxy for the /nia/chat endpoint. Named "crisis-aware" because
// we intentionally keep this generous — someone in a mental health moment
// should not hit a rate limit. 20/min is still abuse protection without
// punishing someone who needs to talk.
export const crisisAwareChatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const r = req as typeof req & { authenticatedUserId?: number };
    return `nia-chat-${r.authenticatedUserId ?? req.ip ?? "unknown"}`;
  },
  message: { error: "You're sending messages too quickly. Please slow down." },
});

// ── 8. Nia Chat History (60 / 15 min per user) ───────────────────────────────
// History reads are cheap but should still be throttled against scraping.
export const niaChatHistoryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const r = req as typeof req & { authenticatedUserId?: number };
    return `nia-history-${r.authenticatedUserId ?? req.ip ?? "unknown"}`;
  },
  message: { error: "Too many history requests. Please wait a moment." },
});

// ── 9. Admin Endpoints (30 / 15 min) ─────────────────────────────────────────
// Admin routes are low-volume by design; this mainly protects against
// automated scripts hammering the analytics endpoints.
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many admin requests. Please slow down." },
});

// ── 10. Voice I/O (30 / hour per user) ───────────────────────────────────────
// STT and TTS calls hit OpenAI — cost-sensitive. 30/hour is generous for
// real usage but protects against accidental loops or abuse.
export const voiceLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const r = req as typeof req & { authenticatedUserId?: number };
    return `voice-${r.authenticatedUserId ?? req.ip ?? "unknown"}`;
  },
  message: { error: "Voice limit reached. Please wait an hour before trying again." },
});
"""
patch(
    "artifacts/api-server/src/middlewares/rate-limit.ts",
    "  message: { error: \"You're sending messages too fast. Slow down a little.\" },\n});",
    "  message: { error: \"You're sending messages too fast. Slow down a little.\" },\n});" + RATE_LIMIT_ADDITIONS,
    "rate-limit: add 4 missing exporters"
)

print("\n── BUG-7: Add migrate step to railway.toml startCommand ─────────────────────")
patch(
    "railway.toml",
    'startCommand = "node --enable-source-maps artifacts/api-server/dist/index.mjs"',
    'startCommand = "pnpm --filter @workspace/db run migrate && node --enable-source-maps artifacts/api-server/dist/index.mjs"',
    "railway.toml: add migrate"
)

print("\n── Summary ──────────────────────────────────────────────────────────────────")
if errors:
    print("\nWarnings (manual review needed):")
    for e in errors:
        print(e)
    print()
else:
    print("\nAll patches applied cleanly.")

print("""
Next steps:
  cd ~/niakofa
  git pull origin main        # sync before committing
  git add -A
  git commit -m "fix: critical audit patches — schema sync, voice routes, checkin worker, auth leaks, rate limiters, migrate step"
  git push origin main
""")
