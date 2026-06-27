import { useState } from "react";

interface NiaFabProps {
  onClick: () => void;
  isOpen: boolean;
}

export function NiaFab({ onClick, isOpen }: NiaFabProps) {
  const [pressed, setPressed] = useState(false);

  return (
    <>
      {/* ─── LAYER 1: Far outer aura — breathes in/out ─── */}
      <div
        style={{
          position: "fixed",
          bottom: "calc(1.5rem + 60px + 18px)",
          right: "1.5rem",
          width: 96,
          height: 96,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 70%)",
          animation: "nia-aura-breathe 3.8s ease-in-out infinite",
          pointerEvents: "none",
          zIndex: 9997,
          transform: "translate(calc(50% - 30px), calc(50% - 30px))",
        }}
      />

      {/* ─── LAYER 2: Heartbeat ring — pulses at 2.2s ─── */}
      <div
        style={{
          position: "fixed",
          bottom: "calc(1.5rem + 60px + 10px)",
          right: "1.5rem",
          width: 80,
          height: 80,
          borderRadius: "50%",
          border: "2px solid rgba(167,139,250,0.45)",
          animation: "nia-ring-pulse 2.2s ease-in-out infinite",
          pointerEvents: "none",
          zIndex: 9997,
          transform: "translate(calc(50% - 30px), calc(50% - 30px))",
        }}
      />

      {/* ─── LAYER 3: Secondary slower ring — 3.2s ─── */}
      <div
        style={{
          position: "fixed",
          bottom: "calc(1.5rem + 60px + 4px)",
          right: "1.5rem",
          width: 68,
          height: 68,
          borderRadius: "50%",
          border: "1.5px solid rgba(196,181,253,0.3)",
          animation: "nia-ring-pulse 3.2s ease-in-out infinite 0.6s",
          pointerEvents: "none",
          zIndex: 9997,
          transform: "translate(calc(50% - 30px), calc(50% - 30px))",
        }}
      />

      {/* ─── LAYER 4: Main orb body ─── */}
      <button
        onClick={onClick}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        aria-label={isOpen ? "Close Nia" : "Chat with Nia"}
        style={{
          position: "fixed",
          bottom: "1.5rem",
          right: "1.5rem",
          width: 60,
          height: 60,
          borderRadius: "50%",
          border: "none",
          cursor: "pointer",
          zIndex: 9999,
          overflow: "hidden",
          boxShadow: pressed
            ? "0 2px 12px rgba(109,40,217,0.55), 0 0 0 3px rgba(167,139,250,0.4)"
            : "0 6px 24px rgba(109,40,217,0.55), 0 0 0 2px rgba(167,139,250,0.25), inset 0 1px 0 rgba(255,255,255,0.2)",
          background: isOpen
            ? "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)"
            : "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 50%, #4f46e5 100%)",
          animation: isOpen ? "none" : "nia-orb-bob 3s ease-in-out infinite",
          transform: pressed ? "scale(0.93)" : "scale(1)",
          transition: "transform 0.1s ease, box-shadow 0.15s ease",
        }}
      >
        {/* Rotating conic shimmer */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background:
              "conic-gradient(from 0deg, transparent 0%, rgba(255,255,255,0.15) 25%, transparent 50%, rgba(255,255,255,0.08) 75%, transparent 100%)",
            animation: "nia-shimmer-spin 4s linear infinite",
          }}
        />
        {/* Glint highlight */}
        <div
          style={{
            position: "absolute",
            top: 6,
            left: 10,
            width: 18,
            height: 8,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.35)",
            filter: "blur(2px)",
            pointerEvents: "none",
          }}
        />
        {/* Animated glowing N */}
        <span
          style={{
            position: "relative",
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            fontSize: 26,
            fontWeight: 700,
            fontFamily: "Georgia, serif",
            color: "rgba(255,255,255,0.97)",
            textShadow: "0 0 10px rgba(255,255,255,0.6), 0 1px 3px rgba(0,0,0,0.3)",
            letterSpacing: "-1px",
            animation: isOpen ? "none" : "nia-n-glow 2.8s ease-in-out infinite",
          }}
        >
          N
        </span>
      </button>

      {/* ─── LAYER 5: 5 orbiting sparkle particles ─── */}
      {[0, 72, 144, 216, 288].map((deg, i) => (
        <div
          key={deg}
          style={{
            position: "fixed",
            bottom: "calc(1.5rem + 30px)",
            right: "calc(1.5rem + 30px)",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: i % 2 === 0 ? "#c4b5fd" : "#a78bfa",
            boxShadow: "0 0 6px 2px rgba(167,139,250,0.7)",
            pointerEvents: "none",
            zIndex: 9998,
            animation: `nia-sparkle-orbit-${i} ${2.4 + i * 0.18}s linear infinite ${i * 0.28}s`,
          }}
        />
      ))}

      {/* ─── Keyframes ─── */}
      <style>{`
        @keyframes nia-orb-bob {
          0%, 100% { transform: translateY(0px) scale(1); }
          50%       { transform: translateY(-5px) scale(1.02); }
        }
        @keyframes nia-aura-breathe {
          0%, 100% { opacity: 0.6; transform: translate(calc(50% - 30px), calc(50% - 30px)) scale(1); }
          50%       { opacity: 1;   transform: translate(calc(50% - 30px), calc(50% - 30px)) scale(1.18); }
        }
        @keyframes nia-ring-pulse {
          0%, 100% { opacity: 0.4; transform: translate(calc(50% - 30px), calc(50% - 30px)) scale(1); }
          50%       { opacity: 0.9; transform: translate(calc(50% - 30px), calc(50% - 30px)) scale(1.12); }
        }
        @keyframes nia-shimmer-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes nia-n-glow {
          0%, 100% { text-shadow: 0 0 10px rgba(255,255,255,0.5), 0 1px 3px rgba(0,0,0,0.3); }
          50%       { text-shadow: 0 0 20px rgba(255,255,255,0.95), 0 0 40px rgba(196,181,253,0.7), 0 1px 3px rgba(0,0,0,0.3); }
        }
        ${[0,1,2,3,4].map((i) => {
          const baseDeg = i * 72;
          const r = 34;
          return `
            @keyframes nia-sparkle-orbit-${i} {
              0%   { transform: rotate(${baseDeg}deg) translateX(${r}px) rotate(-${baseDeg}deg) scale(0.7); opacity: 0.3; }
              25%  { opacity: 1; transform: rotate(${baseDeg + 90}deg) translateX(${r}px) rotate(-${baseDeg + 90}deg) scale(1.1); }
              50%  { transform: rotate(${baseDeg + 180}deg) translateX(${r}px) rotate(-${baseDeg + 180}deg) scale(0.8); opacity: 0.5; }
              75%  { opacity: 1; transform: rotate(${baseDeg + 270}deg) translateX(${r}px) rotate(-${baseDeg + 270}deg) scale(1.15); }
              100% { transform: rotate(${baseDeg + 360}deg) translateX(${r}px) rotate(-${baseDeg + 360}deg) scale(0.7); opacity: 0.3; }
            }
          `;
        }).join("")}
      `}</style>
    </>
  );
}
