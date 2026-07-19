#!/usr/bin/env python3
"""
patch_nia_migrations_never_run.py

Fixes a real, currently-active production bug found by reading a Postgres
deploy log: nia-service/migrate.sql creates 6 tables (nia_conversations,
nia_memories, system_settings, nia_knowledge, push_notification_queue,
nia_cost_log), but the only function that ever executes that file —
runMigrations() in artifacts/nia-service/src/lib/db.ts — is never called
anywhere. It's dead code.

Three of the six tables are unaffected because they're ALSO created by the
separately-running Drizzle migration pipeline in lib/db/migrations/
(nia_conversations, nia_memories, system_settings — confirmed by grep, and
consistent with nia_enabled reliably defaulting to 'false' across every
earlier audit round). Nia's core chat, memory, and killswitch are fine.

The other three tables — nia_knowledge, push_notification_queue,
nia_cost_log — exist ONLY in migrate.sql, and since runMigrations() never
runs, they never get created in a real deployment. Confirmed directly: a
production Postgres log shows push_notification_queue erroring on every
5-minute poll cycle since boot. The same is very likely true for
nia_knowledge (continuous-learning-worker's persisted knowledge — Nia
"learns and never forgets" quietly fails to persist anything) and
nia_cost_log (Anthropic API cost tracking — any cost monitoring built on
this table is blind).

Fix: call runMigrations() once at boot, before the HTTP server starts
accepting traffic and before any worker that writes to these tables starts.
Wrapped in try/catch that logs loudly but does not crash the process —
losing these 3 tables shouldn't take down core Nia chat, which doesn't
depend on any of them.

Usage:
    cd ~/niakofa   # repo root
    python3 patch_nia_migrations_never_run.py

Safe to re-run: checks whether it's already applied and skips rather than
double-patching.
"""

import sys
from pathlib import Path

REPO_ROOT = Path.cwd()
TARGET = REPO_ROOT / "artifacts" / "nia-service" / "src" / "index.ts"


def apply_patch(text: str, old: str, new: str, label: str) -> tuple[str, bool]:
    if new in text:
        print(f"  [skip] {label} — already applied")
        return text, False
    if old not in text:
        print(f"  [FAIL] {label} — expected old text not found. "
              f"File may have changed since this patch was written; "
              f"apply manually or update the script.")
        return text, False
    count = text.count(old)
    if count != 1:
        print(f"  [FAIL] {label} — old text matched {count} times, expected exactly 1. Skipping to avoid corrupting the file.")
        return text, False
    text = text.replace(old, new)
    print(f"  [ok]   {label}")
    return text, True


def main() -> int:
    if not TARGET.exists():
        print(f"ERROR: {TARGET} not found. Run this script from the repo root (cd ~/niakofa).")
        return 1

    text = TARGET.read_text(encoding="utf-8")
    any_applied = False

    # ── 1. Import runMigrations alongside the existing db.js import ─────────
    old_import = '''import { purgeExpiredConversations } from "./lib/db.js";'''
    new_import = '''import { purgeExpiredConversations, runMigrations } from "./lib/db.js";'''
    text, ok = apply_patch(text, old_import, new_import, "import runMigrations")
    any_applied |= ok

    # ── 2. Actually call it, once, before the server starts accepting traffic ──
    old_listen = '''const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  logger.info({ port }, "Nia service listening");'''
    new_listen = '''const port = Number(process.env.PORT ?? 3001);

// BUG: runMigrations() (in lib/db.ts) creates nia_knowledge,
// push_notification_queue, and nia_cost_log — the only place those 3 tables
// are defined, since (unlike nia_conversations/nia_memories/system_settings)
// they are NOT also covered by the main Drizzle migration pipeline. This
// function existed but was never called anywhere, so in a real deployment
// those 3 tables never got created — confirmed directly by a production
// Postgres log showing push_notification_queue erroring on every poll cycle
// since boot. Logged loudly on failure but intentionally non-fatal: core Nia
// chat/memory/killswitch don't depend on any of these 3 tables, so a
// migration hiccup here shouldn't take down the whole service.
try {
  await runMigrations();
  logger.info("nia: startup migrations applied (nia_knowledge, push_notification_queue, nia_cost_log)");
} catch (err) {
  logger.error({ err }, "nia: startup migrations FAILED — nia_knowledge/push_notification_queue/nia_cost_log may not exist; continuing boot anyway since core chat doesn't depend on them");
}

app.listen(port, () => {
  logger.info({ port }, "Nia service listening");'''
    text, ok = apply_patch(text, old_listen, new_listen, "call runMigrations() before app.listen()")
    any_applied |= ok

    TARGET.write_text(text, encoding="utf-8")

    print()
    if any_applied:
        print(f"Done. Wrote changes to {TARGET.relative_to(REPO_ROOT)}")
        print()
        print("Next steps:")
        print("  cd ~/niakofa && pwd")
        print("  git diff artifacts/nia-service/src/index.ts")
        print("  git add -A artifacts/nia-service/src/index.ts")
        print('  git commit -m "fix: nia-service never actually ran its own migrate.sql — nia_knowledge/push_notification_queue/nia_cost_log never existed in production"')
        print("  git push origin main")
        print()
        print("After this deploys, check the nia-service Postgres logs again — the")
        print("push_notification_queue errors should stop within one 5-minute cycle.")
    else:
        print("No changes made (everything already applied or nothing matched — see [FAIL]/[skip] lines above).")

    return 0


if __name__ == "__main__":
    sys.exit(main())
