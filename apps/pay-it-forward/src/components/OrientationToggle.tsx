import type { OrientationMode } from "../hooks/useMapOrientation";

interface Props {
  mode: OrientationMode;
  onToggle: () => void;
}

export function OrientationToggle({ mode, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      title={mode === "heading-up" ? "Switch to North-Up" : "Switch to Heading-Up"}
      style={{
        position: "absolute", bottom: 120, right: 16, zIndex: 40,
        width: 48, height: 48, borderRadius: "50%",
        background: mode === "heading-up"
          ? "rgba(79,195,247,0.95)"
          : "rgba(0,0,0,0.75)",
        border: "2px solid rgba(255,255,255,0.25)",
        backdropFilter: "blur(8px)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        cursor: "pointer", display: "flex",
        alignItems: "center", justifyContent: "center",
        fontSize: 22, transition: "background 0.2s",
      }}
    >
      {mode === "heading-up" ? "🧭" : "⬆"}
    </button>
  );
}
