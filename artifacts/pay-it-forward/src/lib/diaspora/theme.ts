/**
 * Shared Diaspora visual language.
 * Semantic colors keep the experience warm and recognizable without
 * turning every page into a different product.
 * teal = connection, gold = legacy, rose = human story, emerald = family growth.
 */
export const diasporaTheme = {
  page: "bg-[#071312] text-white",
  pageGlow: "bg-[radial-gradient(circle_at_80%_0%,rgba(45,212,191,0.16),transparent_32%),radial-gradient(circle_at_8%_18%,rgba(245,158,11,0.12),transparent_30%)]",
  panel: "border-white/10 bg-white/[0.035] backdrop-blur-sm",
  panelStrong: "border-white/10 bg-[#0b1917]/90 backdrop-blur-xl",
  teal: { text: "text-teal-300", soft: "bg-teal-300/10", border: "border-teal-300/20", ring: "ring-teal-300/30" },
  gold: { text: "text-amber-300", soft: "bg-amber-300/10", border: "border-amber-300/20", ring: "ring-amber-300/30" },
  rose: { text: "text-rose-300", soft: "bg-rose-300/10", border: "border-rose-300/20", ring: "ring-rose-300/30" },
  emerald: { text: "text-emerald-300", soft: "bg-emerald-300/10", border: "border-emerald-300/20", ring: "ring-emerald-300/30" },
  focus: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50",
  interactive: "transition duration-200 hover:-translate-y-0.5 hover:bg-white/[0.06] active:translate-y-0",
  radius: "rounded-2xl",
  radiusHero: "rounded-[2rem]",
  shadow: "shadow-[0_24px_80px_rgba(0,0,0,0.22)]",
} as const;

export type DiasporaTone = keyof Pick<typeof diasporaTheme, "teal" | "gold" | "rose" | "emerald">;
