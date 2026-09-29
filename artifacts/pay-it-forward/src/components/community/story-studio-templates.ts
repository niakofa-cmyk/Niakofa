import type { EditableStoryElement } from "./StoryEditorCanvas";

export type StoryStudioTemplate = {
  id: string;
  name: string;
  caption: string;
  textBackground: string;
  elements: EditableStoryElement[];
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const STORAGE_PREFIX = "niakofa:spark-templates:v1:";
const MAX_SAVED_TEMPLATES = 12;
const ALLOWED_ELEMENT_TYPES = new Set<EditableStoryElement["type"]>(["text", "sticker", "drawing"]);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const BUILT_IN_STORY_TEMPLATES: StoryStudioTemplate[] = [
  {
    id: "neighbor-hello",
    name: "Neighborhood hello",
    caption: "Hello, neighbors!",
    textBackground: "#172554",
    elements: [{
      id: "hello-text",
      type: "text",
      payload: { text: "A little moment from today", color: "#ffffff", font_size: 24, align: "center" },
      position_x: 50, position_y: 48, scale: 1, rotation: 0, z_index: 15,
    }],
  },
  {
    id: "gratitude",
    name: "Gratitude",
    caption: "Grateful for the people who show up.",
    textBackground: "#14532d",
    elements: [{
      id: "gratitude-text",
      type: "text",
      payload: { text: "Thank you, neighbors", color: "#ffffff", font_size: 26, align: "center" },
      position_x: 50, position_y: 50, scale: 1, rotation: 0, z_index: 15,
    }],
  },
  {
    id: "community-ask",
    name: "Community ask",
    caption: "What would help your block today?",
    textBackground: "#4c1d95",
    elements: [{
      id: "community-ask-text",
      type: "text",
      payload: { text: "Let's help each other", color: "#ffffff", font_size: 24, align: "center" },
      position_x: 50, position_y: 50, scale: 1, rotation: 0, z_index: 15,
    }],
  },
];

function storageForUser(userId: number, storage?: StorageLike): StorageLike | null {
  if (!Number.isSafeInteger(userId) || userId < 1) return null;
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeElement(value: unknown): EditableStoryElement | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.id !== "string" || typeof input.type !== "string"
    || !ALLOWED_ELEMENT_TYPES.has(input.type as EditableStoryElement["type"])
    || !input.payload || typeof input.payload !== "object" || Array.isArray(input.payload)) return null;
  const payload = input.payload as Record<string, unknown>;
  const positionX = Number(input.position_x);
  const positionY = Number(input.position_y);
  const scale = Number(input.scale);
  const rotation = Number(input.rotation);
  const zIndex = Number(input.z_index);
  if (![positionX, positionY, scale, rotation, zIndex].every(Number.isFinite)) return null;

  if (input.type === "text" && (typeof payload.text !== "string" || payload.text.length > 1000)) return null;
  if (input.type === "sticker" && (typeof payload.sticker !== "string" || payload.sticker.length > 32)) return null;
  if (input.type === "drawing") {
    if (typeof payload.color !== "string" || !HEX_COLOR.test(payload.color)
      || typeof payload.width !== "number" || payload.width < 1 || payload.width > 12
      || !Array.isArray(payload.points) || payload.points.length < 2 || payload.points.length > 1000
      || payload.points.some((point) => !Array.isArray(point) || point.length !== 2
        || !point.every((coordinate) => typeof coordinate === "number" && coordinate >= 0 && coordinate <= 100))) return null;
  }

  return {
    id: input.id,
    type: input.type as EditableStoryElement["type"],
    payload: {
      ...payload,
      ...(Array.isArray(payload.points) ? { points: payload.points.map((point) => [...point]) } : {}),
    },
    position_x: Math.max(0, Math.min(100, positionX)),
    position_y: Math.max(0, Math.min(100, positionY)),
    scale: Math.max(0.5, Math.min(3, scale)),
    rotation: Math.max(-180, Math.min(180, rotation)),
    z_index: Math.max(0, Math.min(100, Math.round(zIndex))),
  };
}

export function parseSavedStoryTemplates(value: string | null): StoryStudioTemplate[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_SAVED_TEMPLATES).flatMap((item): StoryStudioTemplate[] => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const input = item as Record<string, unknown>;
      if (typeof input.id !== "string" || typeof input.name !== "string" || !input.name.trim()
        || input.name.length > 60 || typeof input.caption !== "string" || input.caption.length > 1000
        || typeof input.textBackground !== "string" || !HEX_COLOR.test(input.textBackground)
        || !Array.isArray(input.elements) || input.elements.length > 30) return [];
      const elements = input.elements.map(normalizeElement);
      if (elements.some((element) => element === null)) return [];
      return [{
        id: input.id,
        name: input.name.trim(),
        caption: input.caption,
        textBackground: input.textBackground,
        elements: elements as EditableStoryElement[],
      }];
    });
  } catch {
    return [];
  }
}

export function loadSavedStoryTemplates(userId: number, storage?: StorageLike): StoryStudioTemplate[] {
  const target = storageForUser(userId, storage);
  if (!target) return [];
  try {
    return parseSavedStoryTemplates(target.getItem(`${STORAGE_PREFIX}${userId}`));
  } catch {
    return [];
  }
}

export function saveStoryTemplate(
  userId: number,
  template: StoryStudioTemplate,
  storage?: StorageLike,
): StoryStudioTemplate[] {
  const target = storageForUser(userId, storage);
  if (!target) throw new Error("Reusable templates require an active account and browser storage.");
  const safe = parseSavedStoryTemplates(JSON.stringify([template]))[0];
  if (!safe) throw new Error("This Spark layout could not be saved as a template.");
  const templates = [safe, ...loadSavedStoryTemplates(userId, target).filter((item) => item.id !== safe.id)]
    .slice(0, MAX_SAVED_TEMPLATES);
  target.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(templates));
  return templates;
}

export function removeStoryTemplate(userId: number, templateId: string, storage?: StorageLike): StoryStudioTemplate[] {
  const target = storageForUser(userId, storage);
  if (!target) return [];
  const templates = loadSavedStoryTemplates(userId, target).filter((item) => item.id !== templateId);
  target.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(templates));
  return templates;
}

export function instantiateStoryTemplate(template: StoryStudioTemplate): EditableStoryElement[] {
  const prefix = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
  return template.elements.map((element, index) => ({
    ...element,
    id: `${prefix}-${index}`,
    payload: {
      ...element.payload,
      ...(Array.isArray(element.payload.points)
        ? { points: element.payload.points.map((point) => Array.isArray(point) ? [...point] : point) }
        : {}),
    },
  }));
}