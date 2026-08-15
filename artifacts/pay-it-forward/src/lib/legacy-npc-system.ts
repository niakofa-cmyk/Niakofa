/**
 * Legacy NPC System — Living characters for the House of Mensah world.
 *
 * Design brief principles:
 * - NPCs have identity, occupation, schedule, memories, dialogue, emotional state
 * - Schedule is time → tile location on the 9×6 House of Mensah map
 * - Dialogue trees have branching, consequence, and NPC memory
 * - NPCs are generated from Family Vault data; these are the canonical demo NPCs
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type NpcEmotion = "warm" | "busy" | "worried" | "happy" | "solemn" | "mysterious";
export type NpcRelationship = "grandmother" | "father" | "cousin" | "elder" | "trader" | "farmer" | "neighbor";

export interface NpcScheduleEntry {
  /** 0–23 hour (demo game-world clock) */
  hour: number;
  /** column (0–8) on 9×6 tile map */
  col: number;
  /** row (0–5) on 9×6 tile map */
  row: number;
  activity: string;
}

export interface DialogueOption {
  id: string;
  label: string;
  /** Trait/skill affected (optional) */
  trait?: string;
  traitDelta?: number;
  /** Required minimum trait value to unlock this option */
  requires?: { trait: string; min: number };
  /**
   * Lorebook gate — this option only appears when the player already holds
   * this memory tag. Implements the Character Card V3 keyword-activation concept:
   * past events the player witnessed unlock deeper dialogue branches.
   */
  requiresMemoryTag?: string;
  /** Leads to this line id */
  nextId: string;
  /** Memory tag stored after this choice */
  memoryTag?: string;
}

export interface DialogueLine {
  id: string;
  speaker: "npc" | "player";
  text: string;
  options?: DialogueOption[];
  /** If no options → conversation ends, emit this outcome */
  outcome?: string;
  /** Mood shift for NPC after this line */
  emotionAfter?: NpcEmotion;
  /** Optional discovered artifact/memory */
  discoversId?: string;
}

/**
 * Lorebook entry — inspired by Character Card V3 character_book spec.
 * When any of the `keys` appear in the player's memory tags, the `content`
 * is made available to the NPC's dialogue system (e.g. unlocks options,
 * adds context to dialogue resolution). This is the keyword-activation
 * layer that allows NPCs to reference past events the player revealed.
 */
export interface NpcLorebookEntry {
  /** Memory tags that trigger this entry */
  keys: string[];
  /** Content surfaced when a key matches (narrative context or option unlock) */
  content: string;
  /** Lower = checked / injected first. Default 10. */
  insertionOrder?: number;
  /** If true, always active regardless of keys */
  constant?: boolean;
  /** Dialogue node IDs that become available when this entry activates */
  unlocksDialogueIds?: string[];
}

export interface NpcDefinition {
  id: string;
  name: string;
  fullName: string;
  relationship: NpcRelationship;
  occupation: string;
  era: string;
  /** Phases this NPC is present in */
  phases: string[];
  emotion: NpcEmotion;
  personality: string[];
  /**
   * Opening line on first encounter (maps to Character Card V3 `first_mes`).
   * Used as a fallback greeting when the player has no prior memory of this NPC.
   */
  openingLine?: string;
  /**
   * Example interaction format (Character Card V3 `mes_example`).
   * Shows how this NPC speaks — tone, vocabulary, cultural references.
   */
  exampleDialogue?: string;
  /**
   * NPC behavioral identity for future AI generation (Character Card V3 `system_prompt`).
   * Describes who this NPC is, what they know, what they will/won't share.
   */
  systemPrompt?: string;
  /**
   * Internal design notes — not shown in-game (Character Card V3 `creator_notes`).
   */
  creatorNotes?: string;
  /**
   * Lorebook entries — Character Card V3 `character_book` concept.
   * Memory-tag-keyed context that activates when the player has witnessed
   * specific events. Enables NPCs to reference the player's journey.
   */
  lorebook?: NpcLorebookEntry[];
  /** NPC sprite config forwarded to LegacyCharacterSprite */
  sprite: {
    ageGroup: "kid" | "teen" | "adult" | "elder";
    gender: "male" | "female" | "unspecified";
    characterId: string;
    lifeStage: string;
    era: string;
    appearanceSeed: string;
    libraryId: string;
  };
  schedule: NpcScheduleEntry[];
  /** Initial dialogue tree root */
  dialogueRootId: string;
  dialogue: Record<string, DialogueLine>;
  /** Short one-line greetings cycled on proximity */
  greetings: string[];
  /** Things this NPC remembers (populated by player choices, stored in demo state) */
  memorySlots: string[];
}

// ── Dialogue tree helper ──────────────────────────────────────────────────────

export function resolveDialogueLine(
  npc: NpcDefinition,
  lineId: string,
  _playerMemoryTags: string[],
): DialogueLine | null {
  return npc.dialogue[lineId] ?? null;
}

export function filterAvailableOptions(
  options: DialogueOption[],
  traits: Record<string, number>,
  memoryTags: string[],
): DialogueOption[] {
  return options.filter(opt => {
    // Trait gate: requires a minimum trait value
    if (opt.requires) {
      const val = traits[opt.requires.trait] ?? 0;
      if (val < opt.requires.min) return false;
    }
    // Lorebook gate (Character Card V3 concept): requires a specific memory tag
    // This is how past events unlock deeper dialogue branches.
    if (opt.requiresMemoryTag && !memoryTags.includes(opt.requiresMemoryTag)) {
      return false;
    }
    return true;
  });
}

/**
 * Resolve which lorebook entries are active given the player's current memory tags.
 * Active entries' `unlocksDialogueIds` are merged into the NPC's available options.
 * This implements the Character Card V3 `character_book` keyword-activation pattern.
 */
export function getActiveLorebook(
  npc: NpcDefinition,
  memoryTags: string[],
): NpcLorebookEntry[] {
  if (!npc.lorebook?.length) return [];
  return npc.lorebook.filter(entry => {
    if (entry.constant) return true;
    return entry.keys.some(key => memoryTags.includes(key));
  });
}

// ── NPC: Grandma Ama ──────────────────────────────────────────────────────────

const grandmaAma: NpcDefinition = {
  id: "grandma-ama",
  name: "Grandma Ama",
  fullName: "Ama Mensah",
  relationship: "grandmother",
  occupation: "Family Elder · Keeper of Stories",
  era: "Present Day",
  phases: ["prologue", "chapter1", "chapter2", "chapter3", "chapter4", "chapter5", "chapter6", "kitchen", "reunion", "finale"],
  emotion: "warm",
  personality: ["nurturing", "wise", "storyteller", "protective"],
  sprite: {
    ageGroup: "elder",
    gender: "female",
    characterId: "grandma-ama",
    lifeStage: "elder",
    era: "present",
    appearanceSeed: "house-of-mensah-ama",
    libraryId: "niakofa-original-art-demo-v1",
  },
  schedule: [
    { hour: 6,  col: 4, row: 2, activity: "Morning prayers in the compound" },
    { hour: 8,  col: 3, row: 3, activity: "Cooking in the kitchen" },
    { hour: 11, col: 5, row: 1, activity: "Tending the garden" },
    { hour: 14, col: 4, row: 4, activity: "Resting in the main hall" },
    { hour: 17, col: 2, row: 2, activity: "Telling stories to grandchildren" },
    { hour: 20, col: 4, row: 2, activity: "Evening prayers" },
  ],
  dialogueRootId: "ama-greet",
  openingLine: "Ah, there you are. Come — sit by me. Before you do anything else today, let me tell you about your great-grandfather.",
  systemPrompt: "Grandma Ama is the Mensah family memory keeper. She is warm but strategic — she reveals stories in layers, waiting to see if the young person is truly listening. She speaks in proverbs, follows up on things previously shared, and guards the most painful family truths until trust is earned. She knows about the 1912 trading house betrayal but will only share it with someone who has proven they can carry that weight.",
  creatorNotes: "Gateway NPC. Always feels like she knows MORE than she is saying. Lorebook entries activate the deepest dialogue branches after the player witnesses key family events.",
  lorebook: [
    {
      keys: ["asked-about-kwame", "heard-about-kwame"],
      content: "The player has asked about Kwame. Ama can share the next layer — the trading house and the competitor who changed everything.",
      insertionOrder: 1,
      unlocksDialogueIds: ["ama-trading-house"],
    },
    {
      keys: ["promised-find-journal"],
      content: "The player promised to find the family journal. Ama trusts them — she shares the lantern story as a reward for commitment.",
      insertionOrder: 2,
      unlocksDialogueIds: ["ama-lantern"],
    },
    {
      keys: ["started-competitor-investigation"],
      content: "The player is investigating the competitor (via Kofi). Ama recognizes this and can confirm the betrayal story.",
      insertionOrder: 3,
      unlocksDialogueIds: ["ama-betrayal-confirm"],
    },
    {
      keys: ["found-journal"],
      content: "Player actually found the journal. Highest-trust unlock — Ama shares the full land dispute story.",
      insertionOrder: 4,
      unlocksDialogueIds: ["ama-land-dispute"],
    },
  ],
  greetings: [
    "Come, sit with me. I have stories.",
    "You look just like your grandfather, you know.",
    "Did you hear about the old trading house?",
    "Before we forget — let me tell you something.",
    "Come, child. The baobab remembers even what we forget.",
  ],
  memorySlots: [],
  dialogue: {
    "ama-greet": {
      id: "ama-greet",
      speaker: "npc",
      text: "Ah, there you are. I was hoping you'd come today. I have been thinking about your great-grandfather. About the life he built and what happened to it.",
      options: [
        { id: "o1", label: "Tell me about him.", nextId: "ama-kwame-story", memoryTag: "asked-about-kwame" },
        { id: "o2", label: "What happened to the family business?", nextId: "ama-business-history" },
        { id: "o3", label: "I wanted to ask about the old house.", nextId: "ama-old-house" },
        { id: "o4", label: "Not now, Grandma.", nextId: "ama-farewell" },
      ],
    },
    "ama-kwame-story": {
      id: "ama-kwame-story",
      speaker: "npc",
      text: "Kwame Mensah was born in 1874, right here in Cape Coast. His father grew cocoa. But Kwame — he wanted more. He learned to trade. By 1898 he had built the most respected trading house between here and Accra.",
      emotionAfter: "happy",
      options: [
        { id: "o1", label: "He built it himself?", nextId: "ama-built-himself", trait: "Wisdom", traitDelta: 3 },
        { id: "o2", label: "What happened to the trading house?", nextId: "ama-trading-house-fate" },
        { id: "o3", label: "Tell me about his family.", nextId: "ama-family-detail" },
      ],
    },
    "ama-built-himself": {
      id: "ama-built-himself",
      speaker: "npc",
      text: "Every stone. Every beam. He carried them himself when he couldn't afford workers. He said — the man who builds his own house builds something that cannot be taken. He was wrong about that. But the spirit behind it was right.",
      emotionAfter: "solemn",
      discoversId: "artifact-kwame-building-story",
      options: [
        { id: "o1", label: "What do you mean — he was wrong?", nextId: "ama-trading-house-fate" },
        { id: "o2", label: "I want to understand his story fully.", nextId: "ama-full-journey", requires: { trait: "Wisdom", min: 10 } },
      ],
    },
    "ama-trading-house-fate": {
      id: "ama-trading-house-fate",
      speaker: "npc",
      text: "In 1912 — a man came. Someone Kwame had trusted. A man who smiled like a brother but thought like a creditor. He found papers — old papers, debts Kwame's father had signed. Within two years, the trading house was gone.",
      emotionAfter: "worried",
      discoversId: "mystery-trading-house-betrayal",
      options: [
        { id: "o1", label: "Who was this man?", nextId: "ama-betrayer", trait: "Courage", traitDelta: 5 },
        { id: "o2", label: "Did Kwame ever rebuild?", nextId: "ama-rebuilding" },
      ],
    },
    "ama-betrayer": {
      id: "ama-betrayer",
      speaker: "npc",
      text: "We don't say his name in this house. But in your grandfather's journal — the one in the vault — there is a name circled three times. When you find that journal, you will understand everything.",
      emotionAfter: "mysterious",
      discoversId: "quest-find-journal",
      options: [
        { id: "o1", label: "The vault — what vault?", nextId: "ama-vault-hint" },
        { id: "o2", label: "I'll find that journal.", nextId: "ama-farewell-promise", memoryTag: "promised-find-journal" },
      ],
    },
    "ama-vault-hint": {
      id: "ama-vault-hint",
      speaker: "npc",
      text: "Your great-grandfather kept everything. Photographs. Letters. Receipts. Business records. He put them all in a tin chest under the floorboards of his study. That chest is what we now call — the Family Vault.",
      emotionAfter: "solemn",
      discoversId: "artifact-family-vault-origin",
      options: [
        { id: "o1", label: "Can I see the vault?", nextId: "ama-vault-access" },
      ],
    },
    "ama-vault-access": {
      id: "ama-vault-access",
      speaker: "npc",
      text: "Everything in this family comes from that chest. Every story. Every name. Every place we ever lived. The vault isn't just a box — it is the memory of who we are.",
      outcome: "vault-discovered",
      emotionAfter: "warm",
    },
    "ama-business-history": {
      id: "ama-business-history",
      speaker: "npc",
      text: "The Mensah Trading House was built in 1892. Kwame ran it for twenty years. By 1912 it was in trouble. By 1914 it was gone. Your grandfather was only 9 years old when they lost everything.",
      emotionAfter: "solemn",
      options: [
        { id: "o1", label: "What happened in 1912?", nextId: "ama-trading-house-fate" },
        { id: "o2", label: "How did the family survive?", nextId: "ama-survival" },
      ],
    },
    "ama-survival": {
      id: "ama-survival",
      speaker: "npc",
      text: "Your great-grandmother Abena — she was the one who kept the family together. She took in sewing. She grew food. She sent the children to school even when there was no money. She said — the house may fall, but the family does not.",
      emotionAfter: "happy",
      discoversId: "character-abena-mensah",
      options: [
        { id: "o1", label: "Tell me more about Abena.", nextId: "ama-abena-detail" },
        { id: "o2", label: "This is why family matters so much.", nextId: "ama-farewell-moved", trait: "Compassion", traitDelta: 5 },
      ],
    },
    "ama-abena-detail": {
      id: "ama-abena-detail",
      speaker: "npc",
      text: "Abena was from Kumasi. She came to Cape Coast for the cocoa trade and met Kwame at the market. She had more education than most women of her time. She kept every receipt, every letter. That habit — that is where the Vault comes from.",
      emotionAfter: "warm",
      discoversId: "character-abena-mensah-full",
      outcome: "abena-discovered",
    },
    "ama-old-house": {
      id: "ama-old-house",
      speaker: "npc",
      text: "The original compound is still there — or what remains of it. Three rooms, a courtyard, the cocoa storage shed. The wall my grandfather built with his own hands. Some of us want to restore it. Others have given up.",
      emotionAfter: "solemn",
      options: [
        { id: "o1", label: "We should restore it.", nextId: "ama-restore-hope", trait: "Leadership", traitDelta: 4 },
        { id: "o2", label: "Is it worth restoring?", nextId: "ama-restore-question" },
      ],
    },
    "ama-restore-hope": {
      id: "ama-restore-hope",
      speaker: "npc",
      text: "I was hoping you would say that. In the family vault there is a deed — an original property deed with our family's name on it. If that deed is real, and if the land is still ours... maybe.",
      emotionAfter: "happy",
      discoversId: "quest-find-deed",
      outcome: "restoration-quest-started",
    },
    "ama-restore-question": {
      id: "ama-restore-question",
      speaker: "npc",
      text: "Worth it? Child, that building isn't just wood and stone. It is proof. Proof that we existed. That we built something. That someone who looked like you and loved like you walked this earth and made something beautiful.",
      emotionAfter: "solemn",
      options: [
        { id: "o1", label: "You're right. We should restore it.", nextId: "ama-restore-hope", trait: "Wisdom", traitDelta: 3 },
        { id: "o2", label: "I understand now.", nextId: "ama-farewell" },
      ],
    },
    "ama-full-journey": {
      id: "ama-full-journey",
      speaker: "npc",
      text: "You want the full story? Then sit here. All of it. From the farm in 1874, through the building years, the golden years, the betrayal, the collapse, the migration... the long journey back to who we are now.",
      emotionAfter: "warm",
      outcome: "full-journey-unlocked",
    },
    "ama-farewell": {
      id: "ama-farewell",
      speaker: "npc",
      text: "All right, child. Come back when you're ready. The stories will still be here. I will still be here.",
      outcome: "conversation-ended",
    },
    "ama-farewell-promise": {
      id: "ama-farewell-promise",
      speaker: "npc",
      text: "Good. When you find it — bring it to me. There are things in that journal that I have never read aloud. Things that must be spoken now before they are forgotten forever.",
      emotionAfter: "warm",
      outcome: "journal-quest-active",
    },
    "ama-farewell-moved": {
      id: "ama-farewell-moved",
      speaker: "npc",
      text: "Yes. That is why. Every single person in this family — every name in that vault — they are the reason you exist. Never forget them.",
      emotionAfter: "warm",
      outcome: "conversation-ended",
    },
    "ama-rebuilding": {
      id: "ama-rebuilding",
      speaker: "npc",
      text: "Kwame never rebuilt the trading house. But he rebuilt something else. He sent his children to school. He taught them to read. He said — they took the building. They cannot take what is in your head.",
      emotionAfter: "happy",
      discoversId: "character-kwame-elder",
      outcome: "kwame-legacy-understood",
    },
  },
};

// ── NPC: Kofi (Village Trader) ─────────────────────────────────────────────────

const kofiTrader: NpcDefinition = {
  id: "kofi-trader",
  name: "Uncle Kofi",
  fullName: "Kofi Asante",
  relationship: "trader",
  occupation: "Merchant · Market Elder",
  era: "1890–1910",
  phases: ["chapter1", "chapter2", "chapter3", "kitchen"],
  emotion: "busy",
  personality: ["pragmatic", "shrewd", "loyal", "resourceful"],
  sprite: {
    ageGroup: "adult",
    gender: "male",
    characterId: "kofi-trader",
    lifeStage: "adult",
    era: "1890s",
    appearanceSeed: "kofi-merchant-cape-coast",
    libraryId: "niakofa-original-art-demo-v1",
  },
  schedule: [
    { hour: 6,  col: 7, row: 1, activity: "Loading goods at the warehouse" },
    { hour: 8,  col: 6, row: 2, activity: "Walking the market road" },
    { hour: 10, col: 5, row: 3, activity: "Trading at the market stalls" },
    { hour: 13, col: 6, row: 4, activity: "Eating at the trading house" },
    { hour: 16, col: 7, row: 2, activity: "Evening accounts" },
    { hour: 19, col: 7, row: 1, activity: "Closing the warehouse" },
  ],
  dialogueRootId: "kofi-greet",
  openingLine: "Ah — good timing. There's something in this week's manifest your father needs to know about.",
  systemPrompt: "Kofi is a market trader and business mentor. He speaks practically, values directness, and respects hard work. He shares trade intelligence freely — prices, competitors, market movements — but guards the specific names of those who wronged the Mensah family until the player demonstrates real investigation intent. He witnessed something suspicious in 1912 but has never spoken it to the family directly.",
  creatorNotes: "Street intelligence NPC. Provides market-layer context that Grandma Ama doesn't have. His lorebook links to Ama's deepest secrets — when the player knows what Kofi knows, they can unlock Ama's betrayal confirmation.",
  lorebook: [
    {
      keys: ["started-competitor-investigation"],
      content: "The player is investigating the competitor. Kofi will share the name and give the next concrete step.",
      insertionOrder: 1,
      unlocksDialogueIds: ["kofi-investigation-start"],
    },
    {
      keys: ["heard-betrayal-story", "heard-about-kwame"],
      content: "The player has heard the family history. Kofi connects the trading house story to current market conditions.",
      insertionOrder: 2,
    },
    {
      keys: ["witnessed-cocoa-grading"],
      content: "Player watched cocoa grading. Kofi unlocks a deeper lesson about colonial price suppression.",
      insertionOrder: 3,
    },
  ],
  greetings: [
    "Kwame! You're late — the market doesn't wait.",
    "Good. You're here. I need a strong back today.",
    "Come, come. The cocoa won't carry itself.",
    "Have you seen the prices this week? Remarkable.",
  ],
  memorySlots: [],
  dialogue: {
    "kofi-greet": {
      id: "kofi-greet",
      speaker: "npc",
      text: "Ah — good timing. I've been waiting. The new shipment came from the inland farms this morning. Your father will want to know what I found in the manifest.",
      options: [
        { id: "o1", label: "What was in the manifest?", nextId: "kofi-manifest", trait: "Wisdom", traitDelta: 2 },
        { id: "o2", label: "Can I help you with the trading today?", nextId: "kofi-trading-offer" },
        { id: "o3", label: "I'm looking for information about the family.", nextId: "kofi-family-info" },
        { id: "o4", label: "Not now, I have to go.", nextId: "kofi-farewell" },
      ],
    },
    "kofi-manifest": {
      id: "kofi-manifest",
      speaker: "npc",
      text: "Someone has been undercutting the Mensah trading rates. New buyer from Accra — offering higher prices to farmers who normally sell to your father. If this continues, we'll lose the northern farms within a season.",
      emotionAfter: "worried",
      discoversId: "mystery-market-competitor",
      options: [
        { id: "o1", label: "Who is this new buyer?", nextId: "kofi-new-buyer", trait: "Courage", traitDelta: 3 },
        { id: "o2", label: "What should my father do?", nextId: "kofi-advice" },
      ],
    },
    "kofi-new-buyer": {
      id: "kofi-new-buyer",
      speaker: "npc",
      text: "That's what I don't know yet. His name isn't in any of the market records — which means someone is hiding him from the guild register. Someone in this market is helping him operate in secret.",
      emotionAfter: "mysterious",
      discoversId: "quest-identify-competitor",
      options: [
        { id: "o1", label: "I'll find out who he is.", nextId: "kofi-investigation-start", memoryTag: "started-competitor-investigation" },
        { id: "o2", label: "Maybe it's nothing.", nextId: "kofi-dismissal" },
      ],
    },
    "kofi-investigation-start": {
      id: "kofi-investigation-start",
      speaker: "npc",
      text: "Be careful, Kwame. In business, as in everything — the person you most trust is often the person who knows the most about hurting you. Ask questions, but don't tell anyone what you're looking for.",
      emotionAfter: "solemn",
      discoversId: "quest-market-investigation",
      outcome: "investigation-started",
    },
    "kofi-trading-offer": {
      id: "kofi-trading-offer",
      speaker: "npc",
      text: "You want to learn the trade? Good. Your father should have brought you sooner. Come. I'll show you how to grade cocoa — how to know good beans from bad ones. It's a skill that will feed your children.",
      emotionAfter: "busy",
      discoversId: "skill-cocoa-grading",
      options: [
        { id: "o1", label: "Show me how to grade cocoa.", nextId: "kofi-cocoa-lesson", trait: "Wisdom", traitDelta: 4 },
        { id: "o2", label: "Maybe another time.", nextId: "kofi-farewell" },
      ],
    },
    "kofi-cocoa-lesson": {
      id: "kofi-cocoa-lesson",
      speaker: "npc",
      text: "A good cocoa bean is heavy, plump, and smells sweet even dried. A bad one is light, hollow, or sour. The trader who knows this will never be cheated. The one who doesn't — they'll be cheated every time.",
      emotionAfter: "busy",
      discoversId: "knowledge-cocoa-grading",
      outcome: "cocoa-skill-gained",
    },
    "kofi-family-info": {
      id: "kofi-family-info",
      speaker: "npc",
      text: "The Mensah family? I've known your father since we were boys. And his father before him. The Mensah name means something in this market. It means — a deal made is a deal kept.",
      emotionAfter: "warm",
      options: [
        { id: "o1", label: "Tell me about my grandfather.", nextId: "kofi-grandfather-story", trait: "Wisdom", traitDelta: 2 },
        { id: "o2", label: "What does the family name mean to you?", nextId: "kofi-family-meaning" },
      ],
    },
    "kofi-grandfather-story": {
      id: "kofi-grandfather-story",
      speaker: "npc",
      text: "Your grandfather came to me with nothing but a handshake and a promise. I gave him his first shipment on credit — 40 baskets of cocoa, 1892. He paid it back double, six months later. I knew then. This is not an ordinary man.",
      emotionAfter: "happy",
      discoversId: "memory-first-credit-1892",
      outcome: "kofi-memory-shared",
    },
    "kofi-family-meaning": {
      id: "kofi-family-meaning",
      speaker: "npc",
      text: "Reputation is the only currency that never inflates, boy. Money comes and goes. Land can be taken. But a good name — once you build it right — that is something they cannot burn.",
      emotionAfter: "solemn",
      options: [
        { id: "o1", label: "I'll remember that.", nextId: "kofi-farewell", trait: "Leadership", traitDelta: 3 },
      ],
    },
    "kofi-advice": {
      id: "kofi-advice",
      speaker: "npc",
      text: "Your father needs to go north himself. Talk to the farmers directly. Remind them that the Mensah name has stood for thirty years. A new buyer can offer a higher price today — but can they offer trust?",
      emotionAfter: "busy",
      outcome: "advice-received",
    },
    "kofi-dismissal": {
      id: "kofi-dismissal",
      speaker: "npc",
      text: "Nothing. Right. That's what people said about your grandfather when he started, too. Good luck, son.",
      emotionAfter: "busy",
      outcome: "conversation-ended",
    },
    "kofi-farewell": {
      id: "kofi-farewell",
      speaker: "npc",
      text: "All right. Come by the trading house tomorrow — there's always work.",
      outcome: "conversation-ended",
    },
  },
};

// ── NPC: Yaw (Farm Worker) ────────────────────────────────────────────────────

const yawFarmer: NpcDefinition = {
  id: "yaw-farmer",
  name: "Yaw",
  fullName: "Yaw Boateng",
  relationship: "neighbor",
  occupation: "Cocoa Farmer",
  era: "1890–1900",
  phases: ["chapter1", "chapter2"],
  emotion: "busy",
  personality: ["hardworking", "humble", "loyal"],
  sprite: {
    ageGroup: "adult",
    gender: "male",
    characterId: "yaw-farmer",
    lifeStage: "adult",
    era: "1890s",
    appearanceSeed: "yaw-farm-worker",
    libraryId: "niakofa-original-art-demo-v1",
  },
  schedule: [
    { hour: 5,  col: 1, row: 1, activity: "Early morning farm work" },
    { hour: 8,  col: 2, row: 1, activity: "Harvesting cocoa pods" },
    { hour: 12, col: 2, row: 3, activity: "Midday rest under the tree" },
    { hour: 14, col: 1, row: 2, activity: "Afternoon farm work" },
    { hour: 18, col: 3, row: 4, activity: "Walking home" },
  ],
  dialogueRootId: "yaw-greet",
  openingLine: "Kwame! Good morning. The east grove is ready — I need another pair of hands before sundown. You came at the right time.",
  systemPrompt: "Yaw is a practical farmer who has worked the Mensah cocoa groves for two decades. He is not a storyteller — he carries physical memory, in his hands and in the land. He teaches through doing. He notices things others miss: tree health, pod quality, whether land has been disturbed. He knows which fields were taken without permission, and he remembers the day the colonial surveyors came.",
  creatorNotes: "Land memory NPC. He doesn't know family politics but he knows the physical story of the land. After time with him, the player should understand what the land meant to the family viscerally, not just historically.",
  lorebook: [
    {
      keys: ["helped-with-harvest", "harvested-cocoa"],
      content: "Player helped Yaw harvest. He trusts them now and will show the eastern boundary — where the land claim dispute began.",
      insertionOrder: 1,
    },
    {
      keys: ["heard-betrayal-story"],
      content: "Player knows about the betrayal. Yaw can confirm from a physical perspective — he remembers the day the colonial agents surveyed 'their' land.",
      insertionOrder: 2,
    },
    {
      keys: ["witnessed-cocoa-ceremony"],
      content: "Player witnessed the cocoa ceremony. Yaw opens up about the spiritual relationship between the Mensah family and the land.",
      insertionOrder: 3,
    },
  ],
  greetings: [
    "Hard day's work ahead. Good to have help.",
    "The pods are ready. Your father will be pleased.",
    "Have you eaten? You look thin.",
    "The rains came last night — a good sign.",
  ],
  memorySlots: [],
  dialogue: {
    "yaw-greet": {
      id: "yaw-greet",
      speaker: "npc",
      text: "Kwame! Good morning. I was hoping someone from the family would come today. The east grove is ready — but I need an extra pair of hands before sundown.",
      options: [
        { id: "o1", label: "I'll help you with the harvest.", nextId: "yaw-harvest-help", trait: "Compassion", traitDelta: 3 },
        { id: "o2", label: "How are the crops this season?", nextId: "yaw-crop-report" },
        { id: "o3", label: "I'm looking for something — an old document.", nextId: "yaw-document-hint" },
        { id: "o4", label: "I can't stay long.", nextId: "yaw-farewell" },
      ],
    },
    "yaw-harvest-help": {
      id: "yaw-harvest-help",
      speaker: "npc",
      text: "You're a good man, Kwame. Your grandfather would be proud. Come — I'll show you which pods are ready and which need another week. The timing matters more than the strength.",
      emotionAfter: "happy",
      discoversId: "skill-harvest-timing",
      outcome: "harvest-quest-started",
    },
    "yaw-crop-report": {
      id: "yaw-crop-report",
      speaker: "npc",
      text: "Better than last year. The rains came at the right time. I think we'll have enough to fill the Mensah warehouse — maybe more. But I heard there's a new buyer in town. Offering different prices.",
      emotionAfter: "worried",
      options: [
        { id: "o1", label: "What do you know about this buyer?", nextId: "yaw-buyer-info" },
        { id: "o2", label: "Don't worry — sell to the Mensah house as always.", nextId: "yaw-loyalty-confirmed", trait: "Leadership", traitDelta: 4 },
      ],
    },
    "yaw-buyer-info": {
      id: "yaw-buyer-info",
      speaker: "npc",
      text: "He came by here two days ago. Tall man. Very polite. Said he had buyers in England who paid better than the Accra market. He gave me papers to sign — but I told him I would have to talk to your father first.",
      emotionAfter: "busy",
      discoversId: "clue-suspicious-buyer",
      options: [
        { id: "o1", label: "Did you sign anything?", nextId: "yaw-no-signature", trait: "Wisdom", traitDelta: 2 },
        { id: "o2", label: "Good — don't sign anything without talking to us.", nextId: "yaw-loyalty-confirmed" },
      ],
    },
    "yaw-no-signature": {
      id: "yaw-no-signature",
      speaker: "npc",
      text: "No. My father always told me — never put your mark on something you don't understand completely. I kept the papers though. He left them here. You can have them if they help.",
      emotionAfter: "busy",
      discoversId: "document-buyer-contract",
      outcome: "buyer-papers-found",
    },
    "yaw-loyalty-confirmed": {
      id: "yaw-loyalty-confirmed",
      speaker: "npc",
      text: "That's what I told him. The Mensah family has worked with my family for twenty years. You don't throw away twenty years for a better price today.",
      emotionAfter: "warm",
      outcome: "loyalty-gained",
    },
    "yaw-document-hint": {
      id: "yaw-document-hint",
      speaker: "npc",
      text: "A document? Your grandfather left things everywhere. I found some old receipts under the storage shed last year — farm records from before I was born. I kept them — didn't know what to do with them.",
      emotionAfter: "mysterious",
      discoversId: "document-old-receipts",
      options: [
        { id: "o1", label: "Can I see those receipts?", nextId: "yaw-receipts-found", trait: "Wisdom", traitDelta: 3 },
      ],
    },
    "yaw-receipts-found": {
      id: "yaw-receipts-found",
      speaker: "npc",
      text: "Here. Don't know why your grandfather hid them out here. But there are dates on these — 1893 to 1898. And a name at the bottom of each one. Not your grandfather's handwriting.",
      emotionAfter: "mysterious",
      discoversId: "clue-hidden-receipts-1893",
      outcome: "receipts-acquired",
    },
    "yaw-farewell": {
      id: "yaw-farewell",
      speaker: "npc",
      text: "All right. Come back if you need anything. The farm is always here.",
      outcome: "conversation-ended",
    },
  },
};

// ── NPC: Elder Nana ─────────────────────────────────────────────────────────────

const elderNana: NpcDefinition = {
  id: "elder-nana",
  name: "Elder Nana",
  fullName: "Nana Kwame Asiedu",
  relationship: "elder",
  occupation: "Village Elder · Memory Keeper",
  era: "1890–1920",
  phases: ["chapter1", "chapter2", "chapter3", "world-regen", "finale"],
  emotion: "solemn",
  personality: ["wise", "ceremonial", "protective", "philosophical"],
  sprite: {
    ageGroup: "elder",
    gender: "male",
    characterId: "elder-nana",
    lifeStage: "elder",
    era: "1890s",
    appearanceSeed: "elder-nana-village",
    libraryId: "niakofa-original-art-demo-v1",
  },
  schedule: [
    { hour: 7,  col: 4, row: 0, activity: "Morning consultation under the baobab" },
    { hour: 10, col: 4, row: 1, activity: "Receiving visitors at the elder's seat" },
    { hour: 14, col: 3, row: 0, activity: "Community meeting" },
    { hour: 17, col: 4, row: 0, activity: "Evening storytelling" },
    { hour: 20, col: 4, row: 1, activity: "Night prayers" },
  ],
  dialogueRootId: "elder-greet",
  openingLine: "The baobab sees everything. It was here before your grandfather, and it will be here long after us — sit, and I will tell you why.",
  systemPrompt: "Elder Nana is the village's oldest living keeper of oral history. He speaks in slow, deliberate layers. Every answer he gives opens a new question. He knows the full arc of the Mensah family story — including what Grandma Ama has never told anyone — but he will only share it with someone who has first listened to others. He respects the player's journey and will confirm or deepen what other NPCs have shared.",
  creatorNotes: "Summit NPC — the final truth-keeper. Rewards players who have talked to all other NPCs before coming to him. His lorebook is the most powerful: when the player has experienced multiple other NPC threads, Elder Nana can weave them all into the full family narrative.",
  lorebook: [
    {
      keys: ["heard-betrayal-story", "started-competitor-investigation"],
      content: "Player knows about the 1912 betrayal thread. Elder Nana can now confirm and expand the full political context — colonial land policy, community impact, and what was done to resist.",
      insertionOrder: 1,
      unlocksDialogueIds: ["elder-difficult-years"],
    },
    {
      keys: ["found-journal", "promised-find-journal"],
      content: "Player has engaged with the family journal. Elder Nana recognizes this as the sign of a true memory-seeker and shares the deepest archive entry — the oral history of the original Mensah land grant.",
      insertionOrder: 2,
    },
    {
      keys: ["helped-with-harvest", "harvested-cocoa"],
      content: "Player worked the land with Yaw. Elder Nana honors this — physical relationship with the land is the most ancient form of family connection in Akan culture.",
      insertionOrder: 3,
    },
    {
      keys: ["heard-about-kwame", "asked-about-kwame"],
      content: "Player has been asking about Kwame from multiple sources. Elder Nana can now tell them what Kwame meant to the village — not just to the family.",
      insertionOrder: 4,
      unlocksDialogueIds: ["elder-mensah-history"],
    },
    {
      constant: true,
      keys: [],
      content: "Elder Nana always asks what the player has learned before answering. He is the only NPC who explicitly references other NPC conversations.",
      insertionOrder: 10,
    },
  ],
  greetings: [
    "The tree remembers. Do you?",
    "Every family has a wound. Every wound has a lesson.",
    "Come sit. The young need the stories of the old.",
    "I have been waiting for someone to ask the right questions.",
  ],
  memorySlots: [],
  dialogue: {
    "elder-greet": {
      id: "elder-greet",
      speaker: "npc",
      text: "The baobab sees everything. It was here before your grandfather, and it will be here long after us. Do you know why the baobab lives so long?",
      options: [
        { id: "o1", label: "Because its roots go very deep.", nextId: "elder-roots", trait: "Wisdom", traitDelta: 5 },
        { id: "o2", label: "I don't know. Tell me.", nextId: "elder-explain-baobab" },
        { id: "o3", label: "I've come to ask about the Mensah family.", nextId: "elder-mensah-history" },
      ],
    },
    "elder-roots": {
      id: "elder-roots",
      speaker: "npc",
      text: "Yes. And why do the roots go deep? Because the tree knows — what nourishes you must be protected even when no one can see it. Your family's roots are in this soil. That is why you are here.",
      emotionAfter: "solemn",
      discoversId: "wisdom-baobab-roots",
      options: [
        { id: "o1", label: "Tell me about the Mensah family's roots.", nextId: "elder-mensah-history" },
      ],
    },
    "elder-explain-baobab": {
      id: "elder-explain-baobab",
      speaker: "npc",
      text: "The baobab stores water inside its own trunk. When the droughts come — and they always come — the baobab drinks from what it has preserved inside itself. Your family has done the same. The stories you preserve today will sustain the children you haven't met yet.",
      emotionAfter: "solemn",
      discoversId: "wisdom-family-preservation",
      options: [
        { id: "o1", label: "What stories should I be preserving?", nextId: "elder-mensah-history" },
      ],
    },
    "elder-mensah-history": {
      id: "elder-mensah-history",
      speaker: "npc",
      text: "The Mensah name is old. Older than the trading house. Older than the colonial markets. Your ancestors were here when the land was different — when the rivers had different names, and the trees knew different songs.",
      emotionAfter: "solemn",
      discoversId: "knowledge-mensah-origins",
      options: [
        { id: "o1", label: "What happened to the family in the difficult years?", nextId: "elder-difficult-years", trait: "Courage", traitDelta: 3 },
        { id: "o2", label: "How do you know all this?", nextId: "elder-keeper-role" },
      ],
    },
    "elder-difficult-years": {
      id: "elder-difficult-years",
      speaker: "npc",
      text: "There was a year — 1913 — when this village almost disappeared. The Mensah family lost their business. Others left. But one thing kept people here. The knowledge that what was built once can be built again.",
      emotionAfter: "solemn",
      discoversId: "history-1913-crisis",
      options: [
        { id: "o1", label: "What gave them that knowledge?", nextId: "elder-legacy-answer" },
        { id: "o2", label: "I'm trying to understand what was lost.", nextId: "elder-what-was-lost" },
      ],
    },
    "elder-legacy-answer": {
      id: "elder-legacy-answer",
      speaker: "npc",
      text: "The stories. The ones the elders told before they died. The ones the children memorized before they could read. That is what I do. Not just hold the stories — pass them forward to the ones who can act on them.",
      emotionAfter: "warm",
      outcome: "elder-wisdom-received",
    },
    "elder-what-was-lost": {
      id: "elder-what-was-lost",
      speaker: "npc",
      text: "A name. A place. A time. A connection between the living and those who came before. That is what is always at risk. Not the land — the memory of what the land meant.",
      emotionAfter: "mysterious",
      discoversId: "quest-recover-memory",
      outcome: "memory-quest-revealed",
    },
    "elder-keeper-role": {
      id: "elder-keeper-role",
      speaker: "npc",
      text: "Someone must remember. When no one remembers, the family disappears — even if the people remain. My job is to carry the weight of what others cannot. I have been doing this for sixty years.",
      emotionAfter: "solemn",
      outcome: "elder-role-understood",
    },
  },
};

// ── NPC Registry ────────────────────────────────────────────────────────────────

export const NPC_REGISTRY: Record<string, NpcDefinition> = {
  "grandma-ama": grandmaAma,
  "kofi-trader": kofiTrader,
  "yaw-farmer": yawFarmer,
  "elder-nana": elderNana,
};

// ── Schedule resolver ────────────────────────────────────────────────────────

/** Get tile position of NPC for a given game-world hour (0-23) and phase. */
export function getNpcLocation(
  npc: NpcDefinition,
  hour: number,
  phase: string,
): { col: number; row: number; activity: string } | null {
  if (!npc.phases.includes(phase)) return null;
  // Find the latest schedule entry at or before this hour
  const entries = [...npc.schedule].sort((a, b) => a.hour - b.hour);
  let active = entries[0];
  for (const e of entries) {
    if (e.hour <= hour) active = e;
  }
  return active ?? null;
}

/** Get all NPCs present in a given phase, with their current tile position. */
export function getPhaseNpcs(
  phase: string,
  hour: number,
): Array<{ npc: NpcDefinition; col: number; row: number; activity: string }> {
  return Object.values(NPC_REGISTRY).flatMap(npc => {
    const loc = getNpcLocation(npc, hour, phase);
    if (!loc) return [];
    return [{ npc, ...loc }];
  });
}

/** Convert 0-23 hour to display string. */
export function formatGameHour(hour: number): string {
  const h = hour % 12 || 12;
  const ampm = hour < 12 ? "AM" : "PM";
  return `${h}:00 ${ampm}`;
}

/** Advance game hour. Cycles 6 → 20 in demo mode. */
export function advanceGameHour(current: number, delta = 1): number {
  const next = current + delta;
  return next > 20 ? 6 : next;
}
