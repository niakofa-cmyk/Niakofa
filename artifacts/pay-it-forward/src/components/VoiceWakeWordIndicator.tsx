// ============================================================
// VoiceWakeWordIndicator Component
// Visual feedback when Nia is listening for wake words
// ============================================================

import { motion } from "framer-motion";

interface VoiceWakeWordIndicatorProps {
  listeningState: "idle" | "listening" | "processing";
  error?: string | null;
}

export function VoiceWakeWordIndicator({
  listeningState,
  error,
}: VoiceWakeWordIndicatorProps) {
  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          background: "rgba(239, 68, 68, 0.1)",
          border: "0.5px solid rgb(239, 68, 68)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "rgb(239, 68, 68)",
          }}
        />
        <span
          style={{
            fontSize: 12,
            color: "rgb(239, 68, 68)",
            fontWeight: 500,
          }}
        >
          Mic access needed
        </span>
      </motion.div>
    );
  }

  if (listeningState === "idle") {
    return null;
  }

  if (listeningState === "listening") {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          background: "rgba(29, 158, 117, 0.1)",
          border: "0.5px solid rgb(29, 158, 117)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <motion.div
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "rgb(29, 158, 117)",
          }}
        />
        <span
          style={{
            fontSize: 12,
            color: "var(--color-text-secondary)",
            fontWeight: 500,
          }}
        >
          Listening for "Hey Nia"…
        </span>
      </motion.div>
    );
  }

  if (listeningState === "processing") {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          background: "rgba(168, 85, 247, 0.1)",
          border: "0.5px solid rgb(168, 85, 247)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            border: "1.5px solid rgb(168, 85, 247)",
            borderTopColor: "transparent",
          }}
        />
        <span
          style={{
            fontSize: 12,
            color: "var(--color-text-secondary)",
            fontWeight: 500,
          }}
        >
          Wake word detected… responding
        </span>
      </motion.div>
    );
  }

  return null;
}

/**
 * Floating microphone pulse indicator
 * Shows when voice listening is active
 */
export function VoicePulseIndicator({
  active = false,
}: {
  active?: boolean;
}) {
  if (!active) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        width: 14,
        height: 14,
        borderRadius: "50%",
        background: "rgb(29, 158, 117)",
        zIndex: 9999,
      }}
    >
      <motion.div
        animate={{ scale: [1, 1.8, 1], opacity: [1, 0.3, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
        style={{
          position: "absolute",
          inset: -6,
          borderRadius: "50%",
          border: "1.5px solid rgb(29, 158, 117)",
          pointerEvents: "none",
        }}
      />
    </motion.div>
  );
}
