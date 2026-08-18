import { CheckCircle2, Eye, Headphones, Link2, Search, Sparkles } from "lucide-react";
import { useState } from "react";

type EncounterChoice = {
  id: "listen" | "inspect" | "connect";
  label: string;
  detail: string;
  Icon: typeof Headphones;
};

const ENCOUNTER_CHOICES: EncounterChoice[] = [
  {
    id: "listen",
    label: "Listen to the memory",
    detail: "Hear what the preserved story says before drawing conclusions.",
    Icon: Headphones,
  },
  {
    id: "inspect",
    label: "Inspect the evidence",
    detail: "Study the recovered clue and separate family fact from reconstruction.",
    Icon: Search,
  },
  {
    id: "connect",
    label: "Connect the story",
    detail: "Link the clue to a person, place, and next question for the family.",
    Icon: Link2,
  },
];

/**
 * A Niakofa-native encounter presentation inspired by RPG command screens.
 * It intentionally has no combat/runtime dependency: the player chooses a
 * family-history verb, receives grounded context, and returns to the Vault.
 */
export function LegacyMemoryEncounter({
  worldVersion,
  completed,
  onComplete,
}: {
  worldVersion: number;
  completed: boolean;
  onComplete: () => void;
}) {
  const [selectedId, setSelectedId] = useState<EncounterChoice["id"] | null>(null);
  const selected = ENCOUNTER_CHOICES.find(choice => choice.id === selectedId);
  const background = worldVersion > 1
    ? "/legacy-world-assets/tiles/red_earth.png"
    : "/legacy-world-assets/tiles/grass_01.png";

  return (
    <section
      aria-labelledby="memory-encounter-title"
      className="overflow-hidden rounded-2xl border border-amber-400/25 bg-[#120b07] shadow-[0_18px_48px_rgba(0,0,0,0.25)]"
    >
      <div
        className="relative min-h-[190px] bg-cover bg-center"
        style={{ backgroundImage: `linear-gradient(90deg, rgba(12,7,4,0.95) 0%, rgba(12,7,4,0.7) 52%, rgba(12,7,4,0.35) 100%), url("${background}")` }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_25%,rgba(245,200,66,0.22),transparent_36%)]" />
        <div className="relative flex min-h-[190px] flex-col justify-between gap-5 p-4 sm:flex-row sm:items-end sm:p-5">
          <div className="max-w-md">
            <div className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.22em] text-amber-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Memory encounter · World v{worldVersion}
            </div>
            <h3 id="memory-encounter-title" className="text-lg font-black text-amber-50" style={{ fontFamily: "Georgia, serif" }}>
              The ledger remembers
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-amber-100/75">
              A torn page is not a battle to win. It is an invitation to preserve the people, places, and questions still connected to it.
            </p>
          </div>
          <div className="flex shrink-0 items-end gap-3">
            <div className="flex h-16 w-36 items-center justify-center rounded-lg border border-amber-200/20 bg-amber-300/10 sm:w-44">
              <Eye className="h-8 w-8 text-amber-200/80" aria-hidden="true" />
            </div>
            <Sparkles
              className="hidden h-7 w-7 text-amber-300 sm:block"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-amber-400/15 p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-600">Choose your next family-history action</p>
          {completed && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Preserved
            </span>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {ENCOUNTER_CHOICES.map(choice => {
            const isSelected = selectedId === choice.id;
            const Icon = choice.Icon;
            return (
              <button
                key={choice.id}
                type="button"
                onClick={() => setSelectedId(choice.id)}
                aria-pressed={isSelected}
                className={`flex min-h-[76px] items-center gap-3 rounded-xl border p-3 text-left transition-all focus:outline-none focus:ring-2 focus:ring-amber-300 ${
                  isSelected
                    ? "border-amber-300/70 bg-amber-300/15 text-amber-50"
                    : "border-amber-900/40 bg-black/10 text-amber-200/80 hover:border-amber-500/45 hover:bg-amber-500/10"
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-300/20 bg-black/20">
                  <Icon className="h-4 w-4 text-amber-400" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-xs font-black">
                    <Icon className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                    {choice.label}
                  </span>
                  <span className="mt-1 block text-[10px] leading-snug text-amber-100/55">{choice.detail}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 min-h-[52px] rounded-xl border border-purple-400/15 bg-purple-950/15 p-3" role="status" aria-live="polite">
          {selected ? (
            <p className="text-[11px] leading-relaxed text-purple-100/80">
              <span className="font-black text-purple-200">{selected.label}:</span> {selected.id === "listen"
                ? "Ama's voice places the ledger near the old trading house."
                : selected.id === "inspect"
                  ? "The date is clear; the buyer's identity is not. The record stays marked as unresolved."
                  : "The clue now connects a person, a place, and a question for the next interview."}
            </p>
          ) : (
            <p className="text-[11px] text-purple-100/50">Choose an action to begin the encounter.</p>
          )}
        </div>

        <button
          type="button"
          onClick={onComplete}
          disabled={!selected || completed}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300/60 bg-gradient-to-r from-amber-500 to-yellow-300 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-[#241205] transition-all hover:from-amber-400 hover:to-yellow-200 focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:pointer-events-none disabled:opacity-40"
        >
          {completed ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          {completed ? "Memory preserved in the Legacy journal" : "Preserve this discovery"}
        </button>
      </div>
    </section>
  );
}