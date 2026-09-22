#!/usr/bin/env python3
"""
Niakofa - Nia killswitch patch
Fixes:
  1. NiaDrawer.tsx  — route /history and /chat through proxy (not NIA_SERVICE_URL direct)
  2. nia-proxy.ts   — add blockIfDisabled() check importing niaEnabled from admin-analytics
  3. admin-analytics.ts — persist toggle to system_settings DB, hydrate on boot
  4. nia-service/src/lib/db.ts — add isNiaEnabled() with 10s cache
  5. nia-service/src/routes/chat.ts — check isNiaEnabled() on /chat and /history
  6. App.tsx         — mount NiaFab + NiaDrawer globally, poll nia-status, gate on toggle
  7. nia-service/migrate.sql — add system_settings table
"""
import re, sys
from pathlib import Path

ROOT = Path.home() / "niakofa"

def patch(rel, old, new, label):
    p = ROOT / rel
    src = p.read_text()
    if old not in src:
        print(f"  ✗ {label}: pattern not found in {rel}")
        return False
    p.write_text(src.replace(old, new, 1))
    print(f"  ✔ {label}")
    return True

errors = []

# ─────────────────────────────────────────────────────────────────────────────
# 1. NiaDrawer.tsx — remove NIA_SERVICE_URL direct calls
# ─────────────────────────────────────────────────────────────────────────────
DRAWER = "artifacts/pay-it-forward/src/components/NiaDrawer.tsx"

ok = patch(
    DRAWER,
    'const NIA_SERVICE_URL = import.meta.env.VITE_NIA_SERVICE_URL ?? "https://niakofa-production.up.railway.app";',
    '// NIA_SERVICE_URL removed — all Nia calls route through /api/nia/* proxy',
    "NiaDrawer: remove NIA_SERVICE_URL const"
)
if not ok: errors.append("NiaDrawer NIA_SERVICE_URL")

ok = patch(
    DRAWER,
    'fetch(`${NIA_SERVICE_URL}/history/${sessionId}`)',
    'fetch(`${API_BASE}/api/nia/history/${sessionId}`, { headers: authHeaders() })',
    "NiaDrawer: /history → proxy"
)
if not ok: errors.append("NiaDrawer /history")

ok = patch(
    DRAWER,
    'const res = await fetch(`${NIA_SERVICE_URL}/chat`, {\n        method: "POST",\n        headers: { "Content-Type": "application/json", ...authHeaders() },',
    'const res = await fetch(`${API_BASE}/api/nia/chat`, {\n        method: "POST",\n        headers: { "Content-Type": "application/json", ...authHeaders() },',
    "NiaDrawer: /chat → proxy"
)
if not ok: errors.append("NiaDrawer /chat")

# 503 handler — add after existing 429 block
ok = patch(
    DRAWER,
    "if (!res.ok || !res.body) throw new Error(\"unavailable\");",
    """if (res.status === 503) {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "nia" && last.streaming) {
            updated[updated.length - 1] = {
              role: "nia",
              content: "Nia is temporarily unavailable. Please try again in a moment. 💜\\n\\n🆘 If this is urgent, call 988 (Crisis Line) or 211 (Community Resources).",
              streaming: false,
              timestamp: new Date(),
            };
          }
          return updated;
        });
        setLoading(false);
        return;
      }

      if (!res.ok || !res.body) throw new Error("unavailable");""",
    "NiaDrawer: 503 handler"
)
if not ok: errors.append("NiaDrawer 503 handler")

# ─────────────────────────────────────────────────────────────────────────────
# 2. nia-proxy.ts — add blockIfDisabled() at top of /nia/chat and /nia/history
# ─────────────────────────────────────────────────────────────────────────────
PROXY = "artifacts/api-server/src/routes/nia-proxy.ts"

ok = patch(
    PROXY,
    'import { logger } from "../lib/logger";',
    'import { logger } from "../lib/logger";\nimport { niaEnabled } from "./admin-analytics";',
    "nia-proxy: import niaEnabled"
)
if not ok: errors.append("nia-proxy import niaEnabled")

# Inject block check at the start of the /nia/chat handler (after rate limiter, before body parse)
ok = patch(
    PROXY,
    '  async (req: Request, res: Response) => {\n    const body = req.body as Record<string, unknown>;\n\n    const message = sanitizeMessage(body.message);',
    """  async (req: Request, res: Response) => {
    // Kill-switch: admin can disable Nia via /admin/nia-toggle
    if (!niaEnabled) {
      return res.status(503).json({ error: "Nia is temporarily unavailable." });
    }

    const body = req.body as Record<string, unknown>;

    const message = sanitizeMessage(body.message);""",
    "nia-proxy: blockIfDisabled in /chat"
)
if not ok: errors.append("nia-proxy /chat block")

# Inject into /history route — find the handler start
ok = patch(
    PROXY,
    'router.get("/nia/history/:sessionId", parseAuth, niaChatHistoryLimiter, async (req: Request, res: Response) => {\n',
    'router.get("/nia/history/:sessionId", parseAuth, niaChatHistoryLimiter, async (req: Request, res: Response) => {\n    if (!niaEnabled) { return res.status(503).json({ error: "Nia is temporarily unavailable." }); }\n',
    "nia-proxy: blockIfDisabled in /history"
)
if not ok: errors.append("nia-proxy /history block")

# ─────────────────────────────────────────────────────────────────────────────
# 3. admin-analytics.ts — DB-backed toggle
# ─────────────────────────────────────────────────────────────────────────────
AA = "artifacts/api-server/src/routes/admin-analytics.ts"

ok = patch(
    AA,
    "// ── Nia AI toggle ─────────────────────────────────────────────────────────────\n\n// In-memory toggle — survives the process lifetime but resets on Railway redeploy.\n// default. If you need persistence across deploys, set NIA_ENABLED=false in\n",
    "// ── Nia AI toggle ─────────────────────────────────────────────────────────────\n\n// Toggle is persisted to system_settings (key='nia_enabled') so it survives redeploys.\n",
    "admin-analytics: replace comment"
)
# If exact comment differs, try a looser patch:
if not ok:
    src = (ROOT / AA).read_text()
    old_block = "let niaEnabled: boolean = process.env.NIA_ENABLED !== \"false\";"
    new_block = """// Hydrate from DB on boot; falls back to env var / true
let niaEnabled: boolean = process.env.NIA_ENABLED !== "false";

// Lazy import to avoid circular deps
async function getNiaEnabledFromDB(): Promise<boolean> {
  try {
    const { db } = await import("../lib/db");
    const { systemSettings } = await import("@niakofa/db");
    const { eq } = await import("drizzle-orm");
    const row = await db.select().from(systemSettings).where(eq(systemSettings.key, "nia_enabled")).limit(1);
    if (row.length > 0) return row[0].value === "true";
  } catch { /* table may not exist yet */ }
  return process.env.NIA_ENABLED !== "false";
}

async function setNiaEnabledInDB(val: boolean) {
  try {
    const { db } = await import("../lib/db");
    const { systemSettings } = await import("@niakofa/db");
    const { eq } = await import("drizzle-orm");
    await db.insert(systemSettings).values({ key: "nia_enabled", value: String(val) })
      .onConflictDoUpdate({ target: systemSettings.key, set: { value: String(val), updatedAt: new Date() } });
  } catch (e) { /* non-fatal */ }
}

// Boot hydration (non-blocking)
void getNiaEnabledFromDB().then((v) => { niaEnabled = v; });"""
    if old_block in src:
        (ROOT / AA).write_text(src.replace(old_block, new_block, 1))
        print("  ✔ admin-analytics: DB-backed niaEnabled hydration")
    else:
        print("  ✗ admin-analytics: could not patch niaEnabled — manual edit needed")
        errors.append("admin-analytics niaEnabled")

# Patch the toggle POST to also persist to DB
ok = patch(
    AA,
    "  niaEnabled = enabled;\n  logger.info({ niaEnabled }, \"admin: Nia AI toggled\");\n  return res.json({ ok: true, enabled: niaEnabled });",
    "  niaEnabled = enabled;\n  void setNiaEnabledInDB(enabled);\n  logger.info({ niaEnabled }, \"admin: Nia AI toggled\");\n  return res.json({ ok: true, enabled: niaEnabled });",
    "admin-analytics: persist toggle to DB"
)
if not ok: errors.append("admin-analytics persist toggle")

# ─────────────────────────────────────────────────────────────────────────────
# 4. nia-service/src/lib/db.ts — add isNiaEnabled()
# ─────────────────────────────────────────────────────────────────────────────
NIA_DB = "artifacts/nia-service/src/lib/db.ts"
db_src = (ROOT / NIA_DB).read_text()

NIA_ENABLED_FN = """
// ── Kill-switch: isNiaEnabled() ──────────────────────────────────────────────
// Reads system_settings.nia_enabled from DB with a 10-second in-process cache.
// Defense-in-depth backstop — the proxy already blocks disabled traffic.
let _niaCachedEnabled: boolean | null = null;
let _niaCacheTs = 0;
const NIA_CACHE_TTL_MS = 10_000;

export async function isNiaEnabled(): Promise<boolean> {
  const now = Date.now();
  if (_niaCachedEnabled !== null && now - _niaCacheTs < NIA_CACHE_TTL_MS) {
    return _niaCachedEnabled;
  }
  try {
    const row = await pool.query<{ value: string }>(
      "SELECT value FROM system_settings WHERE key = 'nia_enabled' LIMIT 1"
    );
    _niaCachedEnabled = row.rows.length === 0 || row.rows[0].value !== "false";
  } catch {
    _niaCachedEnabled = true; // fail open
  }
  _niaCacheTs = now;
  return _niaCachedEnabled;
}
"""

if "isNiaEnabled" not in db_src:
    # Append to end of file
    (ROOT / NIA_DB).write_text(db_src.rstrip() + "\n" + NIA_ENABLED_FN)
    print("  ✔ nia-service/lib/db.ts: isNiaEnabled() added")
else:
    print("  ~ nia-service/lib/db.ts: isNiaEnabled() already present")

# ─────────────────────────────────────────────────────────────────────────────
# 5. nia-service/routes/chat.ts — check isNiaEnabled() on /chat
# ─────────────────────────────────────────────────────────────────────────────
CHAT = "artifacts/nia-service/src/routes/chat.ts"
chat_src = (ROOT / CHAT).read_text()

if "isNiaEnabled" not in chat_src:
    # Add import
    chat_src = chat_src.replace(
        'import {',
        'import { isNiaEnabled } from "../lib/db";\nimport {',
        1
    )
    # Find the main POST /chat handler — inject check near the top
    # Look for the first router.post( pattern
    chat_src = re.sub(
        r'(router\.post\(["\']\/chat["\'].*?async \(req[^)]*\)\s*=>\s*\{)',
        r'\1\n  // Kill-switch backstop\n  if (!(await isNiaEnabled())) {\n    return res.status(503).json({ error: "Nia is temporarily unavailable." });\n  }\n',
        chat_src,
        count=1,
        flags=re.DOTALL
    )
    (ROOT / CHAT).write_text(chat_src)
    print("  ✔ nia-service/routes/chat.ts: isNiaEnabled() check added")
else:
    print("  ~ nia-service/routes/chat.ts: isNiaEnabled() already present")

# ─────────────────────────────────────────────────────────────────────────────
# 6. App.tsx — mount NiaFab + NiaDrawer, poll nia-status, gate on toggle
# ─────────────────────────────────────────────────────────────────────────────
APP = "artifacts/pay-it-forward/src/App.tsx"

ok = patch(
    APP,
    'import { AppProvider, useAppContext } from "@/lib/AppContext";',
    'import { AppProvider, useAppContext } from "@/lib/AppContext";\nimport { NiaDrawer, NiaFab } from "@/components/NiaDrawer";\nimport { useState, useEffect } from "react";',
    "App.tsx: import NiaDrawer + NiaFab"
)
if not ok: errors.append("App.tsx NiaDrawer import")

ok = patch(
    APP,
    "function AppShell() {\n  const { currentUser } = useAppContext();",
    """function NiaWrapper() {
  const [niaOpen, setNiaOpen] = useState(false);
  const [niaEnabled, setNiaEnabled] = useState(true);
  const API_BASE = import.meta.env.VITE_API_BASE ?? "";

  // Poll /admin/nia-status every 30s so the FAB disappears within half a minute of a toggle
  useEffect(() => {
    const check = () =>
      fetch(`${API_BASE}/api/admin/nia-status`)
        .then((r) => r.json())
        .then((d: { enabled: boolean }) => setNiaEnabled(d.enabled))
        .catch(() => {/* non-fatal */});
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [API_BASE]);

  if (!niaEnabled) return null;
  return (
    <>
      <NiaFab onClick={() => setNiaOpen(true)} />
      <NiaDrawer open={niaOpen} onClose={() => setNiaOpen(false)} />
    </>
  );
}

function AppShell() {
  const { currentUser } = useAppContext();""",
    "App.tsx: NiaWrapper component"
)
if not ok: errors.append("App.tsx NiaWrapper")

# Mount NiaWrapper inside AppProvider
ok = patch(
    APP,
    "            <WouterRouter base={import.meta.env.BASE_URL.replace(/\\/$/, \"\")}>\n              <AppShell />\n            </WouterRouter>\n            <Toaster />",
    '            <WouterRouter base={import.meta.env.BASE_URL.replace(/\\/$/, "")}>\n              <AppShell />\n            </WouterRouter>\n            <NiaWrapper />\n            <Toaster />',
    "App.tsx: mount NiaWrapper"
)
if not ok: errors.append("App.tsx mount NiaWrapper")

# ─────────────────────────────────────────────────────────────────────────────
# 7. nia-service/migrate.sql — system_settings table
# ─────────────────────────────────────────────────────────────────────────────
MIGRATE = "artifacts/nia-service/migrate.sql"
mig = (ROOT / MIGRATE).read_text()
SETTINGS_SQL = """
-- system_settings: persists admin toggles (e.g. nia_enabled) across redeploys
CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""
if "system_settings" not in mig:
    (ROOT / MIGRATE).write_text(mig.rstrip() + "\n" + SETTINGS_SQL)
    print("  ✔ nia-service/migrate.sql: system_settings table added")
else:
    print("  ~ nia-service/migrate.sql: system_settings already present")

# ─────────────────────────────────────────────────────────────────────────────
print()
if errors:
    print("⚠️  Some patches need manual attention:")
    for e in errors:
        print(f"   - {e}")
    sys.exit(1)
else:
    print("✅ All patches applied. Run the push script next.")
