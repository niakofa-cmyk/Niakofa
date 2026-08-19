import {
  AMA_SERWAA,
  type NPCDefinition,
} from "./legacy-npc";

const KWAKU_MENSAH: NPCDefinition = {
  ...AMA_SERWAA,
  id: "kwaku-mensah",
  name: "Kwaku Mensah",
  description: "A steady hand around the compound, carrying stories between the household and the road.",
  homeTile: { x: 5, y: 12 },
  placeholderColor: 0x6f9f9b,
  relationshipLevel: 30,
  dialogueLines: [
    "The front road is quiet today, but quiet never lasts.",
    "Your family kept this place standing through every season.",
    "I can show you the workshop when the light is right.",
    "If you leave the compound, keep the baobab on your left.",
    "Come back before dusk. The family remembers better together.",
  ],
};

const EFUA_COOK: NPCDefinition = {
  ...AMA_SERWAA,
  id: "efua-cook",
  name: "Efua",
  description: "The compound cook, keeper of the kitchen fire and its quiet histories.",
  homeTile: { x: 20, y: 12 },
  placeholderColor: 0xc97855,
  relationshipLevel: 25,
  dialogueLines: [
    "The fire is ready, but the story comes after the work.",
    "Every pot in this kitchen has fed more than one generation.",
    "Bring me water from the well and I will tell you what Ama kept.",
    "The smoke carries news across the courtyard.",
    "Eat first, then take your memory out into the world.",
  ],
};

const KOFI_CARPENTER: NPCDefinition = {
  ...AMA_SERWAA,
  id: "kofi-carpenter",
  name: "Kofi",
  description: "The compound carpenter, repairing doors, stools, and the things families pass down.",
  homeTile: { x: 13, y: 15 },
  placeholderColor: 0x9a805c,
  relationshipLevel: 20,
  dialogueLines: [
    "A good joint holds because every piece knows its place.",
    "Your grandfather taught me to listen before I cut.",
    "The workshop is more than timber. It is a record of hands.",
    "There is a broken stool by the guest house. We can mend it.",
    "Take this lesson with you: repair what you can, remember the rest.",
  ],
};

/** The Mensah Compound owns its roster; IDs match scene.npcSpawns exactly. */
export const MENSAH_COMPOUND_NPCS: NPCDefinition[] = [
  AMA_SERWAA,
  KWAKU_MENSAH,
  EFUA_COOK,
  KOFI_CARPENTER,
];