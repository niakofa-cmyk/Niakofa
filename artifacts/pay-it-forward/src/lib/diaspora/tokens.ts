/**
 * Shared visual language for Diaspora child pages.
 * Teal represents connection; gold represents legacy; rose and emerald
 * support human stories and growth.
 */
export const diasporaTokens = {
  surface: {
    page: "#071312",
    card: "rgba(255,255,255,0.035)",
    cardHover: "rgba(255,255,255,0.06)",
    border: "rgba(255,255,255,0.10)",
  },
  brand: {
    teal: { solid: "#2dd4bf", soft: "rgba(45,212,191,0.12)", text: "#99f6e4" },
    gold: { solid: "#f59e0b", soft: "rgba(245,158,11,0.12)", text: "#fcd34d" },
    rose: { solid: "#fb7185", soft: "rgba(251,113,133,0.12)", text: "#fda4af" },
    emerald: { solid: "#34d399", soft: "rgba(52,211,153,0.12)", text: "#6ee7b7" },
  },
} as const;

export type DiasporaTokens = typeof diasporaTokens;