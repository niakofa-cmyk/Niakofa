/**
 * Shared Diaspora visual language.
 * Keep the palette semantic: teal = connection, gold = legacy,
 * rose = human story, emerald = family growth.
 */
export const diasporaTheme = {
  page: "bg-[#071312] text-white",
  panel: "border-white/10 bg-white/[0.035]",
  teal: {
    text: "text-teal-300",
    soft: "bg-teal-300/10",
    border: "border-teal-300/20",
  },
  gold: {
    text: "text-amber-300",
    soft: "bg-amber-300/10",
    border: "border-amber-300/20",
  },
  rose: {
    text: "text-rose-300",
    soft: "bg-rose-300/10",
    border: "border-rose-300/20",
  },
  emerald: {
    text: "text-emerald-300",
    soft: "bg-emerald-300/10",
    border: "border-emerald-300/20",
  },
  focus: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50",
  radius: "rounded-2xl",
} as const;
