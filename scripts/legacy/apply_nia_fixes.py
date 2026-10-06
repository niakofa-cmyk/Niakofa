#!/usr/bin/env python3
"""
Niakofa — Nia kill-switch patch
Run from anywhere:  python3 apply_nia_fixes.py
It finds ~/niakofa automatically and patches all 4 files.
"""
import os, sys, textwrap

REPO = os.path.expanduser("~/niakofa")

FILES = {
    "artifacts/api-server/src/routes/admin-analytics.ts": r'''/**
 * Niakofa — Admin Analytics Routes
 *
 * Provides aggregated platform health data for the admin dashboard.
 * All routes require authentication + admin role.
 */
import { Router } from "express";
import { db, requestsTable, usersTable, reportsTable, systemSettingsTable } from "@workspace/db";
import { eq, sql, and, gte } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { adminLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
''',
    "_APPEND_admin-analytics.ts": r'''
// ── Nia AI toggle ─────────────────────────────────────────────────────────────
// In-process cache of the DB value. Seeded from system_settings at boot via
// initNiaEnabled() below. Falls back to NIA_ENABLED env var if DB is
// unreachable at startup; defaults to true (enabled) if neither is set.
// A write via POST /admin/nia-toggle updates BOTH this cache and the DB row
// so the state survives Railway redeploys.
let niaEnabled: boolean = process.env.NIA_ENABLED !== "false";

// initNiaEnabled — called once at startup. Reads the persisted value from
// system_settings so the server boots in the correct state after a redeploy.
export async function initNiaEnabled(): Promise<void> {
  try {
    const [row] = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "nia_enabled"))
      .limit(1);
    if (row) {
      niaEnabled = row.value !== "false";
      logger.info({ niaEnabled }, "admin: Nia enabled state loaded from DB");
    }
  } catch (err) {
    logger.warn({ err }, "admin: could not read nia_enabled from system_settings, using default");
  }
}

// GET /admin/nia-status — public, no auth. Frontend polls this to know
// whether to show the NiaFab and drawer. Returns { enabled: boolean }.
router.get("/admin/nia-status", (_req, res) => {
  return res.json({ enabled: niaEnabled });
});

// POST /admin/nia-toggle — admin only. Body: { enabled: boolean }
router.post("/admin/nia-toggle", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled (boolean) is required" });
  }

  // 1. Update in-process cache immediately so the proxy reacts with no lag
  niaEnabled = enabled;

  // 2. Persist to DB so the value survives redeploys
  try {
    await db
      .insert(systemSettingsTable)
      .values({ key: "nia_enabled", value: enabled ? "true" : "false" })
      .onConflictDoUpdate({
        target: systemSettingsTable.key,
        set: { value: enabled ? "true" : "false", updated_at: new Date() },
      });
  } catch (err) {
    logger.error({ err }, "admin: failed to persist nia_enabled to system_settings");
  }

  logger.info({ niaEnabled }, "admin: Nia AI toggled");
  return res.json({ ok: true, enabled: niaEnabled });
});

// Export the flag so nia-proxy can read it from the same process
export { niaEnabled };

export default router;
''',
}

PATCHES = [
    # ── Fix 1: admin-analytics.ts ──────────────────────────────────────────────
    {
        "file": "artifacts/api-server/src/routes/admin-analytics.ts",
        "find": '''import { Router } from "express";
import { db, requestsTable, usersTable, reportsTable } from "@workspace/db";
import { eq, sql, and, gte } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { adminLimiter } from "../middlewares/rate-limit";''',
        "replace": '''import { Router } from "express";
import { db, requestsTable, usersTable, reportsTable, systemSettingsTable } from "@workspace/db";
import { eq, sql, and, gte } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { adminLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";''',
    },
    {
        "file": "artifacts/api-server/src/routes/admin-analytics.ts",
        "find": '''// ── Nia AI toggle ─────────────────────────────────────────────────────────────
// In-memory flag — defaults to enabled. Persists for the lifetime of the
// api-server process. A Railway redeploy resets it to ON, which is the safe
// default. If you need persistence across deploys, set NIA_ENABLED=false in
// Railway env vars and the flag will boot to off.
let niaEnabled: boolean = process.env.NIA_ENABLED !== "false";

// GET /admin/nia-status — public, no auth. Frontend polls this to know
// whether to show the NiaFab and drawer. Returns { enabled: boolean }.
router.get("/admin/nia-status", (_req, res) => {
  return res.json({ enabled: niaEnabled });
});

// POST /admin/nia-toggle — admin only. Body: { enabled: boolean }
router.post("/admin/nia-toggle", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled (boolean) is required" });
  }
  niaEnabled = enabled;
  logger.info({ niaEnabled }, "admin: Nia AI toggled");
  return res.json({ ok: true, enabled: niaEnabled });
});

// Export the flag so nia-proxy can read it from the same process
export { niaEnabled };

export default router;''',
        "replace": '''// ── Nia AI toggle ─────────────────────────────────────────────────────────────
// In-process cache of the DB value. Seeded from system_settings at boot via
// initNiaEnabled() below. Falls back to NIA_ENABLED env var if DB is
// unreachable at startup; defaults to true (enabled) if neither is set.
// A write via POST /admin/nia-toggle updates BOTH this cache and the DB row
// so the state survives Railway redeploys.
let niaEnabled: boolean = process.env.NIA_ENABLED !== "false";

// initNiaEnabled — called once at startup. Reads the persisted value from
// system_settings so the server boots in the correct state after a redeploy.
export async function initNiaEnabled(): Promise<void> {
  try {
    const [row] = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "nia_enabled"))
      .limit(1);
    if (row) {
      niaEnabled = row.value !== "false";
      logger.info({ niaEnabled }, "admin: Nia enabled state loaded from DB");
    }
  } catch (err) {
    logger.warn({ err }, "admin: could not read nia_enabled from system_settings, using default");
  }
}

// GET /admin/nia-status — public, no auth. Frontend polls this to know
// whether to show the NiaFab and drawer. Returns { enabled: boolean }.
router.get("/admin/nia-status", (_req, res) => {
  return res.json({ enabled: niaEnabled });
});

// POST /admin/nia-toggle — admin only. Body: { enabled: boolean }
router.post("/admin/nia-toggle", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled (boolean) is required" });
  }

  // 1. Update in-process cache immediately so the proxy reacts with no lag
  niaEnabled = enabled;

  // 2. Persist to DB so the value survives redeploys
  try {
    await db
      .insert(systemSettingsTable)
      .values({ key: "nia_enabled", value: enabled ? "true" : "false" })
      .onConflictDoUpdate({
        target: systemSettingsTable.key,
        set: { value: enabled ? "true" : "false", updated_at: new Date() },
      });
  } catch (err) {
    logger.error({ err }, "admin: failed to persist nia_enabled to system_settings");
  }

  logger.info({ niaEnabled }, "admin: Nia AI toggled");
  return res.json({ ok: true, enabled: niaEnabled });
});

// Export the flag so nia-proxy can read it from the same process
export { niaEnabled };

export default router;''',
    },

    # ── Fix 2: api-server index.ts ─────────────────────────────────────────────
    {
        "file": "artifacts/api-server/src/index.ts",
        "find": 'import { startNiaCheckinWorker } from "./workers/nia-checkin-worker";',
        "replace": 'import { startNiaCheckinWorker } from "./workers/nia-checkin-worker";\nimport { initNiaEnabled } from "./routes/admin-analytics";',
    },
    {
        "file": "artifacts/api-server/src/index.ts",
        "find": "  // Anomaly detection — runs regardless of Redis; lightweight DB polling\n  startAnomalyDetectionWorker();\n  startNiaCheckinWorker();",
        "replace": "  // Anomaly detection — runs regardless of Redis; lightweight DB polling\n  startAnomalyDetectionWorker();\n  startNiaCheckinWorker();\n  // Seed the Nia kill-switch from DB so it survives redeploys\n  initNiaEnabled();",
    },

    # ── Fix 3: nia-service chat.ts ─────────────────────────────────────────────
    {
        "file": "artifacts/nia-service/src/routes/chat.ts",
        "find": 'import { saveConversation, getRecentHistory, getScrollbackHistory, checkRateLimit, getActiveRequest, getUserMemory, upsertUserMemory } from "../lib/db.js";',
        "replace": 'import { saveConversation, getRecentHistory, getScrollbackHistory, checkRateLimit, getActiveRequest, getUserMemory, upsertUserMemory, isNiaEnabled } from "../lib/db.js";',
    },
    {
        "file": "artifacts/nia-service/src/routes/chat.ts",
        "find": 'router.post("/chat", parseOptionalAuth, injectLocation, async (req: Request, res: Response) => {\n  const body = req.body as Record<string, unknown>;',
        "replace": 'router.post("/chat", parseOptionalAuth, injectLocation, async (req: Request, res: Response) => {\n  // Defense-in-depth kill-switch check (primary block is in api-server nia-proxy)\n  if (!(await isNiaEnabled())) {\n    return res.status(503).json({ error: "Nia is temporarily unavailable." });\n  }\n\n  const body = req.body as Record<string, unknown>;',
    },
    {
        "file": "artifacts/nia-service/src/routes/chat.ts",
        "find": 'router.post("/analyze-image", parseOptionalAuth, async (req: Request, res: Response) => {\n  const body = req.body as Record<string, unknown>;',
        "replace": 'router.post("/analyze-image", parseOptionalAuth, async (req: Request, res: Response) => {\n  // Defense-in-depth kill-switch check\n  if (!(await isNiaEnabled())) {\n    return res.status(503).json({ error: "Nia is temporarily unavailable." });\n  }\n\n  const body = req.body as Record<string, unknown>;',
    },

    # ── Fix 4: admin.tsx ───────────────────────────────────────────────────────
    {
        "file": "artifacts/pay-it-forward/src/pages/admin.tsx",
        "find": '''import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Shield, AlertCircle, CheckCircle2, Clock, X, ChevronLeft,
  Eye, Flag, User as UserIcon, RefreshCw, Filter, ExternalLink,
  Users, Search, Ban, AlertTriangle, Star
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";''',
        "replace": '''import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Shield, AlertCircle, CheckCircle2, Clock, X, ChevronLeft,
  Eye, Flag, User as UserIcon, RefreshCw, Filter, ExternalLink,
  Users, Search, Ban, AlertTriangle, Star, Bot, Power
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { getToken } from "@/lib/auth";''',
    },
    {
        "file": "artifacts/pay-it-forward/src/pages/admin.tsx",
        "find": "export default function AdminScreen() {",
        "replace": r'''// ── NiaTab ────────────────────────────────────────────────────────────────────
function NiaTab() {
  const [niaEnabled, setNiaEnabled] = useState<boolean | null>(null);
  const [toggling, setToggling] = useState(false);
  const [confirmPending, setConfirmPending] = useState<boolean | null>(null);
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  useEffect(() => {
    fetch(`${base}/api/admin/nia-status`)
      .then(r => r.json())
      .then((d: { enabled: boolean }) => setNiaEnabled(d.enabled))
      .catch(() => toast({ title: "Could not fetch Nia status", variant: "destructive" }));
  }, []);

  const submitToggle = async (enabled: boolean) => {
    setConfirmPending(null);
    setToggling(true);
    try {
      const token = getToken();
      const res = await fetch(`${base}/api/admin/nia-toggle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Toggle failed");
      }
      const data = await res.json() as { enabled: boolean };
      setNiaEnabled(data.enabled);
      toast({
        title: data.enabled ? "Nia enabled" : "Nia disabled",
        description: data.enabled
          ? "Nia AI is now active for all users."
          : "Users will see a temporary unavailability message.",
      });
    } catch (err) {
      toast({ title: (err as Error).message ?? "Toggle failed", variant: "destructive" });
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="space-y-4">
      <motion.div
        layout
        className={`rounded-2xl border p-5 transition-colors ${
          niaEnabled === false
            ? "bg-destructive/5 border-destructive/30"
            : "bg-card border-border"
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
              niaEnabled === false ? "bg-destructive/10" : "bg-primary/10"
            }`}>
              <Bot className={`w-5 h-5 ${niaEnabled === false ? "text-destructive" : "text-primary"}`} />
            </div>
            <div>
              <div className="font-black text-sm">Nia AI</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {niaEnabled === null ? (
                  <span className="text-xs text-muted-foreground">Checking…</span>
                ) : (
                  <>
                    <span className={`inline-block w-2 h-2 rounded-full ${
                      niaEnabled ? "bg-green-500 animate-pulse" : "bg-muted-foreground"
                    }`} />
                    <span className={`text-xs font-bold ${
                      niaEnabled ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                    }`}>
                      {niaEnabled ? "Active — responding to users" : "Disabled — returning 503"}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            role="switch"
            aria-checked={niaEnabled ?? false}
            aria-label="Enable or disable Nia AI"
            disabled={niaEnabled === null || toggling}
            onClick={() => setConfirmPending(!niaEnabled)}
            className={`relative w-12 h-6 rounded-full transition-colors duration-200 shrink-0 disabled:opacity-40 ${
              niaEnabled ? "bg-green-500" : "bg-muted"
            }`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
              niaEnabled ? "translate-x-6" : "translate-x-0"
            }`} />
          </button>
        </div>

        <AnimatePresence>
          {niaEnabled === false && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 pt-4 border-t border-destructive/20"
            >
              <p className="text-xs text-destructive leading-relaxed">
                <span className="font-black">Nia is off.</span> All chat requests return 503.
                The NiaFab and drawer are hidden from users. Re-enable above when ready.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Persistence</div>
          <div className="text-sm font-bold text-green-600 dark:text-green-400">DB-backed</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Survives redeploys</div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Kill-switch layers</div>
          <div className="text-sm font-bold">2 of 2</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Proxy + nia-service</div>
        </div>
      </div>

      <AnimatePresence>
        {confirmPending !== null && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
              onClick={() => setConfirmPending(null)}
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 220 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-3xl p-6"
              style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                  confirmPending ? "bg-green-500/10" : "bg-destructive/10"
                }`}>
                  <Power className={`w-5 h-5 ${confirmPending ? "text-green-500" : "text-destructive"}`} />
                </div>
                <div>
                  <div className="font-black text-base">
                    {confirmPending ? "Enable Nia AI?" : "Disable Nia AI?"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {confirmPending
                      ? "Nia will become available to all users immediately."
                      : "Users will see a temporary unavailability message."}
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mb-5">
                {confirmPending
                  ? "The NiaFab and chat drawer will reappear for all users. Persisted to DB — holds across redeploys."
                  : "The NiaFab and chat drawer will be hidden. All chat and image-analysis requests return 503. Persisted to DB — Nia stays off until you re-enable it here."}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmPending(null)}
                  className="flex-1 h-11 rounded-2xl border border-border text-sm font-black active:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => submitToggle(confirmPending)}
                  disabled={toggling}
                  className={`flex-1 h-11 rounded-2xl text-sm font-black text-white transition-opacity disabled:opacity-50 ${
                    confirmPending ? "bg-green-500 active:bg-green-600" : "bg-destructive active:bg-destructive/80"
                  }`}
                >
                  {toggling ? (
                    <span className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" /> Saving…
                    </span>
                  ) : confirmPending ? "Enable Nia" : "Disable Nia"}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AdminScreen() {''',
    },
    {
        "file": "artifacts/pay-it-forward/src/pages/admin.tsx",
        "find": '''  const [authed, setAuthed] = useState(false);
  const [adminInput, setAdminInput] = useState("");
  const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET ?? "niakofa-admin-2026";
  const [, setLocation] = useLocation();
  const [reports, setReports] = useState<Report[]>([]);''',
        "replace": '''  const [authed, setAuthed] = useState(false);
  const [adminInput, setAdminInput] = useState("");
  const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET ?? "niakofa-admin-2026";
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"reports" | "users" | "nia">("reports");
  const [reports, setReports] = useState<Report[]>([]);''',
    },
    {
        "file": "artifacts/pay-it-forward/src/pages/admin.tsx",
        "find": "  useEffect(() => { if (authed) fetchReports(statusFilter); }, [statusFilter, authed]);",
        "replace": "  useEffect(() => { if (authed && activeTab === \"reports\") fetchReports(statusFilter); }, [statusFilter, authed, activeTab]);",
    },
    {
        "file": "artifacts/pay-it-forward/src/pages/admin.tsx",
        "find": '''  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl border-b border-border p-4 pt-safe">
        <div className="flex items-center gap-3">
          <button onClick={() => setLocation("/profile")} className="p-1.5 rounded-xl hover:bg-muted transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-black uppercase tracking-widest flex items-center gap-2">
              <Shield className="w-5 h-5 text-destructive" /> Admin Review
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">{reports.length} total</span>
              {pendingCount > 0 && (
                <span className="text-[10px] font-black bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 px-2 py-0.5 rounded-full">
                  {pendingCount} pending
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => fetchReports(statusFilter)}
            disabled={loading}
            className="p-2 rounded-xl hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 mt-3 overflow-x-auto scrollbar-none pb-1">
          {STATUS_FILTERS.map(s => {
            const meta = STATUS_LABELS[s];
            const isActive = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-full border transition-all ${
                  isActive
                    ? s === "all"
                      ? "bg-primary text-primary-foreground border-primary"
                      : meta?.color ?? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {s === "all" ? "All" : meta?.label ?? s}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 max-w-lg mx-auto w-full p-4 space-y-3">''',
        "replace": '''  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl border-b border-border p-4 pt-safe">
        <div className="flex items-center gap-3">
          <button onClick={() => setLocation("/profile")} className="p-1.5 rounded-xl hover:bg-muted transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-black uppercase tracking-widest flex items-center gap-2">
              <Shield className="w-5 h-5 text-destructive" /> Admin
            </h1>
          </div>
          {activeTab === "reports" && (
            <button
              onClick={() => fetchReports(statusFilter)}
              disabled={loading}
              className="p-2 rounded-xl hover:bg-muted transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>

        {/* Tab pills */}
        <div className="flex gap-2 mt-3">
          {([
            { key: "reports", label: "Reports", icon: Flag },
            { key: "users",   label: "Users",   icon: Users },
            { key: "nia",     label: "Nia AI",  icon: Bot },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full border transition-all ${
                activeTab === key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              <Icon className="w-3 h-3" />
              {label}
              {key === "reports" && pendingCount > 0 && (
                <span className="ml-0.5 bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 text-[9px] font-black px-1.5 py-0.5 rounded-full">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Report filter chips — only shown on reports tab */}
        {activeTab === "reports" && (
          <div className="flex gap-2 mt-3 overflow-x-auto scrollbar-none pb-1">
            {STATUS_FILTERS.map(s => {
              const meta = STATUS_LABELS[s];
              const isActive = statusFilter === s;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-full border transition-all ${
                    isActive
                      ? s === "all"
                        ? "bg-primary text-primary-foreground border-primary"
                        : meta?.color ?? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {s === "all" ? "All" : meta?.label ?? s}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 max-w-lg mx-auto w-full p-4 space-y-3">
        {activeTab === "nia" && <NiaTab />}
        {activeTab === "users" && <UsersTab />}
        {activeTab === "reports" && (
          <>''',
    },
    {
        "file": "artifacts/pay-it-forward/src/pages/admin.tsx",
        "find": '''      {selectedReport && (
        <ReportDetailSheet
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          onReviewed={handleReviewed}
        />
      )}
    </div>
  );
}''',
        "replace": '''          </>
        )}
      </div>

      {selectedReport && (
        <ReportDetailSheet
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          onReviewed={handleReviewed}
        />
      )}
    </div>
  );
}''',
    },
]


def apply_patch(repo, patch):
    path = os.path.join(repo, patch["file"])
    if not os.path.exists(path):
        print(f"  MISSING  {patch['file']}")
        return False
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    if patch["find"] not in content:
        # Already applied or file changed — check if replace text is present
        if patch["replace"] in content:
            print(f"  ALREADY  {patch['file']}")
            return True
        print(f"  SKIP (pattern not found)  {patch['file']}")
        return False
    new_content = content.replace(patch["find"], patch["replace"], 1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print(f"  OK       {patch['file']}")
    return True


def main():
    if not os.path.isdir(REPO):
        print(f"ERROR: repo not found at {REPO}")
        sys.exit(1)

    print(f"\nPatching {REPO}\n")
    ok = 0
    for patch in PATCHES:
        if apply_patch(REPO, patch):
            ok += 1

    print(f"\n{ok}/{len(PATCHES)} patches applied.")
    if ok == len(PATCHES):
        print("\nAll good! Now run:\n")
        print('  cd ~/niakofa')
        print('  git add -A')
        print('  git commit -m "fix: Nia kill-switch — DB persistence, boot-time seed, nia-service defense layer, admin UI toggle"')
        print('  git push origin main')
    else:
        print("\nSome patches were skipped — check output above.")


if __name__ == "__main__":
    main()
