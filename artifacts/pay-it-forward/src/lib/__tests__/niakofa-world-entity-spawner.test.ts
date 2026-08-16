/**
 * Tests for NiakofaWorldEntitySpawner — dynamic NPC/quest/event generation.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  spawnNpc,
  spawnQuest,
  spawnEvent,
  batchSpawn,
  payloadToAncestor,
  type AncestorRecord,
  type WorldSpawnContext,
  type WorldRegenerationPayload,
} from "../niakofa-world-entity-spawner.js";

// ── helpers ────────────────────────────────────────────────────────────────────

function makeAncestor(overrides: Partial<AncestorRecord> = {}): AncestorRecord {
  return {
    id: "ama-mensah-1896",
    name: "Ama Mensah",
    year: 1896,
    location: "Cape Coast",
    role: "family_ancestor",
    questSeed: "lost-cocoa-ledger",
    landmark: "Mensah Trading House",
    traits: ["determined", "trader"],
    relationshipToPlayer: "great-grandmother",
    ...overrides,
  };
}

function makeCtx(overrides: Partial<WorldSpawnContext> = {}): WorldSpawnContext {
  return {
    regionId: "mensah-compound-present",
    phase: "chapter-1",
    gameHour: 10,
    alreadySpawned: new Set(),
    playerTraits: { wisdom: 2 },
    ...overrides,
  };
}

// ── spawnNpc ──────────────────────────────────────────────────────────────────

describe("spawnNpc", () => {
  it("returns a SpawnedNpc with correct fields", () => {
    const npc = spawnNpc(makeAncestor(), makeCtx());
    assert.ok(npc);
    assert.equal(npc!.name, "Ama Mensah");
    assert.equal(npc!.ancestorId, "ama-mensah-1896");
    assert.equal(npc!.regionId, "mensah-compound-present");
    assert.equal(npc!.hasQuest, true);
    assert.ok(npc!.questId?.includes("ama-mensah-1896"));
  });

  it("returns null if already spawned", () => {
    const ctx = makeCtx({ alreadySpawned: new Set(["ama-mensah-1896"]) });
    const npc = spawnNpc(makeAncestor(), ctx);
    assert.equal(npc, null);
  });

  it("produces memory tags with ancestor id and role", () => {
    const npc = spawnNpc(makeAncestor(), makeCtx());
    assert.ok(npc!.memoryTags.includes("ancestor:ama-mensah-1896"));
    assert.ok(npc!.memoryTags.includes("role:family_ancestor"));
  });

  it("includes trait tags from ancestor", () => {
    const npc = spawnNpc(makeAncestor({ traits: ["brave", "wise"] }), makeCtx());
    assert.ok(npc!.memoryTags.includes("trait:brave"));
    assert.ok(npc!.memoryTags.includes("trait:wise"));
  });

  it("hasQuest is false when no questSeed", () => {
    const npc = spawnNpc(makeAncestor({ questSeed: undefined }), makeCtx());
    assert.equal(npc!.hasQuest, false);
    assert.equal(npc!.questId, undefined);
  });

  it("pos is deterministic for same ancestor id", () => {
    const npc1 = spawnNpc(makeAncestor(), makeCtx());
    const ctx2 = makeCtx(); // fresh context
    const npc2 = spawnNpc(makeAncestor(), ctx2);
    assert.equal(npc1!.row, npc2!.row);
    assert.equal(npc1!.column, npc2!.column);
  });

  it("dialogue line is non-empty", () => {
    const npc = spawnNpc(makeAncestor(), makeCtx());
    assert.ok(npc!.dialogueSeed.length > 0);
  });

  it("each role produces a different dialogue template", () => {
    const roles: AncestorRecord["role"][] = [
      "family_ancestor", "community_elder", "antagonist", "ally", "witness", "unknown"
    ];
    const lines = roles.map(role => {
      const npc = spawnNpc(makeAncestor({ id: `id-${role}`, role }), makeCtx());
      return npc!.dialogueSeed;
    });
    // Not all lines should be identical
    const unique = new Set(lines);
    assert.ok(unique.size > 1);
  });
});

// ── spawnQuest ────────────────────────────────────────────────────────────────

describe("spawnQuest", () => {
  it("returns a SpawnedQuest with correct fields", () => {
    const quest = spawnQuest(makeAncestor(), makeCtx());
    assert.ok(quest);
    assert.ok(quest!.questId.includes("ama-mensah-1896"));
    assert.equal(quest!.ancestorId, "ama-mensah-1896");
    assert.equal(quest!.phase, "chapter-1");
  });

  it("returns null when no questSeed", () => {
    const quest = spawnQuest(makeAncestor({ questSeed: undefined }), makeCtx());
    assert.equal(quest, null);
  });

  it("includes talk objective", () => {
    const quest = spawnQuest(makeAncestor(), makeCtx())!;
    const talkObj = quest.objectives.find(o => o.kind === "talk");
    assert.ok(talkObj, "should have a talk objective");
    assert.ok(talkObj!.label.includes("Ama Mensah"));
  });

  it("includes explore objective when landmark is set", () => {
    const quest = spawnQuest(makeAncestor({ landmark: "Mensah Trading House" }), makeCtx())!;
    const exploreObj = quest.objectives.find(o => o.kind === "explore");
    assert.ok(exploreObj, "should have an explore objective for the landmark");
  });

  it("omits explore objective when no landmark", () => {
    const quest = spawnQuest(makeAncestor({ landmark: undefined }), makeCtx())!;
    const exploreObj = quest.objectives.find(o => o.kind === "explore");
    assert.equal(exploreObj, undefined);
  });

  it("reward traits include historical_memory", () => {
    const quest = spawnQuest(makeAncestor(), makeCtx())!;
    assert.ok("historical_memory" in quest.rewardTraits);
  });

  it("community_elder gets wisdom reward trait", () => {
    const quest = spawnQuest(makeAncestor({ role: "community_elder" }), makeCtx())!;
    assert.ok("wisdom" in quest.rewardTraits);
  });
});

// ── spawnEvent ────────────────────────────────────────────────────────────────

describe("spawnEvent", () => {
  it("creates a landmark event when ancestor has landmark", () => {
    const event = spawnEvent(makeAncestor(), makeCtx());
    assert.equal(event.kind, "landmark");
    assert.ok(event.label.includes("Mensah Trading House"));
  });

  it("creates historical_echo for witness role without landmark", () => {
    const event = spawnEvent(makeAncestor({ role: "witness", landmark: undefined }), makeCtx());
    assert.equal(event.kind, "historical_echo");
  });

  it("creates collectible for unknown role without landmark/questSeed", () => {
    const event = spawnEvent(makeAncestor({ role: "unknown", landmark: undefined, questSeed: undefined }), makeCtx());
    assert.equal(event.kind, "collectible");
  });

  it("eventId contains ancestor id and region id", () => {
    const event = spawnEvent(makeAncestor(), makeCtx());
    assert.ok(event.eventId.includes("ama-mensah-1896"));
    assert.ok(event.eventId.includes("mensah-compound-present"));
  });

  it("pos is deterministic", () => {
    const e1 = spawnEvent(makeAncestor(), makeCtx());
    const e2 = spawnEvent(makeAncestor(), makeCtx());
    assert.equal(e1.row, e2.row);
    assert.equal(e1.column, e2.column);
  });

  it("pos is in valid tile range", () => {
    const event = spawnEvent(makeAncestor(), makeCtx());
    assert.ok(event.row >= 0 && event.row < 6);
    assert.ok(event.column >= 0 && event.column < 9);
  });
});

// ── batchSpawn ────────────────────────────────────────────────────────────────

describe("batchSpawn", () => {
  it("spawns NPCs for all ancestors", () => {
    const ancestors = [
      makeAncestor({ id: "a1", name: "Ama" }),
      makeAncestor({ id: "a2", name: "Kofi", questSeed: undefined }),
    ];
    const result = batchSpawn(ancestors, makeCtx());
    assert.equal(result.npcs.length, 2);
  });

  it("marks spawned ancestors so they are not duplicated", () => {
    const ancestors = [makeAncestor(), makeAncestor()];
    const ctx = makeCtx();
    const result = batchSpawn(ancestors, ctx);
    // Second ancestor has same ID so should be skipped
    assert.equal(result.npcs.length, 1);
    assert.ok(ctx.alreadySpawned.has("ama-mensah-1896"));
  });

  it("generates quests only for ancestors with questSeed", () => {
    const ancestors = [
      makeAncestor({ id: "q1", questSeed: "lost-ledger" }),
      makeAncestor({ id: "q2", questSeed: undefined }),
    ];
    const result = batchSpawn(ancestors, makeCtx());
    assert.equal(result.quests.length, 1);
  });

  it("always generates events for every ancestor", () => {
    const ancestors = [
      makeAncestor({ id: "e1" }),
      makeAncestor({ id: "e2" }),
      makeAncestor({ id: "e3" }),
    ];
    const result = batchSpawn(ancestors, makeCtx());
    assert.equal(result.events.length, 3);
  });
});

// ── payloadToAncestor ─────────────────────────────────────────────────────────

describe("payloadToAncestor", () => {
  it("converts a world regen payload to an AncestorRecord", () => {
    const payload: WorldRegenerationPayload = {
      type: "new_ancestor",
      name: "Ama Mensah",
      location: "Cape Coast",
      year: 1896,
      role: "family_ancestor",
      questSeed: "lost-cocoa-ledger",
      landmark: "Mensah Trading House",
    };
    const ancestor = payloadToAncestor(payload);
    assert.equal(ancestor.name, "Ama Mensah");
    assert.equal(ancestor.year, 1896);
    assert.equal(ancestor.questSeed, "lost-cocoa-ledger");
    assert.equal(ancestor.landmark, "Mensah Trading House");
  });

  it("generates a stable id from name and year", () => {
    const payload: WorldRegenerationPayload = {
      type: "new_ancestor",
      name: "Kofi Mensah",
      location: "Accra",
      year: 1920,
      role: "ally",
    };
    const a1 = payloadToAncestor(payload);
    const a2 = payloadToAncestor(payload);
    assert.equal(a1.id, a2.id);
    assert.ok(a1.id.includes("1920"));
  });

  it("handles minimal payload with no optional fields", () => {
    const payload: WorldRegenerationPayload = {
      type: "new_ancestor",
      name: "Unknown",
      location: "Unknown",
      year: 0,
      role: "unknown",
    };
    const ancestor = payloadToAncestor(payload);
    assert.equal(ancestor.questSeed, undefined);
    assert.equal(ancestor.landmark, undefined);
  });
});
