/**
 * LegacyNpcDialogue — Full NPC conversation panel for the House of Mensah world.
 *
 * Design brief: "An NPC should not simply stand still waiting for the player."
 * This component presents a living character with:
 * - Typewriter dialogue reveal
 * - Branching choice options with trait requirements/effects
 * - NPC portrait + name/occupation/relationship badge
 * - Memory recall (NPC references past choices)
 * - Trait effect preview on hover
 * - Discovery flash when new artifact/knowledge is revealed
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { X, ChevronRight, Sparkles, Lock, Brain } from "lucide-react";
import type {
  NpcDefinition,
  DialogueLine,
  DialogueOption,
  NpcLorebookEntry,
} from "@/lib/legacy-npc-system";
import {
  resolveDialogueLine,
  filterAvailableOptions,
  getActiveLorebook,
} from "@/lib/legacy-npc-system";
import type { DemoSeason } from "@/lib/legacy-demo-state";

// ── Typewriter ──────────────────────────────────────────────────────────────────

function useTypewriter(text: string, speed = 18, active = true) {
  const [displayed, setDisplayed] = useState(active ? "" : text);
  const [done, setDone] = useState(!active);
  const idxRef = useRef(0);
  useEffect(() => {
    if (!active) { setDisplayed(text); setDone(true); return; }
    setDisplayed(""); setDone(false); idxRef.current = 0;
    const id = setInterval(() => {
      idxRef.current += 1;
      setDisplayed(text.slice(0, idxRef.current));
      if (idxRef.current >= text.length) { setDone(true); clearInterval(id); }
    }, speed);
    return () => clearInterval(id);
  }, [text, speed, active]);
  return { displayed, done };
}

// ── Season accent colors ────────────────────────────────────────────────────────

const SEASON_ACCENT: Record<string, string> = {
  dry: "#f5c842",
  harvest: "#f09a4b",
  rain: "#6baed6",
  celebration: "#ff9f43",
};

const EMOTION_COLOR: Record<string, string> = {
  warm: "#f5c842",
  busy: "#6baed6",
  worried: "#f08080",
  happy: "#90c060",
  solemn: "#a090c0",
  mysterious: "#c0a030",
};

const EMOTION_LABEL: Record<string, string> = {
  warm: "Warm",
  busy: "Busy",
  worried: "Worried",
  happy: "Content",
  solemn: "Solemn",
  mysterious: "Mysterious",
};

const TRAIT_META: Record<string, { icon: string; color: string }> = {
  Wisdom:     { icon: "📖", color: "#7ec8e3" },
  Leadership: { icon: "🦁", color: "#f5c842" },
  Compassion: { icon: "❤️", color: "#f08080" },
  Courage:    { icon: "⚔️", color: "#e8862e" },
};

// ── Discovery flash ─────────────────────────────────────────────────────────────

function DiscoveryFlash({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2.5 animate-[fadeInUp_0.4s_ease-out]">
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
      <div>
        <p className="text-[8px] font-black uppercase tracking-widest text-amber-500">Discovery</p>
        <p className="text-[11px] font-bold text-amber-200">{label}</p>
      </div>
    </div>
  );
}

// ── Relationship badge ─────────────────────────────────────────────────────────

const RELATIONSHIP_LABELS: Record<string, string> = {
  grandmother: "👵🏾 Elder",
  father: "👨🏾 Father",
  cousin: "👩🏾 Cousin",
  elder: "🧓🏾 Village Elder",
  trader: "🏪 Trader",
  farmer: "🌿 Farmer",
  neighbor: "🏡 Neighbor",
};

// ── Discovery label resolver ───────────────────────────────────────────────────

const DISCOVERY_LABELS: Record<string, string> = {
  "artifact-kwame-building-story": "Kwame built the compound with his own hands",
  "mystery-trading-house-betrayal": "The 1912 Trading House Betrayal",
  "quest-find-journal": "Quest: Find the Ledger",
  "artifact-family-vault-origin": "Origin of the Family Vault",
  "character-abena-mensah": "Abena Mensah — great-great-grandmother",
  "character-abena-mensah-full": "Abena Mensah's story",
  "quest-find-deed": "Quest: The Property Deed",
  "character-kwame-elder": "Kwame Mensah (elder years)",
  "memory-first-credit-1892": "The 1892 Credit — Mensah's first trade",
  "mystery-market-competitor": "Unknown buyer threatening the market",
  "quest-identify-competitor": "Quest: Identify the Market Rival",
  "skill-cocoa-grading": "Life Skill: Cocoa Grading",
  "knowledge-cocoa-grading": "Cocoa grading expertise gained",
  "clue-suspicious-buyer": "Suspicious buyer visited the farms",
  "document-buyer-contract": "Unsigned contract from the buyer",
  "document-old-receipts": "Hidden farm receipts 1893–1898",
  "clue-hidden-receipts-1893": "Hidden farm receipts with unknown signature",
  "wisdom-baobab-roots": "The Baobab teaches: preserve what nourishes you",
  "wisdom-family-preservation": "Wisdom: preserved stories sustain future generations",
  "knowledge-mensah-origins": "The Mensah name is older than the trading house",
  "history-1913-crisis": "The 1913 village crisis and survival",
  "quest-recover-memory": "Quest: Recover a Lost Memory",
  "skill-harvest-timing": "Life Skill: Harvest Timing",
};

// ── Props ───────────────────────────────────────────────────────────────────────

interface LegacyNpcDialogueProps {
  npc: NpcDefinition;
  season: DemoSeason;
  traits: Record<string, number>;
  playerMemoryTags: string[];
  onClose: () => void;
  onOutcome: (outcome: string, memoryTag?: string, discoveryId?: string, traitDelta?: { trait: string; value: number }) => void;
}

// ── Component ───────────────────────────────────────────────────────────────────

export function LegacyNpcDialogue({
  npc,
  season,
  traits,
  playerMemoryTags,
  onClose,
  onOutcome,
}: LegacyNpcDialogueProps) {
  const [currentLineId, setCurrentLineId] = useState(npc.dialogueRootId);
  const [emotion, setEmotion] = useState(npc.emotion);
  const [pendingDiscovery, setPendingDiscovery] = useState<string | null>(null);
  const [chosenOptionIdx, setChosenOptionIdx] = useState<number | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [animate, setAnimate] = useState(true);
  const accent = SEASON_ACCENT[season] ?? "#f5c842";

  const currentLine = resolveDialogueLine(npc, currentLineId, playerMemoryTags);

  // availableOptions must be declared before the lorebook memos that reference it
  const availableOptions = currentLine?.options
    ? filterAvailableOptions(currentLine.options, traits, playerMemoryTags)
    : [];

  // ── Lorebook activation (Feature 1) ────────────────────────────────────────
  // Checks whether any of this NPC's lorebook entries activate given the player's
  // accumulated memory tags. Active entries surface a "Memory Active" banner.
  const activeLorebook: NpcLorebookEntry[] = useMemo(
    () => getActiveLorebook(npc, playerMemoryTags),
    [npc, playerMemoryTags],
  );

  // Memory-gated options: options whose `requiresMemoryTag` the player doesn't yet have
  const memoryGatedLockedOptions = useMemo(
    () =>
      currentLine?.options?.filter(
        o => !availableOptions.find(a => a.id === o.id)
          && o.requiresMemoryTag
          && !o.requires
          && !playerMemoryTags.includes(o.requiresMemoryTag),
      ) ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentLine?.options, playerMemoryTags],
  );

  const { displayed, done } = useTypewriter(
    currentLine?.text ?? "",
    17,
    animate,
  );

  // Show discovery flash when line has one
  useEffect(() => {
    if (!currentLine?.discoversId || !done) return;
    const t = setTimeout(() => setPendingDiscovery(currentLine.discoversId ?? null), 300);
    return () => clearTimeout(t);
  }, [currentLine?.discoversId, done]);

  const handleOption = (opt: DialogueOption, idx: number) => {
    setChosenOptionIdx(idx);
    setAnimate(true);
    setPendingDiscovery(null);
    setHistory(h => [...h, currentLineId]);
    setTimeout(() => {
      const nextLine = resolveDialogueLine(npc, opt.nextId, playerMemoryTags);
      if (nextLine?.emotionAfter) setEmotion(nextLine.emotionAfter);
      setChosenOptionIdx(null);
      setCurrentLineId(opt.nextId);
      if (opt.trait && opt.traitDelta) {
        onOutcome("trait-gained", opt.memoryTag, undefined, { trait: opt.trait, value: opt.traitDelta });
      } else if (opt.memoryTag) {
        onOutcome("memory-tagged", opt.memoryTag);
      }
    }, 400);
  };

  const handleOutcome = (line: DialogueLine) => {
    if (line.outcome) {
      onOutcome(line.outcome, undefined, line.discoversId ?? undefined);
    }
  };

  // If conversation has ended (no options and has outcome)
  const conversationEnded =
    done &&
    !availableOptions.length &&
    currentLine &&
    (currentLine.outcome !== undefined || !currentLine.options);

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex flex-col"
      style={{ maxHeight: "72vh" }}
      role="dialog"
      aria-modal="true"
      aria-label={`Conversation with ${npc.name}`}
    >
      {/* Backdrop tap to close */}
      <div
        className="absolute inset-x-0 -top-[100vh] bottom-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="relative mx-2 mb-2 overflow-hidden rounded-3xl border border-amber-800/40 flex flex-col animate-[fadeInUp_0.35s_cubic-bezier(0.22,1,0.36,1)]"
        style={{
          background: "linear-gradient(180deg, #1a0e06 0%, #130a04 100%)",
          boxShadow: `0 -8px 40px rgba(0,0,0,0.6), 0 0 0 1px ${accent}18`,
          maxHeight: "70vh",
        }}
      >
        {/* NPC header */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b border-amber-900/30"
          style={{ background: `${accent}08` }}
        >
          {/* Avatar */}
          <div
            className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-xl border-2"
            style={{
              borderColor: `${EMOTION_COLOR[emotion]}60`,
              background: `radial-gradient(circle, ${EMOTION_COLOR[emotion]}18 0%, rgba(10,6,4,0.95) 100%)`,
            }}
            aria-hidden="true"
          >
            {npc.relationship === "grandmother" ? "👵🏾"
              : npc.relationship === "elder" ? "🧓🏾"
              : npc.relationship === "farmer" ? "🌿"
              : "👤"}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-black text-amber-100">{npc.name}</p>
              <span
                className="rounded-full px-1.5 py-0.5 text-[7px] font-black uppercase tracking-widest"
                style={{ background: `${accent}20`, color: accent, border: `1px solid ${accent}40` }}
              >
                {RELATIONSHIP_LABELS[npc.relationship] ?? npc.relationship}
              </span>
            </div>
            <p className="text-[9px] text-amber-600 truncate">{npc.occupation}</p>
          </div>

          {/* Emotion indicator */}
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div
              className="h-2 w-2 rounded-full"
              style={{ background: EMOTION_COLOR[emotion] }}
              title={`${npc.name} feels ${EMOTION_LABEL[emotion] ?? emotion}`}
              aria-label={`Emotional state: ${EMOTION_LABEL[emotion] ?? emotion}`}
            />
            <p className="text-[7px] font-bold" style={{ color: EMOTION_COLOR[emotion] }}>
              {EMOTION_LABEL[emotion] ?? emotion}
            </p>
          </div>

          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            className="ml-2 shrink-0 rounded-full h-7 w-7 flex items-center justify-center border border-amber-800/40 bg-amber-950/50 text-amber-600 hover:text-amber-300 transition-colors"
            aria-label="Close conversation"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Dialogue content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

          {/* NPC speech bubble */}
          {currentLine && (
            <div className="flex items-start gap-3">
              <div
                className="shrink-0 w-1.5 rounded-full self-stretch"
                style={{ background: `${accent}50` }}
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase tracking-wide text-amber-700 mb-1.5">
                  {npc.name}
                </p>
                <p
                  className="text-sm leading-relaxed text-amber-200/95 cursor-default"
                  onClick={() => setAnimate(false)}
                  title={animate && !done ? "Tap to skip" : undefined}
                >
                  {displayed}
                  {animate && !done && (
                    <span className="ml-0.5 inline-block w-0.5 h-[1em] bg-amber-400 legacy-cursor-blink align-middle" aria-hidden="true" />
                  )}
                </p>
                {animate && !done && (
                  <p className="mt-1 text-[8px] italic text-amber-800">Tap text to skip…</p>
                )}
              </div>
            </div>
          )}

          {/* Discovery flash */}
          {pendingDiscovery && (
            <DiscoveryFlash label={DISCOVERY_LABELS[pendingDiscovery] ?? pendingDiscovery} />
          )}

          {/* ── Lorebook "Memory Active" banner (Feature 1) ────────────────── */}
          {activeLorebook.length > 0 && (
            <div className="rounded-xl border border-violet-700/30 bg-violet-950/25 px-3 py-2.5 space-y-1">
              <div className="flex items-center gap-1.5">
                <Brain className="h-3 w-3 text-violet-400 shrink-0" aria-hidden="true" />
                <p className="text-[8px] font-black uppercase tracking-widest text-violet-400">
                  Memory Echo Active
                </p>
              </div>
              {activeLorebook.map((entry, i) => (
                <p key={i} className="text-[9px] leading-relaxed text-violet-300/80 pl-4">
                  {entry.content}
                </p>
              ))}
            </div>
          )}

          {/* Trait pills (active traits) */}
          {done && availableOptions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(traits).slice(0, 4).map(([k, v]) => {
                const meta = TRAIT_META[k] ?? { icon: "✦", color: "#f5c842" };
                return (
                  <div
                    key={k}
                    className="flex items-center gap-1 rounded-full border px-2 py-0.5"
                    style={{ borderColor: `${meta.color}28`, background: `${meta.color}0e` }}
                  >
                    <span className="text-[10px]" aria-hidden="true">{meta.icon}</span>
                    <span className="text-[8px] font-black uppercase" style={{ color: meta.color }}>{k}</span>
                    <span className="text-[8px] font-bold text-amber-500 tabular-nums">{Math.min(v, 100)}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Choices */}
          {done && availableOptions.length > 0 && chosenOptionIdx === null && (
            <div className="space-y-2">
              <p className="text-[8px] font-black uppercase tracking-widest text-amber-700">Your response</p>
              {availableOptions.map((opt, i) => {
                const meta = opt.trait ? TRAIT_META[opt.trait] : null;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleOption(opt, i)}
                    className="group w-full text-left rounded-xl border border-amber-800/35 bg-[#21140b] px-3.5 py-3 flex items-start gap-3 transition-all hover:border-amber-600/50 hover:bg-amber-950/40 active:scale-[0.98]"
                  >
                    <ChevronRight
                      className="h-4 w-4 shrink-0 mt-0.5 text-amber-700 group-hover:text-amber-500 transition-colors"
                      aria-hidden="true"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-amber-200 group-hover:text-amber-100 leading-snug">
                        {opt.label}
                      </p>
                      {opt.trait && opt.traitDelta && meta && (
                        <p
                          className="mt-0.5 text-[9px] font-bold"
                          style={{ color: meta.color, opacity: 0.75 }}
                        >
                          {meta.icon} +{opt.traitDelta} {opt.trait}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}

              {/* Trait-gated locked options */}
              {currentLine?.options
                ?.filter(o => !availableOptions.find(a => a.id === o.id) && o.requires)
                .map(opt => {
                  return (
                    <div
                      key={opt.id}
                      className="w-full text-left rounded-xl border border-amber-900/25 bg-[#180e07] px-3.5 py-3 flex items-start gap-3 opacity-50"
                    >
                      <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-800" aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-amber-600 line-through leading-snug">{opt.label}</p>
                        {opt.requires && (
                          <p className="mt-0.5 text-[9px] text-amber-700">
                            Requires {opt.requires.min}+ {opt.requires.trait}
                            {" "}(you have {traits[opt.requires.trait] ?? 0})
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}

              {/* Memory-gated locked options (Feature 1) */}
              {memoryGatedLockedOptions.map(opt => (
                <div
                  key={opt.id}
                  className="w-full text-left rounded-xl border border-violet-900/30 bg-violet-950/15 px-3.5 py-3 flex items-start gap-3 opacity-60"
                >
                  <Brain className="h-3.5 w-3.5 shrink-0 mt-0.5 text-violet-700" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-violet-600/70 line-through leading-snug">{opt.label}</p>
                    <p className="mt-0.5 text-[9px] text-violet-700">
                      Requires memory: <span className="font-bold text-violet-600">
                        {opt.requiresMemoryTag?.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Conversation end */}
          {conversationEnded && currentLine && (
            <div className="flex flex-col gap-3">
              {currentLine.discoversId && pendingDiscovery && (
                <DiscoveryFlash label={DISCOVERY_LABELS[currentLine.discoversId] ?? currentLine.discoversId} />
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    handleOutcome(currentLine);
                    onClose();
                  }}
                  className="flex-1 rounded-xl border border-amber-600/50 bg-amber-600/15 py-3 text-sm font-black text-amber-300 hover:bg-amber-600/25 active:scale-[0.98] transition-all"
                >
                  Continue
                </button>
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const prev = history[history.length - 1];
                      setHistory(h => h.slice(0, -1));
                      setCurrentLineId(prev);
                      setAnimate(true);
                      setPendingDiscovery(null);
                    }}
                    className="rounded-xl border border-amber-900/40 bg-transparent px-4 py-3 text-xs text-amber-600 hover:text-amber-400 transition-colors"
                  >
                    ← Back
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Era badge at bottom */}
        <div className="border-t border-amber-900/25 px-4 py-2 flex items-center justify-between">
          <p className="text-[8px] font-black uppercase tracking-widest text-amber-800">
            {npc.era}
          </p>
          {history.length > 0 && availableOptions.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const prev = history[history.length - 1];
                setHistory(h => h.slice(0, -1));
                setCurrentLineId(prev);
                setAnimate(true);
                setPendingDiscovery(null);
              }}
              className="text-[9px] text-amber-700 hover:text-amber-500 transition-colors"
            >
              ← Back
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
