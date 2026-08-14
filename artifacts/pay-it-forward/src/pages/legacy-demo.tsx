/**
 * LegacyDemoPage — Standalone, public end-to-end demo of Niakofa Legacy RPG
 *
 * Route: /legacy/demo  (bypasses auth — no login required)
 *
 * Covers every system in the "House of Mensah" demo specification:
 *   Living Baobab → Prologue → Chapters 1–6 → Kitchen → Business → Mystery →
 *   World Regeneration → Co-op Quest → Family Reunion → Finale
 *
 * Progress is stored in localStorage so the demo can be resumed or reset.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  Building2,
  Camera,
  CheckCircle2,
  ChevronLeft,
  Clapperboard,
  Clock,
  Eye,
  Flame,
  HeartHandshake,
  Home,
  Landmark,
  Loader2,
  MapPin,
  Medal,
  Mic,
  Package,
  RotateCcw,
  ScrollText,
  Search,
  Ship,
  Sparkles,
  TreePine,
  UtensilsCrossed,
  Users,
  Zap,
} from "lucide-react";
import {
  advanceDemo,
  advanceBusiness,
  castFishing,
  chooseDemoTrait,
  completeMemoryEncounter,
  completeReunionDialogue,
  completeDemoQuest,
  DEFAULT_DEMO_STATE,
  DEMO_STATE_EVENT,
  getDemoMemoryChain,
  DEMO_PHASE_ORDER,
  enterLivingBaobab,
  inspectDemoLandmark,
  placeDemoArtifact,
  readDemoState,
  resetDemo,
  revealMystery,
  seasonForPhase,
  summarizeDemoWorldChanges,
  startDemoQuest,
  unlockKitchenRecipe,
  updateDemoMapPosition,
  writeDemoState,
  type DemoFacing,
  type DemoMapPosition,
  type DemoPhase,
  type DemoRelationship,
  type DemoSeason,
  type DemoState,
} from "@/lib/legacy-demo-state";
import { LegacyCharacterSprite } from "@/components/legacy-character-sprite";
import { LegacyLivingWorld } from "@/components/legacy-living-world";
import { LegacyLivingBaobab } from "@/components/legacy-living-baobab";
import { LegacyMemoryEncounter } from "@/components/legacy-memory-encounter";
import { LegacySatchel, type LegacySatchelItem } from "@/components/legacy-satchel";

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
        { label: "I think I've heard his name.", trait: "Wisdom", value: 3 },
        { label: "I don't know.", trait: "Courage", value: 4 },
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
        { label: "Stay and rebuild.", trait: "Courage", value: 12 },
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
        { label: "Find other diaspora families.", trait: "Compassion", value: 8 },
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
        { label: "Open the old photograph album.", trait: "Wisdom", value: 8 },
        { label: "Play the recorded voice message.", trait: "Compassion", value: 10 },
        { label: "Read the business ledger.", trait: "Leadership", value: 8 },
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

const SATCHEL_ITEMS: readonly LegacySatchelItem[] = [
  {
    id: "photo",
    label: "Old photograph",
    icon: "📷",
    source: "Family Vault · portrait wall",
    outcome: "A named ancestor and a family mystery quest",
    description: "A preserved face becomes a question the family can investigate together.",
  },
  {
    id: "recipe",
    label: "Family recipe",
    icon: "🍲",
    source: "Grandma Ama · kitchen memory",
    outcome: "A living kitchen dialogue",
    description: "The recipe carries a voice forward without turning an interpretation into verified history.",
  },
  {
    id: "medal",
    label: "Military medal",
    icon: "🏅",
    source: "Family Vault · display cabinet",
    outcome: "A service chapter seed",
    description: "The medal opens a path to ask what returning home meant for this family.",
  },
  {
    id: "certificate",
    label: "Marriage certificate",
    icon: "📜",
    source: "Family Vault · hallway timeline",
    outcome: "A migration and relationship branch",
    description: "A document links people and place while leaving unknown details open for the family to verify.",
  },
];

const COOP_TASKS = [
  { id: "photo-id", label: "Identify people in old photographs", icon: Camera },
  { id: "elder-interview", label: "Interview an elder (record their voice)", icon: Mic },
  { id: "location-tag", label: "Tag an ancestral location on the map", icon: MapPin },
  { id: "reconnect", label: "Reconnect a branch of the Family Tree", icon: Users },
];

const KITCHEN_RECIPES = [
  {
    id: "groundnut-soup",
    name: "Grandma's Groundnut Soup",
    memory: 'While stirring, Grandma says: "This recipe came from your great-grandmother Abena. She made it the day your grandfather left for work in the city — 1932."',
    quest: "New quest: Find Abena's migration record",
    icon: "🥣",
  },
  {
    id: "kontomire-stew",
    name: "Kontomire Stew",
    memory: '"Your uncle Kwesi used to ask for this every Sunday. He said it reminded him of the house before it changed." A photo on the wall shifts — you see the family home in 1940.',
    quest: "New ancestor: Uncle Kwesi Mensah added to Family Tree",
    icon: "🍲",
  },
  {
    id: "kelewele",
    name: "Spiced Kelewele",
    memory: '"We made this for every naming ceremony. Your grandfather sold these at the village market — that\'s how the trading company began." New business location appears on the map.',
    quest: "Historical landmark unlocked: The Original Market Stall",
    icon: "🍌",
  },
];

const BUSINESS_STAGES = [
  { level: 0, name: "The Family Farm", icon: Home, desc: "A single cocoa farm. The foundation of everything.", era: "1890" },
  { level: 1, name: "The Village Warehouse", icon: Package, desc: "Goods stored and traded. A dozen families rely on the Mensah name.", era: "1900" },
  { level: 2, name: "The Market Network", icon: Building2, desc: "Three markets. Two towns. A trusted name across the region.", era: "1910" },
  { level: 3, name: "The Factory", icon: Flame, desc: "Processing cocoa for export. Workers sing. The family name means prosperity.", era: "1915" },
  { level: 4, name: "Mensah Shipping Co.", icon: Ship, desc: "Ships carry the family name to ports across West Africa and beyond. Every generation inherits more.", era: "1918" },
];

const MYSTERIES_DATA = [
  {
    id: "gold-watch",
    title: "The Missing Gold Watch",
    icon: "⌚",
    clue: "A pocket watch inscribed with initials no one recognises was sold in 1923. The buyer's name appears in a ledger — but the page is torn.",
    hint: "Investigate the 1923 family accounts. Ask Uncle Kofi about the year before he was born.",
    questUnlock: "Quest: Find the torn ledger page",
  },
  {
    id: "unlabeled-photo",
    title: "The Unlabelled Photograph",
    icon: "📷",
    clue: "A formal portrait from 1907 shows a woman in fine dress standing beside your great-grandfather. No one knows who she is. The church registry has a gap that year.",
    hint: "The church registry, 1907. Search for a baptism with no family listed.",
    questUnlock: "Quest: Identify the woman in the portrait",
  },
  {
    id: "lost-business",
    title: "The Lost Business Ledger",
    icon: "📖",
    clue: 'The family traded successfully until 1919. A ledger titled "Mensah & Sons — Vol. III" is missing. Two cousins stopped speaking that same year and never explained why.',
    hint: "The cousins: Ato and Yaw Mensah. One emigrated. One stayed silent. Find their letters.",
    questUnlock: "Quest: Recover Vol. III or reconstruct it from witnesses",
  },
];

const REUNION_NPCS = [
  {
    id: "grandma",
    name: "Grandma Ama",
    icon: "👵",
    defaultLine: '"Come, sit. You look just like your grandfather when he was your age."',
    memoryLine: (mem: string) => `"I remember — ${mem}. You carry that with you, you know."`,
    choice1: "Tell me about the old house.",
    choice2: "What should I remember?",
    response1: '"The old house had mango trees on both sides. Your great-grandfather planted them the year he married. They\'re still there — in a different city now, but still standing."',
    response2: '"Remember that this family survived everything. Betrayal. Loss. Migration. Distance. And we are still here, laughing around this table."',
    achievement: "You spoke with Grandma Ama. A new oral history was recorded.",
  },
  {
    id: "uncle-kofi",
    name: "Uncle Kofi",
    icon: "👴",
    defaultLine: '"You know, I almost didn\'t come today. I\'m glad I did."',
    memoryLine: (mem: string) => `"Last time we spoke about ${mem}. That meant something to me."`,
    choice1: "Why don't you visit more?",
    choice2: "What do you know about 1923?",
    response1: '"Distance isn\'t just miles. It\'s years of letters unanswered, phones not picked up. But family — real family — it waits. I\'m learning that."',
    response2: '"Ha. You\'ve been looking at the old accounts. Smart. Your great-grandfather\'s brother — Ato — he sold something he shouldn\'t have. We never spoke of it openly. Until now, perhaps."',
    achievement: "Uncle Kofi revealed a clue about 1923. Mystery partially solved.",
  },
  {
    id: "cousin-afia",
    name: "Cousin Afia",
    icon: "👩",
    defaultLine: '"I\'ve been going through old photos all week. There are faces I don\'t recognise at all."',
    memoryLine: (_mem: string) => '"Every time I look through these photos, I feel like I\'m missing something obvious."',
    choice1: "Show me the photos.",
    choice2: "Do you know the woman in the 1907 portrait?",
    response1: '"This one. 1942. A school photograph. I count twenty-three children but our family records only show fifteen. Who are the other eight?"',
    response2: '"My grandmother mentioned her once. She said her name was Efua — a distant cousin who moved north before the family records were properly kept. She had children. We\'ve lost that whole branch."',
    achievement: "Cousin Afia identified Efua Mensah. A new branch of the Family Tree unlocked.",
  },
  {
    id: "young-child",
    name: "Little Kofi (age 7)",
    icon: "👦",
    defaultLine: '"Are you the one who knows all the old stories?"',
    memoryLine: (_mem: string) => '"Grandma says you ask good questions."',
    choice1: "What do you want to know about our family?",
    choice2: "What's your favourite story?",
    response1: '"I want to know if we were kings. Grandma says we had a big farm and a ship. Were we kings?"',
    response2: '"The one about the market. Grandma says great-great-grandpa sold kelewele and saved enough to buy a warehouse. I want to do that too. But with a restaurant."',
    achievement: "Little Kofi is curious about the legacy. A new generation joins the story.",
  },
];

// ─── Season styling ───────────────────────────────────────────────────────────

function getSeasonStyle(season: DemoSeason) {
  switch (season) {
    case "rain":
      return { label: "🌧 Rainy Season", accent: "#6baed6", glow: "rgba(107,174,214,0.18)" };
    case "harvest":
      return { label: "🌾 Harvest Season", accent: "#f5c842", glow: "rgba(245,200,66,0.18)" };
    case "celebration":
      return { label: "🎊 Celebration", accent: "#ff9f43", glow: "rgba(255,159,67,0.22)" };
    default:
      return { label: "☀️ Dry Season", accent: "#d6a020", glow: "rgba(214,158,46,0.15)" };
  }
}

// ─── Shared components ────────────────────────────────────────────────────────

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

function RelationshipPanel({ relationships }: { relationships: DemoRelationship[] }) {
  return (
    <section
      aria-labelledby="relationship-panel-title"
      className="mx-4 mb-4 rounded-2xl border border-rose-400/20 bg-gradient-to-br from-[#211018] via-[#170b10] to-[#10070a] p-3.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-rose-300/70">Living relationships</p>
          <h2 id="relationship-panel-title" className="mt-1 text-sm font-black text-rose-100">
            The people remember what you preserve
          </h2>
        </div>
        <HeartHandshake className="mt-1 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-rose-100/60">
        Your choices change trust, respect, love, and conflict. Shared memories stay with the family.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {relationships.map(relationship => {
          const closeness = Math.round(
            (relationship.trust + relationship.respect + relationship.love + (100 - relationship.conflict)) / 4,
          );
          return (
            <div key={relationship.npcId} className="rounded-xl border border-rose-200/10 bg-black/15 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-black text-rose-100">{relationship.name}</p>
                  <p className="truncate text-[9px] text-rose-200/50">{relationship.role}</p>
                </div>
                <span className="shrink-0 text-[9px] font-black text-rose-300">{closeness}% bond</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                {[
                  ["Trust", relationship.trust, "bg-sky-300"],
                  ["Respect", relationship.respect, "bg-amber-300"],
                  ["Love", relationship.love, "bg-rose-300"],
                  ["Conflict", relationship.conflict, "bg-violet-300"],
                ].map(([label, value, color]) => (
                  <div key={label as string} className="flex items-center gap-1.5">
                    <span className="w-10 text-[8px] uppercase tracking-wide text-rose-100/45">{label}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-rose-950/70">
                      <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
                    </div>
                    <span className="w-5 text-right text-[8px] font-bold text-rose-100/65">{value}</span>
                  </div>
                ))}
              </div>
              {relationship.sharedMemories.length > 0 && (
                <p className="mt-2 truncate border-t border-rose-200/10 pt-1.5 text-[9px] italic text-rose-200/55">
                  Last shared memory: {relationship.sharedMemories.at(-1)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Phase screens ────────────────────────────────────────────────────────────

function PrologueScreen({ onBegin, season }: { onBegin: () => void; season: DemoSeason }) {
  const { label: seasonLabel } = getSeasonStyle(season);
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center space-y-6 animate-[fadeIn_0.6s_ease-out]">
      <div
        className="w-20 h-20 rounded-full border-2 border-amber-500/60 flex items-center justify-center"
        style={{ background: "radial-gradient(circle, rgba(214,158,46,0.15) 0%, rgba(10,6,4,0.95) 70%)" }}
      >
        <span className="text-3xl">🌳</span>
      </div>
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-amber-700 mb-1">{seasonLabel}</p>
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

      <div className="w-full max-w-xs rounded-xl border border-amber-900/40 bg-[#1a0d07] p-3 flex items-center gap-3 text-left">
        <LegacyCharacterSprite
          ageGroup="kid"
          gender="unspecified"
          characterId="kwame-mensah"
          lifeStage="youth"
          era="1890s"
          appearanceSeed="house-of-mensah"
          libraryId="niakofa-original-art-demo-v1"
          size={64}
          className="rounded-xl"
        />
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-700">Your first playable ancestor</p>
          <p className="mt-1 text-sm font-bold text-amber-200">Kwame Mensah</p>
          <p className="text-[10px] leading-relaxed text-amber-500/80">
            Age 16 · 1890 · family compound
          </p>
          <p className="mt-1 text-[9px] text-amber-800">Stylized RPG character · not a historical likeness</p>
        </div>
      </div>

      {/* Living House preview */}
      <div className="w-full max-w-xs rounded-xl border border-amber-900/40 bg-[#1a0d07] p-3 text-left space-y-2">
        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-amber-700">The House Changes With Every Memory</p>
        {[
          { icon: "🖼", text: "Add a photo → it appears on the wall" },
          { icon: "📜", text: "Add a recipe → it lives in the kitchen" },
          { icon: "🏅", text: "Add a medal → it goes in the cabinet" },
        ].map(({ icon, text }) => (
          <div key={text} className="flex items-center gap-2 text-[10px] text-amber-500">
            <span>{icon}</span><span>{text}</span>
          </div>
        ))}
      </div>

      <div className="w-full max-w-xs space-y-3">
        <GoldButton onClick={onBegin}>
          <Clapperboard className="w-4 h-4" /> Begin the Legacy
        </GoldButton>
      </div>
      <p className="text-[10px] text-amber-800 max-w-xs">
        Fully playable demo — no account required. Your progress saves automatically.
      </p>
    </div>
  );
}

function ChapterScreen({
  chapter,
  traits,
  npcMemory,
  season,
  onChoice,
}: {
  chapter: (typeof CHAPTERS)[0];
  traits: Record<string, number>;
  npcMemory: { npcName: string; remembers: string }[];
  season: DemoSeason;
  onChoice: (trait: string, value: number) => void;
}) {
  const [chosen, setChosen] = useState<number | null>(null);
  const { label: seasonLabel } = getSeasonStyle(season);

  const handleChoice = (idx: number) => {
    if (chosen !== null) return;
    setChosen(idx);
    const c = chapter.choices?.[idx];
    if (c) {
      setTimeout(() => onChoice(c.trait, c.value), 900);
    }
  };

  // Find relevant NPC memory for this chapter
  const relevantMemory = npcMemory.find(m => m.remembers.includes("Chapter"));

  return (
    <div className="px-4 py-6 space-y-5 animate-[fadeIn_0.5s_ease-out]">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
          <BookOpen className="w-4 h-4 text-amber-400" />
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-700">{seasonLabel}</p>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600">
            Chapter {chapter.number} · {chapter.era}
          </p>
          <h2 className="text-base font-black text-amber-100" style={{ fontFamily: "Georgia, serif" }}>
            {chapter.title}
          </h2>
        </div>
      </div>

      <p className="text-sm text-amber-200/85 leading-relaxed">{chapter.description}</p>

      {/* NPC Memory hint */}
      {relevantMemory && (
        <div className="rounded-xl border border-amber-700/30 bg-amber-950/30 p-2.5 flex items-start gap-2 animate-[fadeIn_0.4s_ease-out]">
          <span className="text-sm mt-0.5">💬</span>
          <p className="text-[10px] text-amber-500 leading-relaxed italic">
            Grandma remembers: "{relevantMemory.remembers}"
          </p>
        </div>
      )}

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
          <p className="mt-2 text-[10px] text-amber-700 animate-pulse">Advancing…</p>
        </div>
      )}
    </div>
  );
}

// ─── Family Kitchen ───────────────────────────────────────────────────────────

function KitchenScreen({
  state,
  onUnlock,
  onContinue,
}: {
  state: DemoState;
  onUnlock: (id: string) => void;
  onContinue: () => void;
}) {
  const [activeRecipe, setActiveRecipe] = useState<string | null>(null);
  const [cooking, setCooking] = useState(false);
  const unlockedCount = state.kitchenRecipes.filter(r => r.unlocked).length;
  const allUnlocked = unlockedCount >= KITCHEN_RECIPES.length;

  const handleCook = (id: string) => {
    if (cooking) return;
    setActiveRecipe(id);
    setCooking(true);
    setTimeout(() => {
      onUnlock(id);
      setCooking(false);
    }, 1200);
  };

  return (
    <div className="px-4 py-6 space-y-5 animate-[fadeIn_0.5s_ease-out]">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center shrink-0">
          <UtensilsCrossed className="w-4 h-4 text-orange-400" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500">🌾 Harvest Season · The Kitchen</p>
          <h2 className="text-base font-black text-amber-100" style={{ fontFamily: "Georgia, serif" }}>
            Recipes Unlock Memories
          </h2>
        </div>
      </div>

      <div className="rounded-xl border border-orange-900/40 bg-[#1a0d07] p-3">
        <p className="text-xs font-bold text-amber-300 mb-1">Grandma Ama's Kitchen — 1905</p>
        <p className="text-[11px] text-amber-500 leading-relaxed">
          While cooking together, Grandma suddenly tells stories. Every recipe carries a memory.
          Every memory reveals a new ancestor, quest, or location on the map.
        </p>
      </div>

      {/* Recipe cards */}
      <div className="space-y-3">
        {KITCHEN_RECIPES.map(recipe => {
          const recipeState = state.kitchenRecipes.find(r => r.id === recipe.id);
          const isUnlocked = recipeState?.unlocked ?? false;
          const isActive = activeRecipe === recipe.id;
          const isCooking = isActive && cooking;

          return (
            <div
              key={recipe.id}
              className={`rounded-xl border p-4 transition-all ${
                isUnlocked
                  ? "border-orange-500/40 bg-orange-500/8"
                  : "border-amber-900/40 bg-[#21140b]"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5">{recipe.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold ${isUnlocked ? "text-amber-200" : "text-amber-300/80"}`}>
                    {recipe.name}
                  </p>
                  {isUnlocked && (
                    <div className="mt-2 space-y-1.5 animate-[fadeIn_0.5s_ease-out]">
                      <p className="text-[11px] text-amber-400/90 leading-relaxed italic">
                        {recipe.memory}
                      </p>
                      <p className="text-[10px] text-orange-400 font-bold">
                        ✦ {recipe.quest}
                      </p>
                    </div>
                  )}
                </div>
                {!isUnlocked && (
                  <button
                    type="button"
                    onClick={() => handleCook(recipe.id)}
                    disabled={isCooking}
                    className="shrink-0 text-[10px] font-bold uppercase text-amber-600 px-3 py-1.5 rounded-lg bg-amber-900/30 hover:bg-amber-900/50 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1"
                  >
                    {isCooking ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /> Cooking…</>
                    ) : (
                      "Cook"
                    )}
                  </button>
                )}
                {isUnlocked && (
                  <CheckCircle2 className="w-4 h-4 text-orange-400 shrink-0 mt-1" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-amber-950/60 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${(unlockedCount / KITCHEN_RECIPES.length) * 100}%`,
              background: "linear-gradient(90deg, #e8862e, #f5c842)",
            }}
          />
        </div>
        <span className="text-[10px] font-bold text-amber-500 shrink-0">{unlockedCount}/{KITCHEN_RECIPES.length} recipes</span>
      </div>

      {allUnlocked && (
        <div className="space-y-3 animate-[fadeIn_0.5s_ease-out]">
          <div className="rounded-xl border border-orange-400/30 bg-orange-400/8 p-3">
            <p className="text-xs font-black uppercase tracking-wide text-orange-400 mb-1">Kitchen Complete</p>
            <p className="text-[11px] text-amber-300/80">
              Three recipes. Three memories. Three new threads in the family story. The kitchen is no longer just a room — it is a living archive.
            </p>
          </div>
          <GoldButton onClick={onContinue}>
            <BookOpen className="w-4 h-4" /> Continue the Story
          </GoldButton>
        </div>
      )}

      {!allUnlocked && (
        <p className="text-center text-[11px] text-amber-700">
          Cook all {KITCHEN_RECIPES.length} recipes to unlock hidden family memories
        </p>
      )}
    </div>
  );
}

// ─── Business Legacy ──────────────────────────────────────────────────────────

function BusinessScreen({
  state,
  onAdvance,
  onContinue,
}: {
  state: DemoState;
  onAdvance: () => void;
  onContinue: () => void;
}) {
  const next = BUSINESS_STAGES[state.businessLevel + 1];
  const maxed = state.businessLevel >= 4;

  return (
    <div className="px-4 py-6 space-y-5 animate-[fadeIn_0.5s_ease-out]">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
          <Briefcase className="w-4 h-4 text-blue-400" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">🌧 Rainy Season · Business Legacy</p>
          <h2 className="text-base font-black text-amber-100" style={{ fontFamily: "Georgia, serif" }}>
            House of Mensah Trading Co.
          </h2>
        </div>
      </div>

      <p className="text-sm text-amber-200/80 leading-relaxed">
        The family business is not just wealth — it is legacy made visible. Every generation expands what the last one built.
        Eventually, the modern descendants inherit it all.
      </p>

      {/* Business progression ladder */}
      <div className="space-y-2">
        {BUSINESS_STAGES.map((stage, i) => {
          const Icon = stage.icon;
          const isActive = i === state.businessLevel;
          const isPast = i < state.businessLevel;
          return (
            <div
              key={stage.level}
              className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
                isActive
                  ? "border-blue-400/50 bg-blue-400/10 scale-[1.01]"
                  : isPast
                  ? "border-amber-700/30 bg-amber-950/20"
                  : "border-amber-900/20 bg-transparent opacity-40"
              }`}
            >
              <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                isActive ? "bg-blue-400/20 text-blue-300" : isPast ? "bg-amber-500/15 text-amber-400" : "bg-amber-950/40 text-amber-800"
              }`}>
                <Icon className="w-4 h-4" />
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-bold ${isActive ? "text-blue-200" : isPast ? "text-amber-300" : "text-amber-700"}`}>
                  {stage.name}
                </p>
                {isActive && (
                  <p className="text-[10px] text-amber-500 leading-tight mt-0.5">{stage.desc}</p>
                )}
              </div>
              <span className={`text-[9px] font-bold uppercase shrink-0 ${
                isActive ? "text-blue-400" : isPast ? "text-amber-600" : "text-amber-800"
              }`}>{stage.era}</span>
              {isPast && <CheckCircle2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
              {isActive && <Zap className="w-3.5 h-3.5 text-blue-400 shrink-0 animate-pulse" />}
            </div>
          );
        })}
      </div>

      {/* Legacy points earned */}
      {state.legacyPoints > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-amber-700/30 bg-amber-950/30 px-4 py-2.5">
          <span className="text-[10px] font-black uppercase tracking-wide text-amber-600">Legacy Points</span>
          <span className="text-lg font-black text-amber-400 tabular-nums">{state.legacyPoints}</span>
        </div>
      )}

      {!maxed && next && (
        <div className="space-y-2">
          <div className="rounded-xl border border-amber-800/40 bg-[#1a0d07] p-3">
            <p className="text-[10px] text-amber-600 font-bold mb-1">Next: {next.name} ({next.era})</p>
            <p className="text-[11px] text-amber-500">{next.desc}</p>
          </div>
          <GoldButton onClick={onAdvance}>
            <Zap className="w-4 h-4" /> Expand the Business
          </GoldButton>
        </div>
      )}

      {maxed && (
        <div className="space-y-3 animate-[fadeIn_0.5s_ease-out]">
          <div className="rounded-xl border border-blue-400/30 bg-blue-400/8 p-3">
            <p className="text-xs font-black uppercase tracking-wide text-blue-400 mb-1">Empire Built</p>
            <p className="text-[11px] text-amber-300/80">
              The House of Mensah name is known across ports and markets. Every generation that follows inherits not just wealth — but a story of what was built from nothing.
            </p>
          </div>
          <GoldButton onClick={onContinue}>
            <TreePine className="w-4 h-4" /> Continue the Legacy
          </GoldButton>
        </div>
      )}
    </div>
  );
}

// ─── Secret Mysteries ─────────────────────────────────────────────────────────

function MysteryScreen({
  state,
  onReveal,
  onEncounterComplete,
  onContinue,
}: {
  state: DemoState;
  onReveal: (id: string) => void;
  onEncounterComplete: () => void;
  onContinue: () => void;
}) {
  const [investigating, setInvestigating] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const anyRevealed = state.mysteries.some(m => m.revealed);

  const handleInvestigate = (id: string) => {
    setInvestigating(id);
    setTimeout(() => {
      onReveal(id);
      setRevealed(id);
      setInvestigating(null);
    }, 1500);
  };

  return (
    <div className="px-4 py-6 space-y-5 animate-[fadeIn_0.5s_ease-out]">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center shrink-0">
          <Search className="w-4 h-4 text-purple-400" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-400">☀️ Dry Season · Family Secrets</p>
          <h2 className="text-base font-black text-amber-100" style={{ fontFamily: "Georgia, serif" }}>
            Unsolved Mysteries
          </h2>
        </div>
      </div>

      <p className="text-sm text-amber-200/80 leading-relaxed">
        Every family carries secrets that span generations. These mysteries keep players returning — some may never be fully solved. Each clue unlocks a new quest, character, or location.
      </p>

      <div className="space-y-3">
        {MYSTERIES_DATA.map(mystery => {
          const mysteryState = state.mysteries.find(m => m.id === mystery.id);
          const isRevealed = mysteryState?.revealed ?? false;
          const isInvestigating = investigating === mystery.id;
          const isJustRevealed = revealed === mystery.id;

          return (
            <div
              key={mystery.id}
              className={`rounded-xl border p-4 transition-all ${
                isRevealed
                  ? "border-purple-500/40 bg-purple-500/8"
                  : "border-amber-900/40 bg-[#21140b]"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl mt-0.5">{mystery.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold ${isRevealed ? "text-purple-200" : "text-amber-300/80"}`}>
                    {mystery.title}
                  </p>
                  {!isRevealed && (
                    <p className="text-[10px] text-amber-700 mt-1 leading-relaxed line-clamp-2">
                      {mystery.clue.slice(0, 80)}…
                    </p>
                  )}
                  {isRevealed && (
                    <div className="mt-2 space-y-2 animate-[fadeIn_0.5s_ease-out]">
                      <p className="text-[11px] text-amber-400/90 leading-relaxed italic">{mystery.clue}</p>
                      <div className="rounded-lg bg-purple-950/30 border border-purple-500/25 p-2">
                        <p className="text-[10px] text-purple-300 font-bold flex items-start gap-1">
                          <Eye className="w-3 h-3 mt-0.5 shrink-0" /> {mystery.hint}
                        </p>
                      </div>
                      <p className="text-[10px] text-purple-400 font-bold">✦ {mystery.questUnlock}</p>
                    </div>
                  )}
                </div>
                {!isRevealed && (
                  <button
                    type="button"
                    onClick={() => handleInvestigate(mystery.id)}
                    disabled={!!investigating}
                    className="shrink-0 text-[10px] font-bold uppercase text-purple-400 px-3 py-1.5 rounded-lg bg-purple-900/30 hover:bg-purple-900/50 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1"
                  >
                    {isInvestigating ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /> Searching…</>
                    ) : (
                      <><Search className="w-3 h-3" /> Investigate</>
                    )}
                  </button>
                )}
                {isRevealed && !isJustRevealed && <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0 mt-1" />}
              </div>
            </div>
          );
        })}
      </div>

      <LegacyMemoryEncounter
        worldVersion={state.worldVersion}
        completed={state.memoryEncounterCompleted}
        onComplete={onEncounterComplete}
      />

      {anyRevealed && (
        <div className="space-y-3 animate-[fadeIn_0.5s_ease-out]">
          <div className="rounded-xl border border-purple-400/30 bg-purple-400/8 p-3">
            <p className="text-xs font-black uppercase tracking-wide text-purple-400 mb-1">Mystery Revealed</p>
            <p className="text-[11px] text-amber-300/80">
              Every family has secrets that span generations. In the full game, mysteries like these unlock additional chapters, ancestors, and locations — and some can only be solved together as a family.
            </p>
          </div>
          <GoldButton onClick={onContinue}>
            <BookOpen className="w-4 h-4" /> Afia Opens the Vault
          </GoldButton>
        </div>
      )}

      {!anyRevealed && (
        <p className="text-center text-[11px] text-amber-700">
          Investigate at least one mystery to continue
        </p>
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
  const memoryChain = getDemoMemoryChain(state.placedArtifacts);
  const nextMemory = memoryChain.find(node => !node.placed);
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
    return undefined;
  }, [allPlaced, state.placedArtifacts.length]);

  const changeIcons: Record<string, typeof TreePine> = {
    ancestor: TreePine,
    migration: MapPin,
    chapter: BookOpen,
    dialogue: Mic,
    location: Landmark,
  };

  // Living house rooms
  const houseRooms = [
    { id: "wall", label: "Portrait Wall", icon: "🖼", filled: placed.has("photo"), item: "Old photograph" },
    { id: "kitchen", label: "Kitchen", icon: "🍲", filled: placed.has("recipe"), item: "Family recipe" },
    { id: "cabinet", label: "Display Cabinet", icon: "🏅", filled: placed.has("medal"), item: "Military medal" },
    { id: "hallway", label: "Hallway", icon: "📜", filled: placed.has("certificate"), item: "Marriage certificate" },
  ];

  return (
    <div className="px-4 py-6 space-y-5 animate-[fadeIn_0.5s_ease-out]">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-amber-400" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600">🎊 World Regeneration</p>
          <h2 className="text-base font-black text-amber-100" style={{ fontFamily: "Georgia, serif" }}>
            Every Memory Rebuilds the World
          </h2>
        </div>
      </div>

      <p className="text-sm text-amber-200/80 leading-relaxed">
        Afia records a story from her grandmother. Watch the house transform in real time — every artifact placed physically changes a room.
      </p>

      {/* Memory Chain */}
      <section
        aria-labelledby="memory-chain-title"
        className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-[#21140b] via-[#1a0d07] to-[#120a06] p-3.5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-amber-600">Family Vault → Living World</p>
            <h3 id="memory-chain-title" className="mt-1 text-sm font-black text-amber-100">Memory Chain</h3>
            <p className="mt-1 max-w-sm text-[10px] leading-relaxed text-amber-200/60">
              Each preserved object links a person, a place, or a path into the next version of the world.
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-amber-300">
            {memoryChain.filter(node => node.placed).length}/{memoryChain.length} linked
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {memoryChain.map((node, index) => (
            <div key={node.artifactId} className="relative">
              {index > 0 && (
                <span
                  aria-hidden="true"
                  className={`absolute -left-2 top-5 hidden h-px w-2 sm:block ${
                    node.placed ? "bg-amber-400/60" : "bg-amber-800/40"
                  }`}
                />
              )}
              <div
                className={`h-full rounded-lg border p-2.5 transition-all ${
                  node.placed
                    ? "border-emerald-400/35 bg-emerald-950/25"
                    : "border-amber-900/35 bg-black/10"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-[9px] font-black uppercase tracking-wide ${node.placed ? "text-emerald-300" : "text-amber-700"}`}>
                    0{index + 1}
                  </span>
                  {node.placed ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-label="Memory linked" />
                  ) : (
                    <span className="h-2 w-2 rounded-full border border-amber-700/70" aria-label="Memory waiting" />
                  )}
                </div>
                <p className={`mt-2 text-[10px] font-bold leading-tight ${node.placed ? "text-amber-100" : "text-amber-500/70"}`}>
                  {node.title}
                </p>
                <p className="mt-1 text-[9px] leading-tight text-amber-700">{node.source}</p>
                <div className={`mt-2 border-t pt-2 text-[9px] leading-tight ${node.placed ? "border-emerald-400/15 text-emerald-200/75" : "border-amber-900/25 text-amber-800"}`}>
                  → {node.outcome}
                </div>
              </div>
            </div>
          ))}
        </div>

        <p role="status" aria-live="polite" className="mt-3 flex items-center gap-1.5 text-[10px] text-amber-300/65">
          <Sparkles className="h-3 w-3 shrink-0 text-amber-400" />
          {allPlaced
            ? "The chain is complete. Your shared world is ready for its next update."
            : nextMemory
              ? `Next link: ${nextMemory.source} → ${nextMemory.outcome}`
              : "Preserve a memory to begin the chain."}
        </p>
      </section>

      {/* Living House */}
      <div className="rounded-xl border border-amber-700/40 bg-[#1a0d07] p-3">
        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-amber-700 mb-2">
          🏠 The Living House — changes with every contribution
        </p>
        <div className="grid grid-cols-2 gap-2">
          {houseRooms.map(room => (
            <div
              key={room.id}
              className={`rounded-lg border p-2.5 transition-all ${
                room.filled ? "border-amber-500/40 bg-amber-500/10" : "border-amber-900/30 bg-amber-950/20"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-base">{room.icon}</span>
                <div className="min-w-0">
                  <p className={`text-[9px] font-bold uppercase ${room.filled ? "text-amber-300" : "text-amber-700"}`}>
                    {room.label}
                  </p>
                  {room.filled && (
                    <p className="text-[9px] text-amber-500 truncate">{room.item}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

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

      {allPlaced && (
        <div
          role="status"
          aria-live="polite"
          className="relative overflow-hidden rounded-xl border border-emerald-300/35 bg-gradient-to-br from-emerald-950/60 via-amber-950/40 to-[#21140b] p-4 animate-[fadeIn_0.45s_ease-out]"
        >
          <img
            src="/legacy-rpg-assets/uploaded-effects/legacy-particles-discovery.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -right-2 -top-3 h-20 w-20 opacity-35 mix-blend-screen"
            draggable={false}
          />
          <div className="relative flex items-start gap-3">
            <img
              src="/legacy-rpg-assets/uploaded-effects/legacy-world-updated.png"
              alt="World updated"
              className="h-4 w-auto shrink-0 object-contain [image-rendering:pixelated]"
              draggable={false}
            />
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-200">
                World Version {state.worldVersion} → {state.worldVersion + 1}
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-emerald-100/75">
                Four preserved facts are now ready to become places, people, and paths in the next world.
              </p>
            </div>
          </div>
          <div className="relative mt-3 grid grid-cols-2 gap-2">
            {summarizeDemoWorldChanges(state.worldChanges).map(group => (
              <div key={group.changeType} className="rounded-lg border border-emerald-200/15 bg-black/15 px-2.5 py-2">
                <p className="text-[9px] font-black uppercase tracking-wide text-emerald-200">{group.label}</p>
                <p className="mt-0.5 text-[9px] text-emerald-100/55">{group.detail} · {group.count}</p>
              </div>
            ))}
          </div>
          <p className="relative mt-3 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide text-amber-200/80">
            <img
              src="/legacy-rpg-assets/uploaded-effects/legacy-gold.png"
              alt=""
              aria-hidden="true"
              className="h-4 w-4 object-contain [image-rendering:pixelated]"
              draggable={false}
            />
            Ready to regenerate the shared family world
          </p>
        </div>
      )}

      {/* Regeneration animation */}
      {showRegen && (
        <div className="rounded-xl border border-amber-400/50 bg-gradient-to-r from-amber-950/60 to-amber-900/40 p-4 animate-[fadeIn_0.3s_ease-out]">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
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
                isPlaced ? "bg-amber-400/20 text-amber-300" : "bg-amber-950/60 text-amber-600"
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
          <p className="text-[11px] text-amber-300/80">
            The house is no longer just a house. It is a museum of the family's story. Everything added is reflected in the living world.
          </p>
          <GoldButton onClick={onContinue}>
            <Users className="w-4 h-4" /> Invite Family · Co-op Quest
          </GoldButton>
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
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-500">🎊 Co-op Family Quest</p>
          <h2 className="text-base font-black text-amber-100" style={{ fontFamily: "Georgia, serif" }}>
            The Lost Ledger
          </h2>
        </div>
      </div>

      <div className="rounded-xl border border-amber-800/40 bg-[#1a0d07] p-3">
        <p className="text-xs font-bold text-amber-300 mb-1">Live Family Quest</p>
        <p className="text-[11px] text-amber-500 leading-relaxed">
          The whole family must work together to identify everyone in this 1942 photo.
          Each task is assigned to a different family member.
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

      {state.legacyPoints > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-amber-700/30 bg-amber-950/30 px-4 py-2.5">
          <span className="text-[10px] font-black uppercase tracking-wide text-amber-600">Legacy Points</span>
          <span className="text-lg font-black text-amber-400 tabular-nums">{state.legacyPoints}</span>
        </div>
      )}

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
                done ? "border-emerald-500/40 bg-emerald-500/8" : started ? "border-amber-500/50 bg-amber-500/8" : "border-amber-900/40 bg-[#21140b]"
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
                <button type="button" onClick={() => onStart(task.id)}
                  className="text-[10px] font-bold uppercase text-amber-600 px-3 py-1.5 rounded-lg bg-amber-900/30 hover:bg-amber-900/50 transition-all active:scale-95 shrink-0">
                  Start
                </button>
              )}
              {!done && started && (
                <button type="button" onClick={() => onComplete(task.id)}
                  className="text-[10px] font-bold uppercase text-amber-300 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 transition-all active:scale-95 shrink-0">
                  Complete
                </button>
              )}
              {done && <span className="text-[10px] font-bold uppercase text-emerald-400 shrink-0">Done</span>}
            </div>
          );
        })}
      </div>

      {allDone && (
        <div className="space-y-3 animate-[fadeIn_0.5s_ease-out]">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/8 p-4 text-[11px] text-emerald-300">
            <p className="font-black uppercase tracking-wide mb-1">Quest complete!</p>
            <p>+{state.legacyPoints} Legacy Points · New Chapter Seed unlocked · Rare Document found</p>
          </div>
          <GoldButton onClick={onContinue}>
            <Users className="w-4 h-4" /> Join the Family Reunion
          </GoldButton>
        </div>
      )}

      {!allDone && inProgress.length === 0 && (
        <p className="text-center text-[11px] text-amber-700">Tap "Start" to assign a task to a family member</p>
      )}
    </div>
  );
}

// ─── Family Reunion ───────────────────────────────────────────────────────────

function ReunionScreen({
  state,
  onDialogue,
  onContinue,
}: {
  state: DemoState;
  onDialogue: (npcId: string) => void;
  onContinue: () => void;
}) {
  const [activeNpc, setActiveNpc] = useState<string | null>(null);
  const [activeChoice, setActiveChoice] = useState<1 | 2 | null>(null);
  const completedCount = state.reunionDialogues.filter(d => d.completed).length;
  const allDone = completedCount >= REUNION_NPCS.length;

  const handleChoice = (npcId: string, choice: 1 | 2) => {
    setActiveChoice(choice);
    setTimeout(() => {
      onDialogue(npcId);
      setActiveChoice(null);
      setActiveNpc(null);
    }, 1400);
  };

  // Find the most recent NPC memory relevant to this NPC
  const getMemory = (npcName: string) =>
    state.npcMemory.find(m => m.npcName === npcName)?.remembers ?? null;

  const currentNpc = REUNION_NPCS.find(n => n.id === activeNpc);

  return (
    <div className="px-4 py-6 space-y-5 animate-[fadeIn_0.5s_ease-out]">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
          <Users className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500">🎊 Celebration · Family Reunion</p>
          <h2 className="text-base font-black text-amber-100" style={{ fontFamily: "Georgia, serif" }}>
            The Sunday Dinner Table
          </h2>
        </div>
      </div>

      <p className="text-sm text-amber-200/80 leading-relaxed">
        The family gathers around the table. You are no longer watching — you are participating.
        Walk around, talk to relatives. Each NPC remembers your choices from earlier chapters.
      </p>

      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-amber-950/60 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${(completedCount / REUNION_NPCS.length) * 100}%`,
              background: "linear-gradient(90deg, #10b981, #6ee7b7)",
            }}
          />
        </div>
        <span className="text-[10px] font-bold text-emerald-500 shrink-0">{completedCount}/{REUNION_NPCS.length} conversations</span>
      </div>

      {/* NPC dialogue panel */}
      {activeNpc && currentNpc && !state.reunionDialogues.find(d => d.npcId === activeNpc)?.completed && (
        <div className="rounded-xl border border-emerald-500/40 bg-[#0d1f14] p-4 space-y-3 animate-[fadeIn_0.3s_ease-out]">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{currentNpc.icon}</span>
            <p className="text-sm font-black text-emerald-300">{currentNpc.name}</p>
          </div>

          {/* NPC opening line — uses memory if available */}
          <p className="text-[11px] text-amber-300/90 italic leading-relaxed">
            {getMemory(currentNpc.name)
              ? currentNpc.memoryLine(getMemory(currentNpc.name)!)
              : currentNpc.defaultLine}
          </p>

          {activeChoice === null ? (
            <div className="space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Your response</p>
              <button
                type="button"
                onClick={() => handleChoice(activeNpc, 1)}
                className="w-full text-left rounded-lg border border-emerald-900/40 bg-[#1a2e22] p-2.5 text-[11px] text-emerald-300 hover:border-emerald-500/40 transition-all active:scale-[0.98]"
              >
                <ArrowRight className="w-3 h-3 inline mr-1.5 text-emerald-600" />
                {currentNpc.choice1}
              </button>
              <button
                type="button"
                onClick={() => handleChoice(activeNpc, 2)}
                className="w-full text-left rounded-lg border border-emerald-900/40 bg-[#1a2e22] p-2.5 text-[11px] text-emerald-300 hover:border-emerald-500/40 transition-all active:scale-[0.98]"
              >
                <ArrowRight className="w-3 h-3 inline mr-1.5 text-emerald-600" />
                {currentNpc.choice2}
              </button>
            </div>
          ) : (
            <div className="space-y-2 animate-[fadeIn_0.3s_ease-out]">
              <p className="text-[11px] text-amber-200/90 leading-relaxed italic">
                {activeChoice === 1 ? currentNpc.response1 : currentNpc.response2}
              </p>
              <p className="text-[10px] text-emerald-600 animate-pulse">Recording memory…</p>
            </div>
          )}

          <button
            type="button"
            onClick={() => { setActiveNpc(null); setActiveChoice(null); }}
            className="text-[9px] font-bold uppercase text-amber-700 hover:text-amber-500"
          >
            ← Back to table
          </button>
        </div>
      )}

      {/* NPC list at the table */}
      {!activeNpc && (
        <div className="space-y-2">
          {REUNION_NPCS.map(npc => {
            const dialogueState = state.reunionDialogues.find(d => d.npcId === npc.id);
            const done = dialogueState?.completed ?? false;
            const memory = getMemory(npc.name);

            return (
              <button
                key={npc.id}
                type="button"
                onClick={() => !done && setActiveNpc(npc.id)}
                disabled={done}
                className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all active:scale-[0.98] ${
                  done
                    ? "border-emerald-500/40 bg-emerald-500/8 cursor-default"
                    : "border-amber-900/40 bg-[#21140b] hover:border-emerald-500/40 hover:bg-emerald-950/20"
                }`}
              >
                <span className="text-xl shrink-0">{npc.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold ${done ? "text-emerald-300" : "text-amber-200"}`}>{npc.name}</p>
                  {done ? (
                    <p className="text-[10px] text-emerald-600 mt-0.5">✦ {npc.achievement}</p>
                  ) : (
                    <>
                      <p className="text-[10px] text-amber-700 mt-0.5 truncate italic">{npc.defaultLine.slice(0, 50)}…</p>
                      {memory && (
                        <p className="text-[9px] text-amber-800 mt-0.5">💬 Remembers: {memory.slice(0, 40)}…</p>
                      )}
                    </>
                  )}
                </div>
                {done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <span className="text-[10px] font-bold uppercase text-amber-700 shrink-0">Talk</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {allDone && !activeNpc && (
        <div className="space-y-3 animate-[fadeIn_0.5s_ease-out]">
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/8 p-3">
            <p className="text-xs font-black uppercase tracking-wide text-emerald-400 mb-1">Reunion Complete</p>
            <p className="text-[11px] text-amber-300/80">
              Every relative remembered you. Every story was heard. The family is no longer just photographs and names — they are people you have spoken with.
            </p>
          </div>
          <GoldButton onClick={onContinue}>
            <TreePine className="w-4 h-4" /> Legacy Restored
          </GoldButton>
        </div>
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
  const topTraits = Object.entries(state.traits)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4);

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
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700 mb-2">Journey Summary · House of Mensah</p>
        {[
          { label: "World Version", value: `v${state.worldVersion}` },
          { label: "Artifacts Placed", value: `${state.placedArtifacts.length}/4` },
          { label: "Recipes Unlocked", value: `${state.kitchenRecipes.filter(r => r.unlocked).length}/3` },
          { label: "Business Level", value: BUSINESS_STAGES[Math.min(state.businessLevel, 4)]?.name ?? "Farm" },
          { label: "Mysteries Found", value: `${state.mysteries.filter(m => m.revealed).length}/3` },
          { label: "Conversations", value: `${state.reunionDialogues.filter(d => d.completed).length}/4` },
          { label: "Co-op Tasks", value: `${state.completedQuests.length}/4` },
          { label: "Legacy Points", value: `${state.legacyPoints}` },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between text-[11px]">
            <span className="text-amber-600">{label}</span>
            <span className="font-bold text-amber-400">{value}</span>
          </div>
        ))}
        {topTraits.length > 0 && (
          <div className="pt-2 border-t border-amber-900/40">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-700 mb-2">Dominant Traits</p>
            {topTraits.map(([k, v]) => (
              <TraitBar key={k} label={k} value={Math.min(v, 100)} />
            ))}
          </div>
        )}
      </div>

      {/* Systems shown */}
      <div className="w-full max-w-xs rounded-xl border border-amber-900/30 bg-[#1a0d07] p-3 text-left">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-700 mb-2">Systems You Just Experienced</p>
        <div className="grid grid-cols-2 gap-1">
          {[
            "AI-guided onboarding", "Family Tree growth", "Family Vault", "Oral story recording",
            "Living Kitchen", "Business Legacy", "Secret Mysteries", "World regeneration",
            "NPC memory", "Dynamic dialogue", "Co-op quests", "Family Reunion",
          ].map(s => (
            <div key={s} className="flex items-center gap-1 text-[9px] text-amber-600">
              <CheckCircle2 className="w-2.5 h-2.5 text-amber-700 shrink-0" /> {s}
            </div>
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

type DemoStorage = Pick<Storage, "getItem" | "setItem">;

const sessionOnlyDemoStorage: DemoStorage = {
  getItem: () => null,
  setItem: () => undefined,
};

function getDemoStorage(): { storage: DemoStorage; available: boolean } {
  try {
    // Some privacy modes throw while evaluating window.localStorage rather
    // than from getItem/setItem. Keep the demo playable in that environment.
    return { storage: window.localStorage, available: true };
  } catch {
    return { storage: sessionOnlyDemoStorage, available: false };
  }
}

export default function LegacyDemoPage() {
  const [state, setState] = useState<DemoState>(DEFAULT_DEMO_STATE);
  const [loaded, setLoaded] = useState(false);
  const [persistenceWarning, setPersistenceWarning] = useState(false);
  const [satchelOpen, setSatchelOpen] = useState(false);
  const storageRef = useRef<DemoStorage>(sessionOnlyDemoStorage);
  const storageAvailableRef = useRef(false);

  useEffect(() => {
    const storageAccess = getDemoStorage();
    storageRef.current = storageAccess.storage;
    storageAvailableRef.current = storageAccess.available;
    setPersistenceWarning(!storageAccess.available);
    const syncState = () => setState(readDemoState(storageAccess.storage));
    syncState();
    setLoaded(true);
    window.addEventListener("storage", syncState);
    window.addEventListener(DEMO_STATE_EVENT, syncState);
    return () => {
      window.removeEventListener("storage", syncState);
      window.removeEventListener(DEMO_STATE_EVENT, syncState);
    };
  }, []);

  const persist = useCallback((next: DemoState) => {
    const didSave = writeDemoState(storageRef.current, next);
    setPersistenceWarning(!storageAvailableRef.current || !didSave);
    return next;
  }, []);

  const advance = useCallback(() => {
    setState(prev => {
      return persist(advanceDemo(prev));
    });
  }, [persist]);

  const handleChoice = useCallback((trait: string, value: number) => {
    setState(prev => {
      return persist(chooseDemoTrait(prev, trait, value));
    });
  }, [persist]);

  const handlePlace = useCallback((id: string) => {
    setState(prev => {
      return persist(placeDemoArtifact(prev, id));
    });
  }, [persist]);

  const handleStartQuest = useCallback((id: string) => {
    setState(prev => {
      return persist(startDemoQuest(prev, id));
    });
  }, [persist]);

  const handleCompleteQuest = useCallback((id: string) => {
    setState(prev => {
      return persist(completeDemoQuest(prev, id));
    });
  }, [persist]);

  const handleUnlockRecipe = useCallback((id: string) => {
    setState(prev => {
      return persist(unlockKitchenRecipe(prev, id));
    });
  }, [persist]);

  const handleAdvanceBusiness = useCallback(() => {
    setState(prev => {
      return persist(advanceBusiness(prev));
    });
  }, [persist]);

  const handleRevealMystery = useCallback((id: string) => {
    setState(prev => {
      return persist(revealMystery(prev, id));
    });
  }, [persist]);

  const handleMemoryEncounterComplete = useCallback(() => {
    setState(prev => {
      return persist(completeMemoryEncounter(prev));
    });
  }, [persist]);

  const handleReunionDialogue = useCallback((npcId: string) => {
    setState(prev => {
      return persist(completeReunionDialogue(prev, npcId));
    });
  }, [persist]);

  const handleMapMove = useCallback((position: DemoMapPosition, facing: DemoFacing) => {
    setState(prev => {
      return persist(updateDemoMapPosition(prev, position, facing));
    });
  }, [persist]);

  const handleLandmarkInspect = useCallback((artifactId: string) => {
    setState(prev => {
      return persist(inspectDemoLandmark(prev, artifactId));
    });
  }, [persist]);

  const handleFishingCast = useCallback((power: number) => {
    setState(prev => persist(castFishing(prev, power)));
  }, [persist]);

  const handleReset = useCallback(() => {
    const fresh = resetDemo();
    setState(persist(fresh));
  }, [persist]);

  const handleEnterBaobab = useCallback(() => {
    setState(prev => persist(enterLivingBaobab(prev)));
  }, [persist]);

  const handlePlayFull = () => {
    window.location.href = "/legacy";
  };

  if (!loaded) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: "#0A0604" }}>
        <div className="w-3 h-3 rounded-full bg-amber-500 animate-pulse" />
      </div>
    );
  }

  const chapterDef = CHAPTERS.find(c => c.id === state.phase);
  const phaseIdx = DEMO_PHASE_ORDER.indexOf(state.phase);
  const { label: seasonLabel, accent } = getSeasonStyle(state.season);
  const showBaobab = !state.baobabEntered && state.phase === "prologue";

  return (
    <div
      className="min-h-dvh w-full"
      style={{ background: "linear-gradient(to bottom, #0A0604 0%, #1A0F08 100%)" }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
        style={{ background: "rgba(10,6,4,0.95)", borderBottom: "1px solid rgba(180,120,40,0.2)", backdropFilter: "blur(8px)" }}
      >
        {state.phase !== "prologue" && (
          <button
            type="button"
            onClick={() => {
              if (phaseIdx > 0) {
                const prev = DEMO_PHASE_ORDER[phaseIdx - 1];
                setState(s => {
                  const next = { ...s, phase: prev, season: seasonForPhase(prev) };
                  return persist(next);
                });
              }
            }}
            className="w-8 h-8 rounded-lg bg-amber-900/30 flex items-center justify-center text-amber-500 active:opacity-70 shrink-0"
            aria-label={`Go back to ${DEMO_PHASE_ORDER[Math.max(phaseIdx - 1, 0)]}`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-400">Niakofa Legacy · Demo</p>
          <p className="text-[9px]" style={{ color: accent }}>{seasonLabel} · House of Mensah · World v{state.worldVersion} ·{" "}
            <a href="/legacy/kwame" className="underline decoration-dotted hover:text-amber-300 transition-colors">Kwame ↗</a>
          </p>
        </div>
        {/* Phase progress dots */}
        <div
          className="flex max-w-[140px] items-center gap-1 overflow-x-auto scrollbar-none"
          role="progressbar"
          aria-label={`Legacy demo progress: step ${phaseIdx + 1} of ${DEMO_PHASE_ORDER.length}`}
          aria-valuemin={1}
          aria-valuemax={DEMO_PHASE_ORDER.length}
          aria-valuenow={phaseIdx + 1}
        >
          {DEMO_PHASE_ORDER.map((p, i) => (
            <div
              key={p}
              className="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all"
              aria-hidden="true"
              style={{
                background:
                  p === state.phase
                    ? "#f5c842"
                    : i < phaseIdx
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
          aria-label="Reset demo progress"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {persistenceWarning && (
        <div
          role="alert"
          className="border-b border-rose-400/30 bg-rose-950/60 px-4 py-2 text-center text-[10px] font-bold text-rose-200"
        >
          Progress is still playable, but this browser could not save it. Check private-mode or storage settings.
        </div>
      )}

      <div className="max-w-lg mx-auto pb-20">
        {showBaobab ? (
          <LegacyLivingBaobab worldVersion={state.worldVersion} onEnter={handleEnterBaobab} />
        ) : (
          <LegacyLivingWorld
            phase={state.phase}
            season={state.season}
            worldVersion={state.worldVersion}
            placedArtifacts={state.placedArtifacts}
            discoveredLandmarks={state.discoveredLandmarks}
            businessLevel={state.businessLevel}
            mapPosition={state.mapPosition}
            mapFacing={state.mapFacing}
            onMapMove={handleMapMove}
            onLandmarkInspect={handleLandmarkInspect}
            fishing={state.fishing}
            onFishingCast={handleFishingCast}
          />
        )}

        {state.baobabEntered && state.phase !== "finale" && (
          <RelationshipPanel relationships={state.relationships} />
        )}

        {state.phase === "prologue" && state.baobabEntered && (
          <PrologueScreen onBegin={advance} season={state.season} />
        )}

        {chapterDef && (
          <ChapterScreen
            chapter={chapterDef}
            traits={state.traits}
            npcMemory={state.npcMemory}
            season={state.season}
            onChoice={handleChoice}
          />
        )}

        {state.phase === "kitchen" && (
          <KitchenScreen state={state} onUnlock={handleUnlockRecipe} onContinue={advance} />
        )}

        {state.phase === "business" && (
          <BusinessScreen state={state} onAdvance={handleAdvanceBusiness} onContinue={advance} />
        )}

        {state.phase === "mystery" && (
          <MysteryScreen
            state={state}
            onReveal={handleRevealMystery}
            onEncounterComplete={handleMemoryEncounterComplete}
            onContinue={advance}
          />
        )}

        {state.phase === "world-regen" && (
          <WorldRegenScreen state={state} onPlace={handlePlace} onContinue={advance} />
        )}

        {state.phase === "coop-quest" && (
          <CoopQuestScreen state={state} onStart={handleStartQuest} onComplete={handleCompleteQuest} onContinue={advance} />
        )}

        {state.phase === "reunion" && (
          <ReunionScreen state={state} onDialogue={handleReunionDialogue} onContinue={advance} />
        )}

        {state.phase === "finale" && (
          <FinaleScreen state={state} onRestart={handleReset} onPlay={handlePlayFull} />
        )}
      </div>

      {/* Bottom system tray */}
      {state.baobabEntered && state.phase !== "prologue" && state.phase !== "finale" && (
        <div
          className="fixed bottom-0 left-0 right-0 px-4 py-3"
          style={{ background: "rgba(10,6,4,0.96)", borderTop: "1px solid rgba(180,120,40,0.18)", backdropFilter: "blur(8px)" }}
        >
          <div className="max-w-lg mx-auto flex items-center justify-between gap-2 overflow-x-auto scrollbar-none">
            {[
              { icon: Package, label: "Satchel" },
              { icon: TreePine, label: "Family Tree" },
              { icon: ScrollText, label: "Vault" },
              { icon: UtensilsCrossed, label: "Kitchen" },
              { icon: Briefcase, label: "Business" },
              { icon: Search, label: "Mysteries" },
              { icon: Landmark, label: "Map" },
              { icon: Mic, label: "Stories" },
              { icon: Sparkles, label: "AI" },
            ].map(({ icon: Icon, label }) => label === "Satchel" ? (
              <button
                key={label}
                type="button"
                onClick={() => setSatchelOpen((open) => !open)}
                className="flex shrink-0 flex-col items-center gap-1 rounded-lg px-1 py-0.5 hover:bg-amber-950/40"
                aria-label={`${satchelOpen ? "Close" : "Open"} Legacy Satchel`}
                aria-pressed={satchelOpen}
              >
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg border ${
                  satchelOpen ? "border-emerald-300/50 bg-emerald-950/40" : "border-amber-900/30 bg-amber-950/40"
                }`}>
                  <Icon className={`h-3.5 w-3.5 ${satchelOpen ? "text-emerald-300" : "text-amber-600"}`} />
                </div>
                <span className={`text-[8px] font-bold uppercase tracking-wide ${satchelOpen ? "text-emerald-300" : "text-amber-800"}`}>{label}</span>
              </button>
            ) : (
              <div key={label} className="flex shrink-0 flex-col items-center gap-1">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-900/30 bg-amber-950/40">
                  <Icon className="h-3.5 w-3.5 text-amber-600" />
                </div>
                <span className="text-[8px] font-bold uppercase tracking-wide text-amber-800">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {satchelOpen && state.baobabEntered && state.phase !== "prologue" && state.phase !== "finale" && (
        <LegacySatchel
          items={SATCHEL_ITEMS}
          placedArtifacts={state.placedArtifacts}
          discoveredLandmarks={state.discoveredLandmarks}
          worldVersion={state.worldVersion}
          onClose={() => setSatchelOpen(false)}
        />
      )}
    </div>
  );
}
