import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BUILT_IN_STORY_TEMPLATES,
  instantiateStoryTemplate,
  loadSavedStoryTemplates,
  parseSavedStoryTemplates,
  removeStoryTemplate,
  saveStoryTemplate,
  type StoryStudioTemplate,
} from "../story-studio-templates";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test("built-in Spark templates are reusable layouts without media", () => {
  assert.equal(BUILT_IN_STORY_TEMPLATES.length, 3);
  for (const template of BUILT_IN_STORY_TEMPLATES) {
    assert.ok(template.name.length > 0);
    assert.ok(template.caption.length > 0);
    assert.ok(template.elements.every((element) => element.type === "text" || element.type === "sticker" || element.type === "drawing"));
  }
});

test("saved templates are scoped to an account and can be removed", () => {
  const storage = new MemoryStorage();
  const template: StoryStudioTemplate = {
    ...BUILT_IN_STORY_TEMPLATES[0],
    id: "saved-layout",
    name: "My layout",
  };

  assert.deepEqual(saveStoryTemplate(7, template, storage), [template]);
  assert.deepEqual(loadSavedStoryTemplates(7, storage), [template]);
  assert.deepEqual(loadSavedStoryTemplates(8, storage), []);
  assert.deepEqual(removeStoryTemplate(7, template.id, storage), []);
});

test("template loading rejects malformed drawing data and unsafe element types", () => {
  const source = JSON.stringify([{
    ...BUILT_IN_STORY_TEMPLATES[0],
    id: "bad",
    elements: [{
      id: "bad-stroke",
      type: "drawing",
      payload: { points: [[-1, 50], [101, 50]], color: "url(javascript:alert(1))", width: 100 },
      position_x: 50, position_y: 50, scale: 1, rotation: 0, z_index: 1,
    }],
  }]);
  assert.deepEqual(parseSavedStoryTemplates(source), []);
});

test("applying a template gives its elements fresh IDs and independent drawing points", () => {
  const template: StoryStudioTemplate = {
    ...BUILT_IN_STORY_TEMPLATES[0],
    elements: [{
      id: "stroke",
      type: "drawing",
      payload: { points: [[10, 20], [30, 40]], color: "#ffffff", width: 4 },
      position_x: 50, position_y: 50, scale: 1, rotation: 0, z_index: 2,
    }],
  };
  const applied = instantiateStoryTemplate(template);
  assert.notEqual(applied[0].id, template.elements[0].id);
  assert.notEqual(applied[0].payload.points, template.elements[0].payload.points);
  assert.deepEqual(applied[0].payload.points, template.elements[0].payload.points);
});