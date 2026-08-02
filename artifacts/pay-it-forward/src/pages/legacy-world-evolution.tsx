/**
 * Legacy World Evolution — Track how the family world has grown.
 *
 * Phase 5 of the Living Family Universe. Shows an evolution timeline of
 * every change to the family world: new members, memories, stories,
 * interviews, places, events, and world regenerations. Also shows a
 * summary of vault stats and the latest knowledge version.
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Loader2, Users, Camera, BookOpen, Mic, MapPin,
  Calendar, GitBranch, Sparkles, TrendingUp,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";

interface EvolutionEntry {
  id: number;
  family_id: number;
  knowledge_version_id: number | null;
  change_type: string;
  change_description: string | null;
  affected_count: number;
  previous_version: number | null;
  new_version: number | null;
  created_at: string;
}

interface VaultStats {
  members: number;
  memories: number;
  stories: number;
  interviews: number;
  places: number;
  events: number;
  relations: number;
}

interface EvolutionSummary {
  totalChanges: number;
  changesByType: Record<string, number>;
  latestVersion: { version: number; fingerprint: string; createdAt: string } | null;
  recentVersions: { version: number; createdAt: string }[];
}

const CHANGE_ICONS: Record<string, typeof Users> = {
  member_added: Users,
  memory_added: Camera,
  story_added: BookOpen,
  interview_added: Mic,
  place_added: MapPin,
  event_added: Calendar,
  relation_added: GitBranch,
  world_regenerated: Sparkles,
};

const CHANGE_LABELS: Record<string, string> = {
  member_added: "New Family Member",
  memory_added: "Memory Preserved",
  story_added: "Story Recorded",
  interview_added: "Interview Added",
  place_added: "Location Tagged",
  event_added: "Life Event Added",
  relation_added: "Family Connection",
  world_regenerated: "World Regenerated",
};

export default function LegacyWorldEvolutionPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<EvolutionEntry[]>([]);
  const [summary, setSummary] = useState<EvolutionSummary | null>(null);
  const [vaultStats, setVaultStats] = useState<VaultStats | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const famRes = await fetch("/api/family/mine", { headers: authHeaders() });
        const famBody = await famRes.json().catch(() => ({}));
        const famId = famBody?.families?.[0]?.id;
        if (!famId) {
          setError("Join or create a family to see world evolution.");
          setLoading(false);
          return;
        }

        const [evoRes, sumRes] = await Promise.all([
          fetch(`/api/legacy/world-evolution/${famId}`, { headers: authHeaders() }),
          fetch(`/api/legacy/world-evolution/${famId}/summary`, { headers: authHeaders() }),
        ]);

        if (!evoRes.ok || !sumRes.ok) {
          setError("Failed to load world evolution.");
          setLoading(false);
          return;
        }

        const evoBody = await evoRes.json();
        const sumBody = await sumRes.json();

        setLog(evoBody.log ?? []);
        setSummary(evoBody.summary ?? null);
        setVaultStats(sumBody.vaultStats ?? null);
      } catch {
        setError("Failed to load world evolution.");
      } finally {
        setLoading(false);
      }
    })();
  }, [currentUser]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-900">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-900 text-stone-100">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-stone-900/95 backdrop-blur-md border-b border-stone-800">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate("/legacy")}
            className="p-2 rounded-lg hover:bg-stone-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-amber-400" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-amber-100">World Evolution</h1>
            <p className="text-xs text-stone-400">How your family world has grown</p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="max-w-2xl mx-auto px-4 mt-4">
          <div className="bg-red-900/40 border border-red-800 rounded-xl p-4 text-sm text-red-200">
            {error}
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Vault Stats Summary */}
        {vaultStats && (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Members", value: vaultStats.members, icon: Users },
              { label: "Memories", value: vaultStats.memories, icon: Camera },
              { label: "Stories", value: vaultStats.stories, icon: BookOpen },
              { label: "Interviews", value: vaultStats.interviews, icon: Mic },
              { label: "Places", value: vaultStats.places, icon: MapPin },
              { label: "Events", value: vaultStats.events, icon: Calendar },
              { label: "Relations", value: vaultStats.relations, icon: GitBranch },
              { label: "Changes", value: summary?.totalChanges ?? 0, icon: TrendingUp },
            ].map((stat) => (
              <div key={stat.label} className="bg-stone-800/60 rounded-xl p-3 border border-stone-700">
                <stat.icon className="w-4 h-4 text-amber-400 mb-1.5" />
                <p className="text-xl font-bold text-stone-100">{stat.value}</p>
                <p className="text-xs text-stone-500">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Latest Version */}
        {summary?.latestVersion && (() => {
          // Find the most recent "world_regenerated" entry to show what
          // actually changed, not just the version number — this is the
          // "3 New Stories, 2 New Characters..." moment from the design docs.
          const latestRegeneration = log.find((e) => e.change_type === "world_regenerated");
          return (
            <div className="bg-amber-900/20 border border-amber-700/40 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold uppercase tracking-widest text-amber-600">
                  Your Family World Has Evolved
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-black text-amber-200">Version {summary.latestVersion.version}</p>
                {latestRegeneration?.previous_version != null && (
                  <p className="text-xs text-stone-500">from v{latestRegeneration.previous_version}</p>
                )}
              </div>
              {latestRegeneration?.change_description && (
                <p className="text-sm text-amber-100/90 mt-2 leading-snug">
                  {latestRegeneration.change_description}
                </p>
              )}
              <p className="text-xs text-stone-400 mt-2">
                Generated {new Date(summary.latestVersion.createdAt).toLocaleDateString()}
              </p>
            </div>
          );
        })()}

        {/* Evolution Timeline */}
        <div>
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Evolution Timeline</h2>
          {log.length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp className="w-10 h-10 text-stone-600 mx-auto mb-3" />
              <p className="text-stone-400 text-sm">No changes logged yet.</p>
              <p className="text-stone-500 text-xs mt-1">Add memories, stories, or family members to start building your world.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {log.map((entry) => {
                const Icon = CHANGE_ICONS[entry.change_type] ?? Sparkles;
                return (
                  <div key={entry.id} className="flex items-start gap-3 bg-stone-800/40 rounded-xl p-3 border border-stone-700/50">
                    <div className="p-2 rounded-lg bg-stone-700/60 flex-shrink-0">
                      <Icon className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-200">
                        {CHANGE_LABELS[entry.change_type] ?? entry.change_type}
                      </p>
                      {entry.change_description && (
                        <p className="text-xs text-stone-400 mt-0.5">{entry.change_description}</p>
                      )}
                      <p className="text-xs text-stone-600 mt-1">
                        {new Date(entry.created_at).toLocaleDateString()}
                        {entry.new_version && ` - v${entry.new_version}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
