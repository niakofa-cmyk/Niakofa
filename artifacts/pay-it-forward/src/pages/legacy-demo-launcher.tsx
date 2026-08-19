/**
 * Public Living Baobab launcher.
 *
 * The public entry screen has one job: choose a branch, then enter the
 * canonical PixiJS world.
 */

import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { LegacyLivingBaobab } from "@/components/legacy-living-baobab";
import { readDemoState } from "@/lib/legacy-demo-state";

export default function LegacyDemoLauncherPage() {
  const [, navigate] = useLocation();
  const worldVersion =
    typeof window === "undefined" ? 1 : readDemoState(window.localStorage).worldVersion;

  return (
    <main className="min-h-[100dvh] bg-[#0a0604] text-amber-100">
      <header className="mx-auto flex max-w-md items-center justify-between px-4 pt-4">
        <button
          type="button"
          onClick={() => navigate("/legacy")}
          className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-600 transition hover:text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Legacy
        </button>
        <span className="text-[9px] font-black uppercase tracking-[0.25em] text-amber-700">
          Public playable demo
        </span>
      </header>
      <div className="mx-auto max-w-lg">
        <LegacyLivingBaobab
          worldVersion={worldVersion}
          onEnter={(branchId = "ancestor") => navigate(`/legacy/world?branch=${branchId}`)}
        />
      </div>
    </main>
  );
}