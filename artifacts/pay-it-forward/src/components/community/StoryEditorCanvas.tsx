import { Redo2, RotateCw, Shrink, Trash2, Undo2, ZoomIn } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type EditableStoryElement = {
  id: string | number;
  type: "text" | "sticker" | "mention" | "music";
  payload: Record<string, unknown>;
  position_x: number;
  position_y: number;
  scale: number;
  rotation: number;
  z_index: number;
};

type HistoryState = EditableStoryElement[][];
type DragState = {
  id: string | number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  before: EditableStoryElement[];
  moved: boolean;
};

const EDITABLE_TYPES = new Set<EditableStoryElement["type"]>(["text", "sticker", "mention", "music"]);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clone(elements: EditableStoryElement[]): EditableStoryElement[] {
  return elements.map((element) => ({ ...element, payload: { ...element.payload } }));
}

function elementLabel(element: EditableStoryElement) {
  return element.type === "sticker"
    ? String(element.payload.sticker ?? "sticker")
    : element.type === "music"
      ? String(element.payload.track ?? "music")
      : element.type === "mention"
        ? `@${String(element.payload.display_name ?? "neighbor")}`
        : String(element.payload.text ?? "text");
}

/**
 * Interactive Story overlay. Position values remain normalized 0..100 so the
 * persisted Story schema is independent of the preview viewport.
 */
export function StoryEditorCanvas({
  elements,
  onChange,
  className,
}: {
  elements: EditableStoryElement[];
  onChange: (elements: EditableStoryElement[]) => void;
  className?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [past, setPast] = useState<HistoryState>([]);
  const [future, setFuture] = useState<HistoryState>([]);
  const dragRef = useRef<DragState | null>(null);
  const selected = useMemo(
    () => elements.find((element) => element.id === selectedId) ?? null,
    [elements, selectedId],
  );

  const commit = useCallback(
    (next: EditableStoryElement[]) => {
      setPast((current) => [...current.slice(-19), clone(elements)]);
      setFuture([]);
      onChange(clone(next));
    },
    [elements, onChange],
  );

  const updateSelected = useCallback(
    (patch: Partial<EditableStoryElement>) => {
      if (selectedId === null) return;
      commit(elements.map((element) => (element.id === selectedId ? { ...element, ...patch } : element)));
    },
    [commit, elements, selectedId],
  );

  const undo = useCallback(() => {
    const previous = past.at(-1);
    if (!previous) return;
    setPast((current) => current.slice(0, -1));
    setFuture((current) => [clone(elements), ...current.slice(0, 19)]);
    onChange(clone(previous));
    setSelectedId(null);
  }, [elements, onChange, past]);

  const redo = useCallback(() => {
    const next = future[0];
    if (!next) return;
    setFuture((current) => current.slice(1));
    setPast((current) => [...current.slice(-19), clone(elements)]);
    onChange(clone(next));
    setSelectedId(null);
  }, [elements, future, onChange]);

  const beginDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, element: EditableStoryElement) => {
      const canvas = event.currentTarget.parentElement;
      if (!canvas) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        id: element.id,
        startX: event.clientX,
        startY: event.clientY,
        originX: element.position_x,
        originY: element.position_y,
        before: clone(elements),
        moved: false,
      };
      setSelectedId(element.id);
    },
    [elements],
  );

  const moveDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      const rect = event.currentTarget.parentElement?.getBoundingClientRect();
      if (!drag || !rect || rect.width <= 0 || rect.height <= 0) return;
      const dx = ((event.clientX - drag.startX) / rect.width) * 100;
      const dy = ((event.clientY - drag.startY) / rect.height) * 100;
      if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) drag.moved = true;
      onChange(elements.map((element) => element.id === drag.id
        ? {
            ...element,
            position_x: clamp(drag.originX + dx, 2, 98),
            position_y: clamp(drag.originY + dy, 2, 98),
          }
        : element));
    },
    [elements, onChange],
  );

  const endDrag = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (drag.moved) {
      setPast((current) => [...current.slice(-19), drag.before]);
      setFuture([]);
    }
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key === "Escape") setSelectedId(null);
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId !== null) {
        event.preventDefault();
        commit(elements.filter((element) => element.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commit, elements, redo, selectedId, undo]);

  return (
    <div
      className={className ?? "relative aspect-[9/16] w-full overflow-hidden rounded-3xl bg-black"}
      data-testid="story-editor"
      aria-label="Story editor"
    >
      <div
        className="relative h-full w-full touch-none select-none overflow-hidden"
        onPointerDown={() => setSelectedId(null)}
      >
        {elements
          .filter((element) => EDITABLE_TYPES.has(element.type))
          .slice()
          .sort((a, b) => a.z_index - b.z_index)
          .map((element) => {
            const isSelected = element.id === selectedId;
            const text = elementLabel(element);
            return (
              <div
                key={element.id}
                role="button"
                tabIndex={0}
                aria-label={`Edit ${element.type}`}
                onPointerDown={(event) => beginDrag(event, element)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                className={`absolute max-w-[88%] cursor-move rounded-xl px-2 py-1 ${
                  isSelected ? "ring-2 ring-white ring-offset-2 ring-offset-black/40" : ""
                }`}
                style={{
                  left: `${element.position_x}%`,
                  top: `${element.position_y}%`,
                  transform: `translate(-50%, -50%) rotate(${element.rotation}deg) scale(${element.scale})`,
                  zIndex: element.z_index,
                  color: String(element.payload.color ?? "#fff"),
                  fontSize: element.type === "sticker" ? "3.5rem" : `${Number(element.payload.font_size) || 20}px`,
                  background: element.type === "mention" || element.type === "music" ? "rgba(0,0,0,.55)" : undefined,
                  whiteSpace: "pre-wrap",
                  textAlign: element.payload.align === "left" || element.payload.align === "right"
                    ? element.payload.align
                    : "center",
                }}
              >
                {text}
              </div>
            );
          })}
      </div>
      {selected && (
        <div
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/10 bg-black/85 p-1.5 text-white backdrop-blur"
          onPointerDown={(event) => event.stopPropagation()}
          aria-label={`Controls for ${selected.type}`}
        >
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10" onClick={() => updateSelected({ scale: clamp(selected.scale - 0.1, 0.5, 3) })} aria-label="Shrink Story element">
            <Shrink className="h-4 w-4" />
          </button>
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10" onClick={() => updateSelected({ scale: clamp(selected.scale + 0.1, 0.5, 3) })} aria-label="Grow Story element">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10" onClick={() => updateSelected({ rotation: ((selected.rotation + 15 + 180) % 360) - 180 })} aria-label="Rotate Story element">
            <RotateCw className="h-4 w-4" />
          </button>
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10" onClick={() => { commit(elements.filter((element) => element.id !== selected.id)); setSelectedId(null); }} aria-label="Delete Story element">
            <Trash2 className="h-4 w-4" />
          </button>
          <span className="mx-1 h-6 w-px bg-white/10" />
          <button type="button" disabled={!past.length} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10 disabled:opacity-30" onClick={undo} aria-label="Undo Story edit">
            <Undo2 className="h-4 w-4" />
          </button>
          <button type="button" disabled={!future.length} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10 disabled:opacity-30" onClick={redo} aria-label="Redo Story edit">
            <Redo2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}