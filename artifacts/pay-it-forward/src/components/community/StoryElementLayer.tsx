import type { CSSProperties, ReactNode } from "react";

export type StoryElement = {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  position_x?: number | null;
  position_y?: number | null;
  scale?: number | null;
  rotation?: number | null;
  z_index?: number | null;
};

function positionStyle(element: StoryElement): CSSProperties {
  return {
    position: "absolute",
    left: `${element.position_x ?? 50}%`,
    top: `${element.position_y ?? 50}%`,
    transform: `translate(-50%, -50%) rotate(${element.rotation ?? 0}deg) scale(${element.scale ?? 1})`,
    zIndex: element.z_index ?? 0,
    pointerEvents: "none",
  };
}

export function StoryElementLayer({
  elements,
  className,
}: {
  elements: StoryElement[];
  className?: string;
}) {
  return (
    <div className={className ?? "absolute inset-0 overflow-hidden"}>
      {elements
        .slice()
        .sort((a, b) => (a.z_index ?? 0) - (b.z_index ?? 0))
        .map((element): ReactNode => {
          const payload = element.payload ?? {};
          const style = positionStyle(element);

          if (element.type === "background") {
            const background = typeof payload.color === "string" && /^#[0-9a-f]{6}$/i.test(payload.color)
              ? payload.color
              : "#172554";
            return (
              <div
                key={element.id}
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  background,
                  zIndex: element.z_index ?? 0,
                  pointerEvents: "none",
                }}
              />
            );
          }

          if (element.type === "text") {
            const align = payload.align === "left" || payload.align === "right" ? payload.align : "center";
            return (
              <span
                key={element.id}
                style={{
                  ...style,
                  color: typeof payload.color === "string" ? payload.color : "#ffffff",
                  fontSize: `${Math.max(10, Math.min(120, Number(payload.font_size) || 18))}px`,
                  textAlign: align,
                  maxWidth: "88%",
                  whiteSpace: "pre-wrap",
                }}
                className="font-black drop-shadow-[0_2px_6px_rgba(0,0,0,.65)]"
              >
                {String(payload.text ?? "")}
              </span>
            );
          }

          if (element.type === "sticker") {
            return (
              <span key={element.id} style={{ ...style, fontSize: "3.5rem" }} aria-hidden="true">
                {String(payload.sticker ?? "✨")}
              </span>
            );
          }

          if (element.type === "mention") {
            return (
              <span key={element.id} style={style} className="rounded-full bg-black/60 px-3 py-1 text-sm font-black text-white">
                @{String(payload.display_name ?? "neighbor")}
              </span>
            );
          }

          if (element.type === "music") {
            return (
              <span key={element.id} style={style} className="rounded-full bg-black/55 px-3 py-1.5 text-xs font-bold text-white">
                ♪ {String(payload.track ?? "Original audio")}
              </span>
            );
          }

          return null;
        })}
    </div>
  );
}

export function storyEffectFilter(elements: StoryElement[]): string | undefined {
  const effect = elements.find((item) => item.type === "effect")?.payload?.effect;
  switch (effect) {
    case "warmth":
      return "sepia(.25) saturate(1.25)";
    case "contrast":
      return "contrast(1.2)";
    case "grayscale":
      return "grayscale(1)";
    case "vignette":
      return "contrast(1.05)";
    default:
      return undefined;
  }
}