import assert from "node:assert/strict";
import test from "node:test";
import { evaluateInteraction } from "../../legacy-runtime/legacy-world/runtime-interaction";
import { mensahCompoundScene } from "../../legacy-runtime/scene-mensah-compound";

test("every Mensah Compound interaction point resolves to a live activity", () => {
  assert.equal(mensahCompoundScene.interactionPoints.length, 19);

  for (const point of mensahCompoundScene.interactionPoints) {
    const frame = evaluateInteraction(
      { x: point.x, y: point.y },
      { scene: mensahCompoundScene, padding: 0.01 },
    );

    assert.ok(frame.location, `${point.id} should resolve to a scene location`);
    assert.ok(frame.activity, `${point.id} should resolve to a world activity`);
    assert.match(frame.location?.id ?? "", /^scene:mensah-compound:/);
  }
});