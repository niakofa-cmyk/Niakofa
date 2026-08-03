/**
 * Legacy Memory Mysteries — Collaborative Investigations
 * Route: /legacy/mysteries
 *
 * The AI Game Director identifies gaps in the vault — unknown faces in
 * photos, unknown locations, missing event details — and turns them into
 * "Mystery Quests" the family solves together. Solving a mystery adds real
 * information to the vault.
 *
 * This is the "Mystery Quest" system from the design docs:
 *   "Suppose the AI discovers: Grandpa attended Lincoln High School.
 *    But we don't know: Why?
 *    The game creates: Mystery Quest — What happened at Lincoln High?"
 */

import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Loader2, Search, HelpCircle, MapPin,
  Calendar, FileText, Users, Mic, AlertCircle,
  CheckCircle2, Sparkles, Lightbulb, X,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "sonner";

interface Mystery {
  id: number;
  family_id: number;
  mystery_type: string;
  status: string;
  title: string;
  description: string | null;
  vault_item_type: string | null;
  vault_item_id: number | null;
  resolution: string | null;
  resolved_by: number | null;
  ai_hint: string | null;
  suggested_actions: string[] | null;
  created_at: string;
  resolved_at: string | null;
}

const MYSTERY_ICONS: Record<string, typeof Users> = {
  unknown_person: Users,
  unknown_place: MapPin,
  unknown_date: Calendar,
  unknown_document: FileText,
  unknown_event: AlertCircle,
  missing_interview: Mic,
};

const MYSTERY_LABELS: Record<string, string> = {
  unknown_person: "Unknown Person",
  unknown_place: "Unknown Location",
  unknown_date: "Unknown Date",
  unknown_document: "Unknown Document",
  unknown_event: "Unknown Event",
  missing_interview: "Missing Interview",
};

export default function LegacyMemoryMysteriesPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [familyId, setFamilyId] = useState<number | null>(null);
  const [mysteries, setMysteries] = useState<Mystery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [solvingId, setSolvingId] = useState<number | null>(null);
  const [resolutionText, setResolutionText] = useState("");
  const [generating, setGenerating] = useState(false);

  const loadMysteries = useCallback(async (famId: number): Promise<Mystery[]> => {
    const res = await fetch(`/api/legacy/memory-mysteries/${famId}`, { headers: authHeaders() });
    if (res.ok) {
      const data = await res.json();
      const loaded = data.mysteries ?? [];
      setMysteries(loaded);
      return loaded;
    }
    return [];
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const famRes = await fetch("/api/family/mine", { headers: authHeaders() });
        const famBody = await famRes.json().catch(() => ({}));
        const famId = famBody?.families?.[0]?.id;
        if (!famId) {
          setError("Join or create a family to see mysteries.");
          return;
        }
        setFamilyId(famId);
        const loaded = await loadMysteries(famId);

        // Auto-generate mysteries if none exist
        const openMysteries = loaded.filter((m: Mystery) => m.status === "open");
        if (openMysteries.length === 0) {
          try {
            const genRes = await fetch(`/api/legacy/ai-director/${famId}/generate`, {
              method: "POST",
              headers: authHeaders(),
            });
            if (genRes.ok) {
              await loadMysteries(famId);
            }
          } catch {
            // Non-fatal — user can manually generate later
          }
        }
      } catch {
        setError("Failed to load mysteries.");
      } finally {
        setLoading(false);
      }
    })();
  }, [currentUser, loadMysteries]);

  const generateMysteries = useCallback(async () => {
    if (!familyId) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/legacy/ai-director/${familyId}/generate`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to generate");
      const data = await res.json();
      await loadMysteries(familyId);
      if (data.gapsFound > 0) {
        toast.success(`Scanned vault — ${data.gapsFound} gap${data.gapsFound === 1 ? "" : "s"} found, mysteries updated!`);
      } else {
        toast.info(data.message || "No new mysteries found — your vault is looking complete!");
      }
    } catch {
      toast.error("Failed to generate mysteries");
    } finally {
      setGenerating(false);
    }
  }, [familyId, loadMysteries]);

  const solveMystery = useCallback(async (mysteryId: number) => {
    if (!resolutionText.trim()) {
      toast.error("Enter what you discovered");
      return;
    }
    setSolvingId(mysteryId);
    try {
      const res = await fetch(`/api/legacy/memory-mysteries/${mysteryId}/solve`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ resolution: resolutionText.trim() }),
      });
      if (!res.ok) throw new Error("Failed to solve mystery");
      const data = await res.json();
      setMysteries((m) => m.map((x) => (x.id === mysteryId ? data.mystery : x)));
      setResolutionText("");
      setSolvingId(null);
      toast.success("Mystery solved! Your family vault has been enriched.");
    } catch {
      toast.error("Failed to solve mystery");
      setSolvingId(null);
    }
  }, [resolutionText]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#1A0F08]">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#1A0F08] flex flex-col items-center justify-center gap-4 p-6">
        <AlertCircle className="w-10 h-10 text-amber-500" />
        <p className="text-amber-400 text-sm text-center">{error}</p>
        <button onClick={() => navigate("/legacy")} className="text-amber-500 text-xs underline">Back to Legacy</button>
      </div>
    );
  }

  const openMysteries = mysteries.filter((m) => m.status === "open");
  const solvedMysteries = mysteries.filter((m) => m.status === "solved");

  return (
    <div className="min-h-screen bg-[#1A0F08] pb-28">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-amber-900/30 sticky top-0 bg-[#1A0F08] z-10">
        <button onClick={() => navigate("/legacy")} className="flex items-center gap-1 text-amber-500 text-xs font-semibold">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-center">
          <h1 className="text-sm font-black text-amber-100 uppercase tracking-widest">Mysteries</h1>
          <p className="text-[10px] text-amber-700">{openMysteries.length} Open · {solvedMysteries.length} Solved</p>
        </div>
        <button
          onClick={generateMysteries}
          disabled={generating}
          className="flex items-center gap-1 text-amber-500 text-xs font-semibold disabled:opacity-40"
        >
          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Scan
        </button>
      </div>

      {/* Intro */}
      <div className="px-4 pt-4 pb-2">
        <div className="bg-gradient-to-br from-amber-900/20 to-[#2A1A0F] border border-amber-700/30 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <Search className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-200">Memory Mysteries</p>
              <p className="text-xs text-amber-600 mt-1 leading-relaxed">
                The AI Director finds gaps in your family vault — unknown faces, places, dates — and turns them
                into collaborative investigations. Solve them together to enrich your family world.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Open Mysteries */}
      {openMysteries.length > 0 && (
        <div className="px-4 mt-4">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Open Investigations</h2>
          <div className="space-y-3">
            {openMysteries.map((mystery) => {
              const Icon = MYSTERY_ICONS[mystery.mystery_type] ?? HelpCircle;
              return (
                <div key={mystery.id} className="bg-[#2A1A0F] border border-amber-700/30 rounded-2xl p-4 shadow-lg">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                        {MYSTERY_LABELS[mystery.mystery_type] ?? mystery.mystery_type}
                      </span>
                      <p className="text-sm font-bold text-amber-200 leading-tight mt-0.5">{mystery.title}</p>
                      {mystery.description && (
                        <p className="text-xs text-amber-600 mt-1 leading-relaxed">{mystery.description}</p>
                      )}
                      {mystery.ai_hint && (
                        <div className="flex items-start gap-1.5 mt-2 bg-amber-900/20 rounded-lg p-2">
                          <Lightbulb className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-500/80">{mystery.ai_hint}</p>
                        </div>
                      )}
                      {mystery.suggested_actions && mystery.suggested_actions.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {mystery.suggested_actions.map((action, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <Sparkles className="w-3 h-3 text-amber-600 flex-shrink-0" />
                              <p className="text-xs text-amber-500/70">{action}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Solve input */}
                      {solvingId === mystery.id ? (
                        <div className="mt-3 space-y-2">
                          <textarea
                            value={resolutionText}
                            onChange={(e) => setResolutionText(e.target.value)}
                            placeholder="What did you discover?"
                            className="w-full bg-[#1A0F08] border border-amber-700/30 rounded-lg p-2 text-xs text-amber-200 placeholder:text-amber-800 focus:outline-none focus:border-amber-500/50 resize-none"
                            rows={3}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => solveMystery(mystery.id)}
                              className="flex-1 bg-amber-500 text-amber-950 font-bold text-xs py-2 rounded-lg active:opacity-80"
                            >
                              Submit Answer
                            </button>
                            <button
                              onClick={() => { setSolvingId(null); setResolutionText(""); }}
                              className="bg-amber-900/30 border border-amber-700/30 text-amber-500 font-bold text-xs px-3 py-2 rounded-lg"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setSolvingId(mystery.id); setResolutionText(""); }}
                          className="mt-3 bg-amber-500/20 border border-amber-500/30 text-amber-300 font-bold text-xs uppercase tracking-wide px-4 py-2 rounded-lg active:opacity-70 flex items-center gap-1.5"
                        >
                          <Search className="w-3.5 h-3.5" /> Investigate
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Solved Mysteries */}
      {solvedMysteries.length > 0 && (
        <div className="px-4 mt-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Solved</h2>
          <div className="space-y-2">
            {solvedMysteries.map((mystery) => (
              <div key={mystery.id} className="bg-[#2A1A0F]/50 border border-emerald-900/20 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-amber-300">{mystery.title}</p>
                    {mystery.resolution && (
                      <p className="text-xs text-emerald-400/70 mt-1 italic">"{mystery.resolution}"</p>
                    )}
                    <p className="text-[10px] text-amber-700 mt-1">
                      {mystery.resolved_at ? new Date(mystery.resolved_at).toLocaleDateString() : ""}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {openMysteries.length === 0 && solvedMysteries.length === 0 && (
        <div className="px-4 mt-8 text-center">
          <Search className="w-12 h-12 text-amber-700 mx-auto mb-3" />
          <p className="text-sm text-amber-500 font-semibold">No mysteries yet</p>
          <p className="text-xs text-amber-700 mt-1">
            The AI Director will create mysteries when it finds gaps in your vault.
          </p>
        </div>
      )}
    </div>
  );
}
