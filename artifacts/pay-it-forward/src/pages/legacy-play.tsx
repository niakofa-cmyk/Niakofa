/**
 * Legacy Play — Living RPG Scene Router
 * Route: /legacy/play  and  /legacy/play/:sessionId
 *
 * This is the "Continue Journey" entry point.
 * It finds the user's active chapter and navigates directly into the
 * living RPG scene engine (/legacy/chapter/:chapterId), bypassing the
 * home dashboard entirely.
 *
 * Flow:
 *   1. Look up active session via GET /api/legacy/sessions/active/:familyId
 *   2. If active session with chapter → navigate to /legacy/chapter/:chapterId
 *   3. If no active session but chapters (in_progress or unlocked) → pick best & navigate
 *   4. If chapters exist but all locked → navigate to /legacy/start (ancestor select)
 *   5. If no family data → navigate to /legacy/onboarding (Chapter 0)
 *
 * Shows a cinematic "Entering your world…" screen while loading.
 */

import { useEffect, useState, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { Loader2, Sparkles, BookHeart } from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";

interface Session {
  id: number;
  current_chapter_id: number | null;
  ancestor_member_id: number | null;
}

interface Chapter {
  id: number;
  status: "locked" | "unlocked" | "in_progress" | "completed" | "skipped";
  chapter_number: number;
  title: string;
}

type LoadPhase = "loading" | "routing" | "error";

export default function LegacyPlayPage() {
  const { currentUser } = useAppContext();
  const params = useParams<{ sessionId?: string }>();
  const [, navigate] = useLocation();
  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [message, setMessage] = useState("Entering your world…");

  const resolveAndNavigate = useCallback(async () => {
    if (!currentUser) {
      navigate("/legacy/onboarding");
      return;
    }

    setPhase("loading");
    setMessage("Consulting the ancestors…");

    try {
      // Step 1: Get user's family
      const famRes = await fetch("/api/family/mine", { headers: authHeaders() });
      // 401/403 means the user isn't authenticated — send them to sign-in, not onboarding
      if (famRes.status === 401 || famRes.status === 403) {
        navigate("/login");
        return;
      }
      if (!famRes.ok) { navigate("/legacy/onboarding"); return; }
      const famData = await famRes.json() as { families?: { id: number }[] };
      const families = famData.families ?? [];
      if (!families.length) { navigate("/legacy/onboarding"); return; }
      const familyId = families[0].id;

      setMessage("Finding your chapter…");

      // Step 2: Check for a specific sessionId in the URL
      if (params.sessionId) {
        // Try to load the chapter for the specified session
        try {
          const sessRes = await fetch(`/api/legacy/sessions/active/${familyId}`, { headers: authHeaders() });
          if (sessRes.ok) {
            const sessData = await sessRes.json() as { session: Session | null };
            if (sessData.session?.current_chapter_id) {
              setMessage("Resuming journey…");
              setTimeout(() => navigate(`/legacy/chapter/${sessData.session!.current_chapter_id}`), 800);
              return;
            }
          }
        } catch { /* fall through */ }
      }

      // Step 3: Check for active session
      const sessRes = await fetch(`/api/legacy/sessions/active/${familyId}`, { headers: authHeaders() });
      if (sessRes.ok) {
        const sessData = await sessRes.json() as { session: Session | null };
        if (sessData.session?.current_chapter_id) {
          setMessage("Resuming your journey…");
          setTimeout(() => navigate(`/legacy/chapter/${sessData.session!.current_chapter_id}`), 600);
          return;
        }
      }

      setMessage("Searching for your chapters…");

      // Step 4: Check existing chapters for in_progress or unlocked
      // We need the world to exist first — try fetching chapters via completeness check
      const compRes = await fetch(`/api/legacy/completeness/${familyId}`, { headers: authHeaders() });
      const compData = compRes.ok ? await compRes.json() as { chapterUnlockReady?: boolean } : null;

      // Try to get existing chapters (GET /api/legacy/chapters/:familyId)
      const chapRes = await fetch(`/api/legacy/chapters/${familyId}`, { headers: authHeaders() }).catch(() => null);
      if (chapRes && chapRes.ok) {
        const chapData = await chapRes.json() as { chapters?: Chapter[] };
        const chapters = chapData.chapters ?? [];

        // Find best chapter: in_progress first, then unlocked
        const active = chapters.find(c => c.status === "in_progress")
          ?? chapters.find(c => c.status === "unlocked");

        if (active) {
          setMessage("Opening chapter…");
          setTimeout(() => navigate(`/legacy/chapter/${active.id}`), 600);
          return;
        }

        // All chapters locked but world exists → go to start (ancestor selection)
        if (chapters.length > 0) {
          setMessage("Choose your ancestor…");
          setTimeout(() => navigate("/legacy/start"), 600);
          return;
        }
      }

      // Step 5: No chapters yet — check readiness
      if (compData?.chapterUnlockReady) {
        // Vault is ready, just no chapters initialized — go to start
        setMessage("Begin your journey…");
        setTimeout(() => navigate("/legacy/start"), 600);
        return;
      }

      // Step 6: Check if onboarding was completed
      const onboardingDone = (() => {
        try { return localStorage.getItem("legacy:setupDone") === "1"; } catch { return false; }
      })();

      if (onboardingDone) {
        // Completed onboarding but not enough data — go to start which explains readiness
        setMessage("Building your world…");
        setTimeout(() => navigate("/legacy/start"), 600);
        return;
      }

      // Step 7: New user — go to Chapter 0 onboarding
      setMessage("Awakening your legacy…");
      setTimeout(() => navigate("/legacy/onboarding"), 600);

    } catch {
      setPhase("error");
      setMessage("Something went wrong. Returning to Legacy Hub…");
      setTimeout(() => navigate("/legacy"), 2000);
    }
  }, [currentUser, navigate, params.sessionId]);

  useEffect(() => {
    void resolveAndNavigate();
  }, [resolveAndNavigate]);

  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center"
      style={{ background: "radial-gradient(ellipse at top, #1a1308 0%, #0e0e0a 70%)" }}
    >
      {/* Ambient particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 16 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-amber-400/10"
            style={{
              width: `${1 + (i % 3)}px`,
              height: `${1 + (i % 3)}px`,
              top: `${(i * 43) % 100}%`,
              left: `${(i * 61) % 100}%`,
              animation: `pulse ${2 + (i % 4)}s ease-in-out ${i * 0.15}s infinite`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 text-center px-6 max-w-sm">
        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-6">
          {phase === "error" ? (
            <BookHeart className="w-8 h-8 text-amber-700" />
          ) : (
            <Sparkles className="w-8 h-8 text-amber-400 animate-pulse" />
          )}
        </div>

        {/* Title */}
        <h1 className="text-xs font-black text-amber-600 uppercase tracking-[0.3em] mb-3">
          Niakofa Legacy
        </h1>

        {/* Status message */}
        <p className="text-base font-bold text-amber-200 mb-6 leading-relaxed">
          {message}
        </p>

        {/* Loading spinner */}
        {phase !== "error" && (
          <Loader2 className="w-5 h-5 animate-spin text-amber-600 mx-auto" />
        )}

        {/* Shimmer line */}
        <div className="mt-8 w-24 h-px bg-gradient-to-r from-transparent via-amber-700/40 to-transparent mx-auto" />

        {/* Tagline */}
        <p className="text-[10px] text-amber-800 uppercase tracking-widest mt-3">
          Play · Discover · Preserve · Honor
        </p>
      </div>
    </div>
  );
}
