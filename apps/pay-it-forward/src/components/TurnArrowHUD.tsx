import type { RouteStep } from "@workspace/api-zod";

interface Props {
  step: RouteStep | null;
  distanceToTurn: number;
}

export function TurnArrowHUD({ step, distanceToTurn }: Props) {
  if (!step || distanceToTurn > 400) return null;

  const arrow = maneuverArrow(step.maneuver_type, step.maneuver_direction);
  const distText =
    distanceToTurn < 50
      ? "Now"
      : distanceToTurn < 1000
      ? `${Math.round(distanceToTurn)} m`
      : `${(distanceToTurn / 1609.34).toFixed(1)} mi`;

  return (
    <div style={{
      position: "absolute", top: 16, left: 16, zIndex: 40,
      background: "rgba(0,0,0,0.82)", backdropFilter: "blur(12px)",
      borderRadius: 16, padding: "12px 18px",
      display: "flex", alignItems: "center", gap: 14,
      boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
      minWidth: 220, maxWidth: 320,
    }}>
      <span style={{ fontSize: 44, lineHeight: 1, userSelect: "none" }}>
        {arrow}
      </span>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{
          fontSize: 13, fontWeight: 700, letterSpacing: 1, marginBottom: 2,
          color: distanceToTurn < 80 ? "#ff6b6b" : "#4fc3f7",
        }}>
          {distText}
        </div>
        <div style={{
          fontSize: 15, fontWeight: 600, color: "#fff",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {step.instruction}
        </div>
        {step.maneuver_type && (
          <div style={{
            marginTop: 4, fontSize: 10, fontWeight: 600,
            letterSpacing: 0.8, color: "#aaa", textTransform: "uppercase",
          }}>
            {step.maneuver_type}{step.maneuver_direction ? ` · ${step.maneuver_direction}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

function maneuverArrow(type?: string | null, direction?: string | null): string {
  if (!type || type === "depart") return "⬆️";
  if (type === "arrive") return "📍";
  if (type === "roundabout" || type === "rotary") return "🔄";
  if (type === "fork") {
    if (direction === "left" || direction === "slight left") return "↖️";
    if (direction === "right" || direction === "slight right") return "↗️";
    return "⬆️";
  }
  if (type === "merge") return "🔀";
  const d = direction ?? "";
  if (d === "uturn") return "↩️";
  if (d === "sharp left") return "↰";
  if (d === "left") return "⬅️";
  if (d === "slight left") return "↖️";
  if (d === "straight") return "⬆️";
  if (d === "slight right") return "↗️";
  if (d === "right") return "➡️";
  if (d === "sharp right") return "↱";
  return "⬆️";
}
