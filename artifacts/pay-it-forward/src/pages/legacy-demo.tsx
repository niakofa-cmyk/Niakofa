/**
 * LegacyDemoPage — Standalone, public end-to-end demo of Niakofa Legacy RPG
 *
 * Route: /legacy/demo  (bypasses auth — no login required)
 *
 * Covers every system in the "House of Mensah" demo specification:
 *   Prologue → Chapter 1-6 → World Regeneration → Co-op Quest → Finale
 *
 * Progress is stored in localStorage so the demo can be resumed or reset.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowRight,
  BookOpen,
  Camera,
  CheckCircle2,
  ChevronLeft,
  Clapperboard,
  Clock,
  HeartHandshake,
  Landmark,
  Loader2,
  MapPin,
  Medal,
  Mic,
  RotateCcw,
  ScrollText,
  Sparkles,
  TreePine,
  Users,
  UtensilsCrossed,
  Zap,
} from "lucide-react";
import {
  advanceDemo,
  chooseDemoTrait,
  completeDemoQuest,
  DEFAULT_DEMO_STATE,
  DEMO_PHASE_ORDER,
  placeDemoArtifact,
  readDemoState,
  resetDemo,
  startDemoQuest,
  writeDemoState,
  type DemoPhase,
  type DemoState,
} from "@/lib/legacy-demo-state";

// ─── Chapter definitions ──────────────────────────────────────────────────────

const CHAPTERS: Array<{
  id: DemoPhase;
  number?: number;
  title: string;
  era: string;
  description: string;
  choices?: Array<{ label: string; trait: string; value: number }>;
  outcome?: string;
}> = [
  {
    id: "chapter1",
    number: 1,
    title: "The House That Built a Village",
    era: "1890",
    description:
      'You are Kwame Mensah, sixteen years old. The family owns one of the region\'s largest cocoa farms. Walk through the compound, meet your grandparents, help prepare goods for market. The village depends on you. Your grandmother watches you stare at a portrait on the wall and says: "Do you know who he was?"',
    choices: [
      { label: "Tell me.", trait: "Wisdom", value: 5 },
      { label: "I think I've heard his name.", trait: "Curiosity", value: 3 },
      { label: "I don't know.", trait: "Honesty", value: 4 },
    ],
    outcome: "You learned where you came from. The world has begun to awaken.",
  },
  {
    id: "chapter2",
    number: 2,
    title: "The Golden Years",
    era: "1901 – 1911",
    description:
      "The trading network expands. You make choices that define the family. Education or business? Helping relatives or investing in land? Resolving disputes or avoiding conflict? Every decision shapes your traits — and your descendants will inherit what you build.",
    choices: [
      { label: "Invest in education.", trait: "Wisdom", value: 8 },
      { label: "Expand the trading routes.", trait: "Leadership", value: 8 },
      { label: "Help struggling relatives.", trait: "Compassion", value: 8 },
    ],
    outcome: "The House of Mensah Trading Company is known across three villages.",
  },
  {
    id: "chapter3",
    number: 3,
    title: "Betrayal in the Village",
    era: "1912 – 1920",
    description:
      "A trusted relative secretly begins selling family land and assets. Records go missing. Village rivalries deepen. You investigate — examine ledgers, confront relatives, decide who to trust. Relationships and consequences replace combat.",
    choices: [
      { label: "Confront directly, alone.", trait: "Courage", value: 10 },
      { label: "Build evidence first.", trait: "Wisdom", value: 10 },
      { label: "Seek the elders' judgment.", trait: "Compassion", value: 8 },
    ],
    outcome: "The truth surfaced. Some relationships will never fully heal.",
  },
  {
    id: "chapter4",
    number: 4,
    title: "Collapse",
    era: "1920 – 1930",
    description:
      "The business fails. Homes are sold. Artifacts disappear. The family map shrinks. Familiar NPCs move away. You experience loss through gameplay — journals update, collectibles become locked, the world feels smaller. Some relatives remain.",
    choices: [
      { label: "Stay and rebuild.", trait: "Resilience", value: 12 },
      { label: "Document everything before it's gone.", trait: "Wisdom", value: 10 },
      { label: "Help those who cannot leave.", trait: "Compassion", value: 12 },
    ],
    outcome: "What was lost is remembered. What remains will carry the legacy forward.",
  },
  {
    id: "chapter5",
    number: 5,
    title: "Across the Ocean",
    era: "1930 – 1950",
    description:
      "Several branches of the Mensah family migrate. Ships. Train stations. First jobs. Letters exchanged across generations. The timeline advances. You follow one branch to a new life in America, watching the family grow across two continents.",
    choices: [
      { label: "Write letters home every month.", trait: "Compassion", value: 10 },
      { label: "Build a new business immediately.", trait: "Leadership", value: 10 },
      { label: "Find other diaspora families.", trait: "Community", value: 8 },
    ],
    outcome: "A new branch of the Mensah family takes root in America.",
  },
  {
    id: "chapter6",
    number: 6,
    title: "A New Beginning",
    era: "Present Day",
    description:
      "Generations later, you control Afia Mensah — granddaughter. She discovers an old Family Vault chest. Inside: photographs, handwritten letters, deeds, recordings, business ledgers, recipes, oral histories. Every item is an artifact. Every artifact unlocks a new chapter.",
    choices: [
      { label: "Open the old photograph album.", trait: "Memory", value: 8 },
      { label: "Play the recorded voice message.", trait: "Connection", value: 10 },
      { label: "Read the business ledger.", trait: "Legacy", value: 8 },
    ],
    outcome:
      "The vault is open. World Regeneration begins — the game rebuilds itself around your family's real history.",
  },
];

const ARTIFACTS = [
  { id: "photo", label: "Old photograph", icon: Camera, unlocks: "Portrait wall + family mystery quest" },
  { id: "recipe", label: "Family recipe", icon: UtensilsCrossed, unlocks: "Kitchen memory + new ancestor dialogue" },
  { id: "medal", label: "Military medal", icon: Medal, unlocks: "Display cabinet + service chapter" },
  { id: "certificate", label: "Marriage certificate", icon: ScrollText, unlocks: "Hallway timeline + relationship branch" },
];

const COOP_TASKS = [
  { id: "photo-id", label: "Identify people in old photographs", icon: Camera },
  { id: "elder-interview", label: "Interview an elder (record their voice)", icon: Mic },
  { id: "location-tag", label: "Tag an ancestral location on the map", icon: MapPin },
  { id: "reconnect", label: "Reconnect a branch of the Family Tree", icon: Users },
];

// ─── Gold button ──────────────────────────────────────────────────────────────

function GoldButton({
  onClick,
  children,
  secondary = false,
  disabled = false,
}: {
  onClick: () => void;
  children: React.ReactNode;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 px-5 font-black text-sm uppercase tracking-[0.18em] transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
      style={
        secondary
          ? {
              background: "rgba(20,12,4,0.9)",
              border: "1px solid rgba(214,158,46,0.35)",
              color: "rgba(214,158,46,0.9)",
            }
          : {
              background: "linear-gradient(135deg, #c8900a 0%, #d6a020 40%, #f5c842 100%)",
              boxShadow: "0 4px 24px rgba(214,158,46,0.35), 0 1px 0 rgba(255,255,255,0.12) inset",
              border: "1px solid rgba(245,200,66,0.4)",
              color: "#1A0A00",
            }
      }
    >
      {children}
    </button>
  );
}

// ─── Trait bar ────────────────────────────────────────────────────────────────

function TraitBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-right text-[10px] font-bold uppercase tracking-wide text-amber-600 shrink-0">
        {label}
      </span>
      <div className="flex-1 h-2 rounded-full bg-amber-950/60 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${Math.min(value, 100)}%`,
            background: "linear-gradient(90deg, #c8900a, #f5c842)",
          }}
        />
      </div>
      <span className="w-8 text-[10px] font-bold text-amber-500 shrink-0">{value}</span>
    </div>
  );
}

// ─── Phase screens ────────────────────────────────────────────────────────────

function PrologueScreen({ onBegin }: { onBegin: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center space-y-6 animate-[fadeIn_0.6s_ease-out]">
      <div className="w-20 h-20 rounded-full border-2 border-amber-500/60 flex items-center justify-center"
        style={{ background: "radial-gradient(circle, rgba(214,158,46,0.15) 0%, rgba(10,6,4,0.95) 70%)" }}>
        <span className="text-3xl">🌳</span>
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-600 mb-2">Prologue · Present Day</p>
        <h2 className="text-2xl font-black text-amber-100 mb-3" style={{ fontFamily: "Georgia, serif" }}>
          Grandma's Sunday House
        </h2>
        <p className="text-sm text-amber-300/80 leading-relaxed max-w-sm mx-auto">
          You enter your grandmother's house on a Sunday afternoon. The dining room is full of photographs,
          old documents, and heirlooms. Family members laugh while food is being prepared.
        </p>
        <p className="mt-4 text-sm text-amber-200/90 leading-relaxed max-w-sm mx-auto italic">
          Your grandmother notices you staring at an old framed portrait. She smiles and says:
        </p>
        <blockquote className="mt-3 text-base font-bold text-amber-300 italic">
          "Do you know who he was?"
        </blockquote>
        <blockquote className="mt-2 text-sm font-bold text-amber-400">
          "Then let me show you where we came from…"
        </blockquote>
      </div>
      <div className="w-full max-w-xs space-y-3">
        <GoldButton onClick={onBegin}>
          <Clapperboard className="w-4 h-4" /> Begin the Legacy
        </GoldButton>
      </div>
      <p className="text-[10px] text-amber-800 max-w-xs">
        This is a fully playable demo of Niakofa Legacy. No account required.
        Your progress saves automatically.
      </p>
    </div>
  );
}

function ChapterScreen({
  chapter,
  traits,
  onChoice,
}: {
  chapter: (typeof CHAPTERS)[0];
  traits: Record<string, number>;
  onChoice: (trait: string, value: number) => void;
}) {
  const [chosen, setChosen] = useState<number | null>(null);

  const handleChoice = (idx: number) => {
    if (chosen !== null) return;
    setChosen(idx);
    const c = chapter.choices?.[idx];
    if (c) {
      setTimeout(() => onChoice(c.trait, c.value), 900);
    }
  };

  return (
    <div className="px-4 py-6 space-y-5 animate-[fadeIn_0.5s_ease-out]">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
          <BookOpen className="w-4 h-4 text-amber-400" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600">
            Chapter {chapter.number} · {chapter.era}
          </p>
          <h2 className="text-base font-black text-amber-100" style={{ fontFamily: "Georgia, serif" }}>
            {chapter.title}
          </h2>
        </div>
      </div>

      <p className="text-sm text-amber-200/85 leading-relaxed">{chapter.description}</p>

      <div className="rounded-xl border border-amber-900/40 bg-[#21140b] p-3 space-y-2">
        <p className="text-[9px] font-black uppercase tracking-[0.25em] text-amber-700 mb-2">Kwame Mensah · Traits</p>
        {Object.entries(traits)
          .slice(0, 4)
          .map(([k, v]) => (
            <TraitBar key={k} label={k} value={v} />
          ))}
      </div>

      {chapter.choices && chosen === null && (
        <div className="space-y-2">
          <p className="text-xs font-black uppercase tracking-widest text-amber-700">Choose your path</p>
          {chapter.choices.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleChoice(i)}
              className="w-full text-left rounded-xl border border-amber-800/40 bg-[#21140b] p-3 flex items-center gap-3 active:scale-[0.98] transition-all hover:border-amber-600/50 hover:bg-amber-950/30"
            >
              <ArrowRight className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-sm text-amber-200">{c.label}</span>
            </button>
          ))}
        </div>
      )}

      {chosen !== null && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/8 p-4 animate-[fadeIn_0.3s_ease-out]">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-amber-400" />
            <p className="text-xs font-black uppercase tracking-wide text-amber-400">Choice made</p>
          </div>
          <p className="text-sm text-amber-200/90 italic">{chapter.choices?.[chosen]?.label}</p>
          <p className="mt-2 text-[10px] text-amber-600">
            +{chapter.choices?.[chosen]?.value} {chapter.choices?.[chosen]?.trait}
          </p>
          <p className="mt-3 text-xs text-amber-300/80 leading-relaxed">{chapter.outcome}</p>
          <p className="mt-2 text-[10px] text-amber-700 animate-pulse">Advancing to next chapter…</p>
        </div>
      )}
    </div>
  );
}

// ─── World Regeneration ───────────────────────────────────────────────────────

function WorldRegenScreen({ state, onPlace, onContinue }: {
  state: DemoState;
  onPlace: (id: string) => void;
  onContinue: () => void;
}) {
  const placed = new Set(state.placedArtifacts);
  const allPlaced = ARTIFACTS.every(a => placed.has(a.id));
  const [showRegen, setShowRegen] = useState(false);
  const placedCountRef = useRef(0);

  useEffect(() => {
    if (allPlaced && placedCountRef.current !== ARTIFACTS.length) {
      placedCountRef.current = ARTIFACTS.length;
      setShowRegen(true);
      const timer = setTimeout(() => setShowRegen(false), 3000);
      return () => clearTimeout(timer);
    }
    if (!allPlaced) {
      placedCountRef.current = state.placedArtifacts.length;
    }
  }, [allPlaced, state.placedArtifacts.length]);

  const changeIcons: Record<string, typeof TreePine> = {
    ancestor: TreePine,
    migration: MapPin,
    chapter: BookOpen,
    dialogue: Mic,
    location: Landmark,
  };

  return (
    <div className="px-4 py-6 space-y-5 animate-[fadeIn_0.5s_ease-out]">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-amber-400" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600">World Regeneration</p>
          <h2 className="text-base font-black text-amber-100" style={{ fontFamily: "Georgia, serif" }}>
            Every Memory Rebuilds the World
          </h2>
        </div>
      </div>

      <p className="text-sm text-amber-200/80 leading-relaxed">
        Afia records a short story from her grandmother. Watch the game respond in real time —
        place each artifact from the Family Vault into the House of Mensah.
      </p>

      {/* World changes feed */}
      {state.worldChanges.length > 0 && (
        <div className="rounded-xl border border-amber-700/40 bg-[#1a0d07] p-3 space-y-2">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-600 mb-1">
            World Changes · {state.worldChanges.length} detected
          </p>
          {state.worldChanges.map((change, i) => {
            const Icon = changeIcons[change.changeType] ?? Sparkles;
            return (
              <div
                key={change.id}
                className="flex items-center gap-2.5 animate-[fadeIn_0.4s_ease-out]"
                style={{ animationDelay: `${i * 100}ms`, animationFillMode: "backwards" }}
              >
                <span className="w-6 h-6 rounded-md bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                  <Icon className="w-3 h-3 text-amber-400" />
                </span>
                <span className="text-[11px] text-amber-300/90 leading-tight">{change.description}</span>
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 ml-auto" />
              </div>
            );
          })}
        </div>
      )}

      {/* Regeneration animation overlay */}
      {showRegen && (
        <div className="rounded-xl border border-amber-400/50 bg-gradient-to-r from-amber-950/60 to-amber-900/40 p-4 animate-[fadeIn_0.3s_ease-out]">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-amber-300">Regenerating World…</p>
              <p className="text-[10px] text-amber-500 mt-0.5">World Version {state.worldVersion} → {state.worldVersion + 1}</p>
            </div>
          </div>
        </div>
      )}

      {/* Artifact placement */}
      <div className="space-y-2">
        {ARTIFACTS.map(a => {
          const Icon = a.icon;
          const isPlaced = placed.has(a.id);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => !isPlaced && onPlace(a.id)}
              className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all active:scale-[0.98] ${
                isPlaced
                  ? "border-amber-400/50 bg-amber-400/10"
                  : "border-amber-900/40 bg-[#21140b] hover:border-amber-600/50 hover:bg-amber-950/30"
              }`}
            >
              <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                isPlaced ? "bg-amber-400/20 text-amber-300 scale-100" : "bg-amber-950/60 text-amber-600"
              }`}>
                {isPlaced ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className={`block text-xs font-bold ${isPlaced ? "text-amber-200" : "text-amber-300/90"}`}>{a.label}</span>
                <span className="block text-[10px] text-amber-700 mt-0.5">{a.unlocks}</span>
              </span>
              <span className={`text-[10px] font-bold uppercase ${isPlaced ? "text-amber-400" : "text-amber-700"}`}>
                {isPlaced ? "Placed" : "Place"}
              </span>
            </button>
          );
        })}
      </div>

      {allPlaced && !showRegen && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/8 p-4 space-y-3 animate-[fadeIn_0.5s_ease-out]">
          <p className="text-xs font-black uppercase tracking-wide text-amber-400 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5" /> World Regenerated · v{state.worldVersion + 1}
          </p>
          <ul className="space-y-1 text-[11px] text-amber-300/80">
            {state.worldChanges.map(change => (
              <li key={change.id} className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-amber-400 shrink-0" /> {change.description}
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <GoldButton onClick={onContinue}>
              <Users className="w-4 h-4" /> Invite Family · Co-op Quest
            </GoldButton>
          </div>
        </div>
      )}

      {!allPlaced && (
        <p className="text-center text-[11px] text-amber-700">
          Place all {ARTIFACTS.length} artifacts to trigger World Regeneration ({state.placedArtifacts.length}/{ARTIFACTS.length})
        </p>
      )}
    </div>
  );
}

// ─── Co-op Quest ──────────────────────────────────────────────────────────────

function CoopQuestScreen({ state, onStart, onComplete, onContinue }: {
  state: DemoState;
  onStart: (id: string) => void;
  onComplete: (id: string) => void;
  onContinue: () => void;
}) {
  const completed = new Set(state.completedQuests);
  const allDone = COOP_TASKS.every(t => completed.has(t.id));
  const inProgress = state.coopTasks.filter(t => t.status === "in-progress");

  return (
    <div className="px-4 py-6 space-y-5 animate-[fadeIn_0.5s_ease-out]">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
          <HeartHandshake className="w-4 h-4 text-rose-400" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-500">Co-op Family Quest</p>
          <h2 className="text-base font-black text-amber-100" style={{ fontFamily: "Georgia, serif" }}>
            The Lost Ledger
          </h2>
        </div>
      </div>

      {/* Quest briefing */}
      <div className="rounded-xl border border-amber-800/40 bg-[#1a0d07] p-3">
        <p className="text-xs font-bold text-amber-300 mb-1">Live Family Quest</p>
        <p className="text-[11px] text-amber-500 leading-relaxed">
          We need the whole family to help identify everyone in this photo from 1942.
          Find people who were at the school or church. Each task is assigned to a family member.
        </p>
        <div className="mt-2 flex items-center gap-2 text-[10px]">
          {["You", "Akua", "Kojo", "Ama"].map(name => {
            const task = state.coopTasks.find(t => t.assignedTo === name);
            const color = task?.status === "completed"
              ? "bg-emerald-500/20 text-emerald-400"
              : task?.status === "in-progress"
              ? "bg-amber-500/20 text-amber-400"
              : "bg-amber-900/40 text-amber-700";
            return (
              <span key={name} className={`${color} px-2 py-0.5 rounded-full font-bold transition-all`}>
                {name}
              </span>
            );
          })}
        </div>
      </div>

      {/* Legacy points */}
      {state.legacyPoints > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-amber-700/30 bg-amber-950/30 px-4 py-2.5">
          <span className="text-[10px] font-black uppercase tracking-wide text-amber-600">Legacy Points</span>
          <span className="text-lg font-black text-amber-400 tabular-nums">{state.legacyPoints}</span>
        </div>
      )}

      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-amber-950/60 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${(state.completedQuests.length / COOP_TASKS.length) * 100}%`,
              background: "linear-gradient(90deg, #e8862e, #f5c842)",
            }}
          />
        </div>
        <span className="text-[10px] font-bold text-amber-500 tabular-nums shrink-0">
          {state.completedQuests.length}/{COOP_TASKS.length}
        </span>
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {COOP_TASKS.map(task => {
          const Icon = task.icon;
          const taskState = state.coopTasks.find(t => t.questId === task.id);
          const done = completed.has(task.id);
          const started = taskState?.status === "in-progress";
          return (
            <div
              key={task.id}
              className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                done
                  ? "border-emerald-500/40 bg-emerald-500/8"
                  : started
                  ? "border-amber-500/50 bg-amber-500/8"
                  : "border-amber-900/40 bg-[#21140b]"
              }`}
            >
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                done ? "bg-emerald-500/20 text-emerald-300" : started ? "bg-amber-500/20 text-amber-300" : "bg-amber-950/60 text-amber-600"
              }`}>
                {done ? <CheckCircle2 className="w-4 h-4" /> : started ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
              </span>
              <div className="flex-1 min-w-0">
                <span className={`block text-sm ${done ? "text-emerald-300" : "text-amber-200"}`}>{task.label}</span>
                <span className="flex items-center gap-1 mt-0.5">
                  <span className={`text-[9px] font-bold uppercase ${done ? "text-emerald-500" : "text-amber-700"}`}>
                    {taskState?.assignedTo}
                  </span>
                  {done && taskState?.completedAt && (
                    <span className="flex items-center gap-0.5 text-[9px] text-amber-800">
                      <Clock className="w-2.5 h-2.5" /> done
                    </span>
                  )}
                </span>
              </div>
              {!done && !started && (
                <button
                  type="button"
                  onClick={() => onStart(task.id)}
                  className="text-[10px] font-bold uppercase text-amber-600 px-3 py-1.5 rounded-lg bg-amber-900/30 hover:bg-amber-900/50 transition-all active:scale-95 shrink-0"
                >
                  Start
                </button>
              )}
              {!done && started && (
                <button
                  type="button"
                  onClick={() => onComplete(task.id)}
                  className="text-[10px] font-bold uppercase text-amber-300 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 transition-all active:scale-95 shrink-0"
                >
                  Complete
                </button>
              )}
              {done && (
                <span className="text-[10px] font-bold uppercase text-emerald-400 shrink-0">Done</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Completion reward */}
      {allDone && (
        <div className="space-y-3 animate-[fadeIn_0.5s_ease-out]">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/8 p-4 text-[11px] text-emerald-300">
            <p className="font-black uppercase tracking-wide mb-1">Quest complete!</p>
            <p>+{state.legacyPoints} Legacy Points · New Chapter Seed unlocked · Rare Document found</p>
          </div>
          <GoldButton onClick={onContinue}>
            <TreePine className="w-4 h-4" /> Return to Sunday Dinner
          </GoldButton>
        </div>
      )}

      {!allDone && inProgress.length === 0 && (
        <p className="text-center text-[11px] text-amber-700">
          Tap "Start" to assign a task to a family member
        </p>
      )}
    </div>
  );
}

// ─── Finale ───────────────────────────────────────────────────────────────────

function FinaleScreen({ state, onRestart, onPlay }: {
  state: DemoState;
  onRestart: () => void;
  onPlay: () => void;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center space-y-6 animate-[fadeIn_0.6s_ease-out]">
      <div className="w-24 h-24 rounded-full border-2 border-amber-400/60 flex items-center justify-center"
        style={{ background: "radial-gradient(circle, rgba(214,158,46,0.2) 0%, rgba(10,6,4,0.95) 70%)" }}>
        <span className="text-4xl">🏆</span>
      </div>

      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-600 mb-2">Legacy Restored</p>
        <h2 className="text-2xl font-black text-amber-100 mb-4" style={{ fontFamily: "Georgia, serif" }}>
          The Family Gathers
        </h2>
        <p className="text-sm text-amber-300/85 leading-relaxed max-w-sm mx-auto">
          The family gathers around the grandmother's Sunday dinner table. Children laugh.
          The old photographs are matched with names. Stories once forgotten have been preserved.
          The Family Vault has grown. World Version {state.worldVersion} is live.
        </p>
        <p className="mt-4 text-sm font-bold text-amber-200 max-w-sm mx-auto italic">
          "Every generation inherits a story. Every generation decides what will be remembered."
        </p>
      </div>

      {/* Stats summary */}
      <div className="w-full max-w-xs rounded-xl border border-amber-800/40 bg-[#21140b] p-4 space-y-3 text-left">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700 mb-2">Journey Summary</p>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-amber-600">World Version</span>
          <span className="font-bold text-amber-400">v{state.worldVersion}</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-amber-600">Artifacts Placed</span>
          <span className="font-bold text-amber-400">{state.placedArtifacts.length}/4</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-amber-600">Co-op Tasks Done</span>
          <span className="font-bold text-amber-400">{state.completedQuests.length}/4</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-amber-600">Legacy Points</span>
          <span className="font-bold text-amber-400">{state.legacyPoints}</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-amber-600">World Changes</span>
          <span className="font-bold text-amber-400">{state.worldChanges.length}</span>
        </div>
        <div className="pt-2 border-t border-amber-900/40">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-700 mb-2">Kwame Mensah · Final Traits</p>
          {Object.entries(state.traits).map(([k, v]) => (
            <TraitBar key={k} label={k} value={Math.min(v, 100)} />
          ))}
        </div>
      </div>

      <div className="w-full max-w-xs space-y-3">
        <GoldButton onClick={onPlay}>
          <TreePine className="w-4 h-4" /> Continue Your Journey
        </GoldButton>
        <GoldButton onClick={onRestart} secondary>
          <RotateCcw className="w-4 h-4" /> Play Demo Again
        </GoldButton>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LegacyDemoPage() {
  const [state, setState] = useState<DemoState>(DEFAULT_DEMO_STATE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setState(readDemoState(localStorage));
    setLoaded(true);
  }, []);

  const update = useCallback((patch: Partial<DemoState>) => {
    setState(prev => {
      const next = { ...prev, ...patch };
      writeDemoState(localStorage, next);
      return next;
    });
  }, []);

  const advance = useCallback(() => {
    setState(prev => {
      const next = advanceDemo(prev);
      writeDemoState(localStorage, next);
      return next;
    });
  }, []);

  const handleChoice = useCallback((trait: string, value: number) => {
    setState(prev => {
      const next = chooseDemoTrait(prev, trait, value);
      writeDemoState(localStorage, next);
      return next;
    });
  }, []);

  const handlePlace = useCallback((id: string) => {
    setState(prev => {
      const next = placeDemoArtifact(prev, id);
      writeDemoState(localStorage, next);
      return next;
    });
  }, []);

  const handleStartQuest = useCallback((id: string) => {
    setState(prev => {
      const next = startDemoQuest(prev, id);
      writeDemoState(localStorage, next);
      return next;
    });
  }, []);

  const handleCompleteQuest = useCallback((id: string) => {
    setState(prev => {
      const next = completeDemoQuest(prev, id);
      writeDemoState(localStorage, next);
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    const fresh = resetDemo();
    writeDemoState(localStorage, fresh);
    setState(fresh);
  }, []);

  const handlePlayFull = () => {
    window.location.href = "/legacy";
  };

  if (!loaded) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ background: "#0A0604" }}
      >
        <div className="w-3 h-3 rounded-full bg-amber-500 animate-pulse" />
      </div>
    );
  }

  const chapterDef = CHAPTERS.find(c => c.id === state.phase);

  return (
    <div
      className="min-h-dvh w-full"
      style={{ background: "linear-gradient(to bottom, #0A0604 0%, #1A0F08 100%)" }}
    >
      <div
        className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
        style={{ background: "rgba(10,6,4,0.95)", borderBottom: "1px solid rgba(180,120,40,0.2)", backdropFilter: "blur(8px)" }}
      >
        {state.phase !== "prologue" && (
          <button
            type="button"
            onClick={() => {
              const idx = DEMO_PHASE_ORDER.indexOf(state.phase);
              if (idx > 0) update({ phase: DEMO_PHASE_ORDER[idx - 1] });
            }}
            className="w-8 h-8 rounded-lg bg-amber-900/30 flex items-center justify-center text-amber-500 active:opacity-70 shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-400">Niakofa Legacy · Demo</p>
          <p className="text-[10px] text-amber-700">House of Mensah · World v{state.worldVersion}</p>
        </div>
        <div className="flex items-center gap-1">
          {DEMO_PHASE_ORDER.map(p => (
            <div
              key={p}
              className="w-1.5 h-1.5 rounded-full transition-all"
              style={{
                background:
                  p === state.phase
                    ? "#f5c842"
                    : DEMO_PHASE_ORDER.indexOf(p) < DEMO_PHASE_ORDER.indexOf(state.phase)
                    ? "rgba(214,158,46,0.5)"
                    : "rgba(214,158,46,0.15)",
              }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="w-8 h-8 rounded-lg bg-amber-900/20 flex items-center justify-center text-amber-700 active:opacity-70 shrink-0"
          title="Reset demo"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="max-w-lg mx-auto pb-12">
        {state.phase === "prologue" && (
          <PrologueScreen onBegin={advance} />
        )}

        {chapterDef && state.phase !== "prologue" && (
          <ChapterScreen
            chapter={chapterDef}
            traits={state.traits}
            onChoice={handleChoice}
          />
        )}

        {state.phase === "world-regen" && (
          <WorldRegenScreen
            state={state}
            onPlace={handlePlace}
            onContinue={advance}
          />
        )}

        {state.phase === "coop-quest" && (
          <CoopQuestScreen
            state={state}
            onStart={handleStartQuest}
            onComplete={handleCompleteQuest}
            onContinue={advance}
          />
        )}

        {state.phase === "finale" && (
          <FinaleScreen
            state={state}
            onRestart={handleReset}
            onPlay={handlePlayFull}
          />
        )}
      </div>

      {state.phase !== "prologue" && state.phase !== "finale" && (
        <div
          className="fixed bottom-0 left-0 right-0 px-4 py-3"
          style={{ background: "rgba(10,6,4,0.96)", borderTop: "1px solid rgba(180,120,40,0.18)", backdropFilter: "blur(8px)" }}
        >
          <div className="max-w-lg mx-auto flex items-center justify-between gap-2 overflow-x-auto scrollbar-none">
            {[
              { icon: TreePine, label: "Family Tree" },
              { icon: ScrollText, label: "Vault" },
              { icon: Mic, label: "Stories" },
              { icon: Landmark, label: "Map" },
              { icon: BookOpen, label: "Journal" },
              { icon: Sparkles, label: "AI" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-1 shrink-0">
                <div className="w-7 h-7 rounded-lg bg-amber-950/40 border border-amber-900/30 flex items-center justify-center">
                  <Icon className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <span className="text-[8px] font-bold uppercase tracking-wide text-amber-800">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
