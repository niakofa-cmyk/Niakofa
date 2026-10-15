import { canAddItem, STUDIO_MAX_ITEMS, type StudioDestination, type StudioItem } from "./studio-policy";

/**
 * One state machine for the whole Studio. The old flow was three unrelated
 * overlays (camera, gallery, wizard) with ~100 useState hooks; here every
 * surface reads the same state, so switching between them is a mode change,
 * not a teardown/mount.
 */
export type StudioMode = "capture" | "review" | "publish" | "publishing";

export type StudioState = {
  mode: StudioMode;
  items: StudioItem[];
  activeId: string | null;
  destination: StudioDestination;
  caption: string;
  tagsInput: string;
  saveOriginalPrivately: boolean;
  error: string;
  progress: { label: string; percent: number };
};

export type StudioAction =
  | { type: "text" }
  | { type: "add"; items: StudioItem[]; goReview?: boolean }
  | { type: "remove"; id: string }
  | { type: "move"; id: string; to: number }
  | { type: "select"; id: string }
  | { type: "cover"; id: string; timeMs: number }
  | { type: "replace"; id: string; item: StudioItem }
  | { type: "mode"; mode: StudioMode }
  | { type: "destination"; destination: StudioDestination }
  | { type: "caption"; caption: string }
  | { type: "alt"; id: string; text: string }
  | { type: "captions"; id: string; vtt: string }
  | { type: "tags"; value: string }
  | { type: "saveOriginal"; value: boolean }
  | { type: "progress"; label: string; percent: number }
  | { type: "fail"; message: string }
  | { type: "reset" };

export const initialStudioState = (mode: StudioMode = "capture"): StudioState => ({
  mode,
  items: [],
  activeId: null,
  destination: "moment",
  caption: "",
  tagsInput: "",
  saveOriginalPrivately: false,
  error: "",
  progress: { label: "", percent: 0 },
});

export function studioReducer(state: StudioState, action: StudioAction): StudioState {
  switch (action.type) {
    case "text":
      return { ...state, mode: "review", error: "" };
    case "add": {
      const room = STUDIO_MAX_ITEMS - state.items.length;
      if (room <= 0) return { ...state, error: `Up to ${STUDIO_MAX_ITEMS} items per Moment.` };
      const added = action.items.slice(0, room);
      const items = [...state.items, ...added];
      const trimmed = added.length < action.items.length;
      return {
        ...state,
        items,
        activeId: added.length ? added[added.length - 1].id : state.activeId,
        mode: action.goReview ? "review" : state.mode,
        error: trimmed ? `Kept the first ${STUDIO_MAX_ITEMS} items.` : "",
      };
    }
    case "remove": {
      const items = state.items.filter((item) => item.id !== action.id);
      const activeId = state.activeId === action.id ? items[items.length - 1]?.id ?? null : state.activeId;
      // Deleting the last item returns to the live camera instead of an empty editor.
      return { ...state, items, activeId, mode: items.length === 0 && state.mode !== "capture" ? "capture" : state.mode, error: "" };
    }
    case "move": {
      const from = state.items.findIndex((item) => item.id === action.id);
      if (from < 0 || action.to < 0 || action.to >= state.items.length || from === action.to) return state;
      const items = [...state.items];
      const [moved] = items.splice(from, 1);
      items.splice(action.to, 0, moved);
      return { ...state, items };
    }
    case "select":
      return state.items.some((item) => item.id === action.id) ? { ...state, activeId: action.id } : state;
    case "cover":
      return { ...state, items: state.items.map((item) => (item.id === action.id ? { ...item, coverTimeMs: Math.max(0, action.timeMs) } : item)) };
    case "replace": {
      // Used by trim/reset: same slot, new identity (the object-URL cache is keyed by id).
      const index = state.items.findIndex((item) => item.id === action.id);
      if (index < 0) return state;
      const items = [...state.items];
      items[index] = action.item;
      return { ...state, items, activeId: state.activeId === action.id ? action.item.id : state.activeId, error: "" };
    }
    case "mode": {
      if (action.mode === "capture" && !canAddItem(state.items)) return { ...state, error: `Up to ${STUDIO_MAX_ITEMS} items per Moment.` };
      if ((action.mode === "review" || action.mode === "publish") && state.items.length === 0 && !state.caption.trim()) return state;
      return { ...state, mode: action.mode, error: "" };
    }
    case "destination":
      return { ...state, destination: action.destination, error: "" };
    case "caption":
      return { ...state, caption: action.caption.slice(0, 2200) };
    case "alt":
      return { ...state, items: state.items.map((item) => (item.id === action.id ? { ...item, altText: action.text.slice(0, 250) } : item)) };
    case "captions":
      return { ...state, items: state.items.map((item) => (item.id === action.id && item.kind === "video" ? { ...item, captionsVtt: action.vtt.slice(0, 65536) } : item)) };
    case "tags":
      return { ...state, tagsInput: action.value.slice(0, 320) };
    case "saveOriginal":
      return { ...state, saveOriginalPrivately: action.value };
    case "progress":
      return { ...state, progress: { label: action.label, percent: Math.max(0, Math.min(100, Math.round(action.percent))) } };
    case "fail":
      // A failed publish returns to the sheet with every item and caption intact.
      return { ...state, mode: "publish", error: action.message, progress: { label: "", percent: 0 } };
    case "reset":
      return initialStudioState();
    default:
      return state;
  }
}
