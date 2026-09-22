/** Marker meanings for the Diaspora Globe. */
export const GLOBE_MARKER_LEGEND = [
  { key: "home", label: "Home hub", swatchClassName: "border-amber-300 bg-amber-300/30" },
  { key: "diaspora", label: "Diaspora hub", swatchClassName: "border-teal-300 bg-teal-300/25" },
  { key: "crisis", label: "Crisis alert", swatchClassName: "border-rose-300 bg-rose-300/30" },
] as const;

export type GlobeLegendEntry = (typeof GLOBE_MARKER_LEGEND)[number];