/**
 * NiaFab.tsx — Enhanced (Round 4)
 *
 * Kill-switch behaviour (controlled by admin toggle via AppContext.niaEnabled):
 *
 *  ENABLED (niaEnabled = true):
 *    - NiaFab renders everywhere EXCEPT the login screen (login has its own Nia hero)
 *    - Orb is draggable: user can move it anywhere on screen
 *    - Position persists across sessions in localStorage
 *    - Full pulse / sparkle animations active
 *
 *  DISABLED (niaEnabled = false):
 *    - NiaFab is completely hidden from ALL screens including login's corner
 *    - Login screen still shows its own hero NiaOrb (separate component, always alive)
 *    - No N orb button appears anywhere in the app
 *    - No drag, no open, nothing
 *
 * The login screen hero orb is NOT controlled by this component — it lives
 * directly in login.tsx and is always visible to greet visitors.
 *
 * Drag feature (when enabled):
 *  - Smooth framer-motion drag with momentum disabled
 *  - Elastic constraint so it snaps back if dragged too far
 *  - Position saved to localStorage ("nia_fab_x", "nia_fab_y")
 *  - Tap vs drag distinguished by elapsed time (<150ms = tap)
 *  - Cursor: grab (idle), grabbing (dragging)
 *  - touchAction: none so pointer events work on mobile during drag
 */

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { NiaOrb } from "./NiaDrawer";

interface NiaFabProps {
  onClick: () => void;
  /** Controlled by admin kill-switch — false = completely hidden */
  enabled?: boolean;
}

const safeRead = (key: string, fallback: number) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : Number(v);
  } catch {
    return fallback;
  }
};

const safeWrite = (key: string, value: number) => {
  try {
    localStorage.setItem(key, String(value));
  } catch {}
};

export function NiaFab({ onClick, enabled = true }: NiaFabProps) {
  // When disabled by admin, render nothing — completely invisible to the user
  if (!enabled) return null;

  return <NiaFabInner onClick={onClick} />;
}

/**
 * Inner component — only mounts when enabled.
 * Separated so hooks are not called when disabled.
 */
function NiaFabInner({ onClick }: { onClick: () => void }) {
  const [fabX, setFabX] = useState(() => safeRead("nia_fab_x", 0));
  const [fabY, setFabY] = useState(() => safeRead("nia_fab_y", 0));
  const [isDragging, setIsDragging] = useState(false);
  const dragStartTime = useRef(0);
  const didDrag = useRef(false);

  const handleDragStart = () => {
    setIsDragging(true);
    didDrag.current = false;
    dragStartTime.current = Date.now();
  };

  const handleDrag = (_: unknown, info: { offset: { x: number; y: number } }) => {
    // Mark as a real drag if the pointer moved more than 6px
    if (Math.abs(info.offset.x) > 6 || Math.abs(info.offset.y) > 6) {
      didDrag.current = true;
    }
  };

  const handleDragEnd = (_: unknown, info: { offset: { x: number; y: number } }) => {
    setIsDragging(false);
    const newX = fabX + info.offset.x;
    const newY = fabY + info.offset.y;
    setFabX(newX);
    setFabY(newY);
    safeWrite("nia_fab_x", newX);
    safeWrite("nia_fab_y", newY);
  };

  const handleClick = () => {
    // Only fire as a tap if it wasn't a real drag
    if (!didDrag.current) {
      onClick();
    }
    didDrag.current = false;
  };

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0.08}
      dragConstraints={{
        // Keep the orb centre always visible on screen
        left: -100,
        right: 100,
        top: -80,
        bottom: 120,
      }}
      animate={{ x: fabX, y: fabY }}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      style={{
        position: "fixed",
        bottom: "1.5rem",
        right: "1.5rem",
        zIndex: 9999,
        cursor: isDragging ? "grabbing" : "grab",
        // Disable native touch scroll during drag so pointer events fire cleanly
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
      aria-label="Open Nia — your community assistant"
    >
      <motion.button
        onClick={handleClick}
        whileHover={!isDragging ? { scale: 1.06 } : {}}
        whileTap={!isDragging ? { scale: 0.93 } : {}}
        style={{
          background: "none",
          border: "none",
          cursor: "inherit",
          padding: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <NiaOrb size={68} pulse />
      </motion.button>
    </motion.div>
  );
}
