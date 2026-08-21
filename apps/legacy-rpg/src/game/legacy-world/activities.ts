/**
 * Every one of the four systems named in the request -- Chapter scenes,
 * Living Relationships, Fishing/River Memory, What Remains -- registered
 * here as a WorldActivity bound to a WorldLocation. None of them are
 * separate panels; they all produce WorldMutations against the same state.
 */

import type { WorldActivity, WorldMutation } from "./types";

export const WORLD_ACTIVITIES: Record<string, WorldActivity> = {
  "fishing-river-north": {
    id: "fishing-river-north",
    locationId: "river-north-bank",
    type: "fishing",
    runtime: "focused",
    canRepeat: true,
    label: "Fish the North Bank",
    onComplete: (result): WorldMutation[] => {
      const mutations: WorldMutation[] = [
        {
          type: "journal-entry",
          title: "River Catch",
          body: `Fished the north bank. ${result.fishName ?? "Something"} took the line.`,
          tags: ["fishing", "river"],
        },
      ];
      if (result.isMemoryCatch) {
        mutations.push(
          { type: "add-memory-echo", locationId: "river-north-bank", memoryId: (result.memoryId as string) ?? "river-memory-kwame-youth" },
          { type: "journal-entry", title: "River Memory", body: (result.memoryText as string) ?? "A memory surfaces with the catch.", tags: ["memory", "river", "ancestor"] }
        );
      }
      if (result.itemId) mutations.push({ type: "grant-item", itemId: result.itemId as string, qty: 1 });
      return mutations;
    },
  },

  "fishing-old-jetty": {
    id: "fishing-old-jetty",
    locationId: "old-jetty",
    type: "fishing",
    runtime: "focused",
    canRepeat: true,
    label: "Fish from the Old Jetty",
    onComplete: (result): WorldMutation[] => [
      {
        type: "journal-entry",
        title: "Jetty Catch",
        body: `Fished from the old jetty. ${result.fishName ?? "A fish"} was landed.`,
        tags: ["fishing", "river"],
      },
    ],
  },

  // ─── What Remains -- environmental storytelling, stood in front of, not read in a panel ───
  "examine-what-remains": {
    id: "examine-what-remains",
    locationId: "what-remains-ruins",
    type: "memory-echo",
    runtime: "inline",
    canRepeat: true,
    label: "Examine the ruins",
    onComplete: (result): WorldMutation[] => [
      {
        type: "journal-entry",
        title: "What Remains",
        body: (result.text as string) ?? "The ruins still hold stories -- a broken sign, an old ledger, a family name half-erased.",
        tags: ["memory", "what-remains"],
      },
      { type: "set-location-state", locationId: "what-remains-ruins", state: "examined" },
    ],
  },

  // ─── Living Relationships -- behavioral state attached to an actual NPC, not a dashboard ───
  "talk-elder": {
    id: "talk-elder",
    locationId: "elder-home",
    type: "dialogue",
    runtime: "inline",
    canRepeat: true,
    label: "Speak with the Elder",
    onComplete: (result): WorldMutation[] => {
      const mutations: WorldMutation[] = [];
      if (typeof result.relationshipDelta === "number") {
        mutations.push({ type: "relationship-delta", npcId: "elder", delta: result.relationshipDelta });
      }
      if (result.dialogueSummary) {
        mutations.push({
          type: "journal-entry",
          title: "Conversation with the Elder",
          body: result.dialogueSummary as string,
          tags: ["relationship", "elder"],
        });
      }
      return mutations;
    },
  },

  // ─── Chapter content as a located, in-world activity rather than a separate mode ───
  "chapter1-enter-compound": {
    id: "chapter1-enter-compound",
    locationId: "mensah-compound",
    type: "quest-objective",
    runtime: "inline",
    canRepeat: false,
    label: "Enter the Mensah compound",
    requirements: { quest: "chapter1-a-new-path" },
    onComplete: (): WorldMutation[] => [
      { type: "quest-echo", questId: "chapter1-a-new-path" },
      { type: "journal-entry", title: "Home", body: "Kwame steps inside the family compound.", tags: ["chapter1"] },
    ],
  },
};

export function getActivity(id: string): WorldActivity | undefined {
  return WORLD_ACTIVITIES[id];
}

export function getActivitiesForLocation(locationId: string): WorldActivity[] {
  return Object.values(WORLD_ACTIVITIES).filter((a) => a.locationId === locationId);
}
