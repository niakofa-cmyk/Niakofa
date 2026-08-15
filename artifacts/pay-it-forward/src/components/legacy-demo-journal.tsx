/**
 * LegacyDemoJournal — Phase 1 demo-local Memory Journal
 *
 * Shows NPC conversation outcomes, trait progress, available quests,
 * and map discoveries — all driven by local session state (no API).
 *
 * Design brief: every recorded memory bridges the "Play" loop to the
 * "Knowledge Graph → World Regeneration" loop. Each conversation here
 * is one node of future graph data.
 */

import { BookOpen, MapPin, MessageSquare, Star, TrendingUp, X } from "lucide-react";
import { getAvailableQuests } from "@/lib/legacy-quest-system";
import type { DemoPhase, DemoJournalEntry } from "@/lib/legacy-demo-state";

// DemoJournalEntry is now canonical in legacy-demo-state.ts — re-exported here
// for any components that still import it from this module.
export type { DemoJournalEntry };

// ── Style maps ───────────────────────────────────────────────────────────────

const TRAIT_LABELS: Record<string, string> = {
  wisdom: "Wisdom",
  resilience: "Resilience",
  courage: "Courage",
  community: "Community",
  legacy: "Legacy",
  curiosity: "Curiosity",
  honour: "Honour",
};

const TRAIT_COLORS: Record<string, string> = {
  wisdom: "#60a5fa",
  resilience: "#4ade80",
  courage: "#f97316",
  community: "#f43f5e",
  legacy: "#a855f7",
  curiosity: "#eab308",
  honour: "#06b6d4",
};

// ── Component ────────────────────────────────────────────────────────────────

interface LegacyDemoJournalProps {
  entries: readonly DemoJournalEntry[];
  traits: Record<string, number>;
  phase: DemoPhase;
  onClose: () => void;
}

export function LegacyDemoJournal({
  entries,
  traits,
  phase,
  onClose,
}: LegacyDemoJournalProps) {
  const availableQuests = getAvailableQuests(phase, []);

  const conversations = entries.filter((e) => e.type === "conversation");
  const discoveries = entries.filter((e) => e.type === "discovery");

  const traitEntries = Object.entries(traits).filter(([, v]) => v !== 0);

  return (
    <section
      aria-labelledby="legacy-journal-title"
      className="fixed inset-x-3 bottom-[4.75rem] z-30 mx-auto max-w-lg overflow-hidden rounded-2xl border border-amber-300/35 bg-[#0e0a06]/[.98] shadow-[0_18px_55px_rgba(0,0,0,.65)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-amber-300/20 bg-[#1a0d04]/90 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <BookOpen
            className="h-4 w-4 shrink-0 text-amber-300"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h2
              id="legacy-journal-title"
              className="truncate text-[10px] font-black uppercase tracking-[0.2em] text-amber-200"
            >
              Memory Journal
            </h2>
            <p className="text-[9px] text-amber-100/60">
              {conversations.length} conversation
              {conversations.length !== 1 ? "s" : ""} ·{" "}
              {discoveries.length} discover
              {discoveries.length !== 1 ? "ies" : "y"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-amber-200/20 bg-black/20 text-amber-200 hover:bg-amber-200/10"
          aria-label="Close Memory Journal"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="max-h-[60vh] space-y-3 overflow-y-auto p-3">

        {/* ── Life Skills ───────────────────────────────────────────────── */}
        {traitEntries.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.18em] text-amber-400/80">
              <TrendingUp className="h-3 w-3" aria-hidden="true" />
              Life Skills
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {traitEntries.map(([key, value]) => (
                <div
                  key={key}
                  className="rounded-lg border border-amber-700/20 bg-black/25 px-2 py-1.5"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[9px] font-bold text-amber-200/80">
                      {TRAIT_LABELS[key] ?? key}
                    </span>
                    <span
                      className="text-[9px] font-black"
                      style={{ color: TRAIT_COLORS[key] ?? "#e5b96b" }}
                    >
                      {value > 0 ? `+${value}` : value}
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-amber-950/60">
                    <div
                      className="h-1 rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, Math.max(0, ((value + 10) / 20) * 100))}%`,
                        background: TRAIT_COLORS[key] ?? "#e5b96b",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Quest Log ─────────────────────────────────────────────────── */}
        {availableQuests.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.18em] text-amber-400/80">
              <Star className="h-3 w-3" aria-hidden="true" />
              Available Quests
            </p>
            <div className="space-y-1.5">
              {availableQuests.map((q) => (
                <div
                  key={q.id}
                  className="rounded-lg border border-amber-700/20 bg-amber-950/20 px-2.5 py-2"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-base leading-none" aria-hidden="true">
                      {q.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-amber-200">
                        {q.title}
                      </p>
                      <p className="text-[9px] text-amber-100/60">{q.subtitle}</p>
                    </div>
                  </div>
                  <div className="mt-1.5 space-y-0.5">
                    {q.objectives.slice(0, 3).map((obj) => (
                      <p
                        key={obj.id}
                        className="flex items-center gap-1.5 text-[9px] text-amber-100/50"
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-700/60"
                          aria-hidden="true"
                        />
                        {obj.label}
                      </p>
                    ))}
                    {q.objectives.length > 3 && (
                      <p className="text-[9px] text-amber-700/60">
                        +{q.objectives.length - 3} more objectives
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Conversation Memory Log ────────────────────────────────────── */}
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.18em] text-amber-400/80">
            <MessageSquare className="h-3 w-3" aria-hidden="true" />
            Memory Log
          </p>
          {conversations.length > 0 ? (
            <div className="space-y-1">
              {conversations
                .slice()
                .reverse()
                .map((entry, i) => (
                  <div
                    key={`${entry.tag}-${i}`}
                    className="rounded-lg border border-emerald-700/20 bg-emerald-950/15 px-2.5 py-2"
                  >
                    <p className="text-[9px] font-bold text-emerald-300">
                      {entry.source}
                    </p>
                    <p className="mt-0.5 text-[9px] leading-relaxed text-amber-100/70">
                      {entry.label}
                    </p>
                  </div>
                ))}
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200/10 py-5 text-center">
              <MessageSquare
                className="mx-auto mb-2 h-5 w-5 text-amber-700/40"
                aria-hidden="true"
              />
              <p className="text-[10px] text-amber-100/40">
                No conversations yet.
              </p>
              <p className="mt-1 text-[9px] text-amber-100/30">
                Walk the map and speak with NPCs to record memories.
              </p>
            </div>
          )}
        </div>

        {/* ── Discoveries ───────────────────────────────────────────────── */}
        {discoveries.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.18em] text-amber-400/80">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              Discoveries
            </p>
            <div className="space-y-1">
              {discoveries.map((entry, i) => (
                <div
                  key={`${entry.tag}-${i}`}
                  className="rounded-lg border border-sky-700/20 bg-sky-950/15 px-2.5 py-1.5"
                >
                  <p className="text-[9px] text-sky-200/80">{entry.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-amber-300/15 bg-black/20 px-3 py-2">
        <p className="text-[9px] text-amber-100/40">
          Every memory recorded here shapes the Living World. Speak with
          ancestors. Preserve evidence. Regenerate.
        </p>
      </div>
    </section>
  );
}
