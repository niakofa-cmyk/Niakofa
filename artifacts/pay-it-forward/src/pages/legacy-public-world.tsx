/**
 * Public Legacy world — the playable House of Mensah entry point.
 *
 * This page deliberately hosts the existing PixiJS runtime directly instead
 * of routing through the authenticated chapter/session flow. The public
 * launcher is an invitation to play the authored Cape Coast scene; signed-in
 * players can still use /legacy/play and /legacy/chapter/:chapterId for
 * persisted chapter progression.
 */

import { useMemo } from "react";
import { ArrowLeft, BookOpen, CircleHelp, Compass, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { LegacyGameCanvas } from "@/legacy-runtime/LegacyGameCanvas";
import {
  mensahCompoundAssets,
  mensahCompoundScene,
  mensahCompoundBaseUrl,
  MENSAH_COMPOUND_SPAWN,
} from "@/legacy-runtime/scene-mensah-compound";
import { KWAME_SHEET_MANIFEST } from "@/legacy-runtime/kwame-sheet-manifest";

const BRANCH_CONTEXT: Record<string, { label: string; detail: string }> = {
  ancestor: {
    label: "Kwame's first branch",
    detail: "Walk the Mensah compound and listen for what the family kept.",
  },
  kitchen: {
    label: "Ama's living kitchen",
    detail: "The household remembers through the work of many hands.",
  },
  migration: {
    label: "The migration route",
    detail: "Begin at the roots, then follow the places that carry the family onward.",
  },
  living: {
    label: "Your living branch",
    detail: "Every conversation and discovery gives the world another leaf.",
  },
};

export default function LegacyPublicWorldPage() {
  const [, navigate] = useLocation();
  const branch = useMemo(() => {
    if (typeof window === "undefined") return BRANCH_CONTEXT.ancestor;
    const branchId = new URLSearchParams(window.location.search).get("branch") ?? "ancestor";
    return BRANCH_CONTEXT[branchId] ?? BRANCH_CONTEXT.ancestor;
  }, []);

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#120b07] text-amber-100">
      <div className="absolute inset-0">
        <LegacyGameCanvas
          scene={mensahCompoundScene}
          environmentAssets={mensahCompoundAssets}
          environmentBaseUrl={mensahCompoundBaseUrl}
          characterManifest={KWAME_SHEET_MANIFEST}
          initialSpawn={MENSAH_COMPOUND_SPAWN}
        />
      </div>

      {/* Lightweight game chrome stays outside the Pixi canvas so it never
          competes with the runtime's keyboard input or camera. */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3 sm:p-5">
        <div className="pointer-events-auto rounded-2xl border border-amber-400/25 bg-[#170d08]/90 px-3 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.28)] backdrop-blur-sm">
          <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-amber-500">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            House of Mensah
          </p>
          <p className="mt-0.5 text-xs font-bold text-amber-100">Cape Coast · 1890</p>
          <p className="mt-0.5 max-w-[15rem] text-[10px] leading-relaxed text-amber-200/65">
            {branch.label}
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate("/legacy/demo")}
          className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-amber-400/35 bg-[#170d08]/90 px-3 py-2 text-xs font-bold text-amber-200 shadow-[0_8px_30px_rgba(0,0,0,0.28)] backdrop-blur-sm transition hover:border-amber-200 hover:text-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Back to the Baobab</span>
          <span className="sm:hidden">Baobab</span>
        </button>
      </header>

      <aside className="pointer-events-none absolute bottom-12 left-3 z-20 hidden max-w-xs space-y-2 sm:block sm:left-5">
        <div className="rounded-2xl border border-amber-400/20 bg-[#170d08]/88 p-3 shadow-[0_8px_30px_rgba(0,0,0,0.25)] backdrop-blur-sm">
          <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-amber-500">
            <Compass className="h-3 w-3" aria-hidden="true" />
            First memory
          </p>
          <p className="mt-1 text-xs font-bold text-amber-100">Find Ama Serwaa</p>
          <p className="mt-1 text-[10px] leading-relaxed text-amber-200/65">{branch.detail}</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-[#102018]/85 px-3 py-2 text-[10px] font-semibold text-emerald-200/80 backdrop-blur-sm">
          <BookOpen className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" />
          Talk, inspect, and preserve what the world reveals.
        </div>
      </aside>

      <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-amber-400/20 bg-[#170d08]/80 px-3 py-1.5 text-[9px] font-bold text-amber-100/70 backdrop-blur-sm">
        <CircleHelp className="h-3 w-3 text-amber-400" aria-hidden="true" />
        <span>WASD / arrows move</span>
        <span className="text-amber-500/50">·</span>
        <span>Space talks</span>
        <span className="text-amber-500/50">·</span>
        <span>J attacks</span>
      </div>
    </main>
  );
}