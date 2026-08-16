/**
 * Legacy Journal — standalone route wrapper.
 * Route: /legacy/journal
 *
 * The actual journal UI now lives in LegacyJournalPanel
 * (@/components/legacy-journal-panel) so it can be reused, unchanged,
 * as an in-runtime overlay inside the live chapter (LegacyChapterPlay)
 * without ever leaving the running world. This route just resolves the
 * player's family and mounts that shared panel full-page — kept for deep
 * links (e.g. shared/bookmarked URLs) and the "Journal" entry on the hub.
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { LegacyJournalPanel } from "@/components/legacy-journal-panel";

export default function LegacyJournalPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [familyId, setFamilyId] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const familyRes = await fetch("/api/family/mine", { headers: authHeaders() });
        const familyData = familyRes.ok ? await familyRes.json() : { families: [] };
        const families = (familyData.families ?? []).filter((f: { status: string }) => f.status === "active");
        setFamilyId(families[0]?.id ?? null);
      } catch {
        setFamilyId(null);
      }
    })();
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground text-sm">Sign in to view your journal</p>
      </div>
    );
  }

  if (familyId === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-[#0e1111]">
        <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <LegacyJournalPanel
      familyId={familyId}
      onClose={() => navigate("/legacy")}
      onRevisitChapter={(chapterId) => navigate(`/legacy/chapter/${chapterId}`)}
    />
  );
}
