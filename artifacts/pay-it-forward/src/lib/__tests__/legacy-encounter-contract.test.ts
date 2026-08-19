import assert from "node:assert/strict";
import test from "node:test";
import { mensahCompoundScene } from "../../legacy-runtime/scene-mensah-compound";

test("Mensah Compound owns a real hostile encounter without reusing family NPCs", () => {
  const encounters = mensahCompoundScene.combatEncounters ?? [];
  assert.equal(encounters.length, 1);
  const [encounter] = encounters;
  assert.equal(encounter.name, "Road Raider");
  assert.ok(encounter.hp > 0);
  assert.ok(encounter.rewardItemId);
  assert.ok(encounter.rewardQuestId);
  assert.ok(!mensahCompoundScene.npcSpawns.some((spawn) => spawn.characterId === encounter.id));
});

test("the authored encounter is reachable from the compound spawn", () => {
  const [encounter] = mensahCompoundScene.combatEncounters ?? [];
  const spawn = { x: 15, y: 19 };
  assert.ok(Math.hypot(encounter.x - spawn.x, encounter.y - spawn.y) < 4);
});