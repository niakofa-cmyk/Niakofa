export const DIASPORA_JOURNEY = [
  { key: "globe", label: "Globe", href: "/diaspora/heritage/globe", tone: "teal" },
  { key: "family", label: "Family", href: "/diaspora/family", tone: "emerald" },
  { key: "stories", label: "Stories", href: "/diaspora/family?intent=oral-history", tone: "rose" },
  { key: "tree", label: "Tree", href: "/diaspora/tree", tone: "emerald" },
  { key: "research", label: "Research", href: "/diaspora/research", tone: "teal" },
  { key: "connections", label: "Connections", href: "/diaspora/dna", tone: "gold" },
  { key: "heritage", label: "Heritage", href: "/diaspora/heritage", tone: "teal" },
  { key: "legacy", label: "Legacy", href: "/diaspora/timeline", tone: "gold" },
] as const;

export type DiasporaJourneyKey = (typeof DIASPORA_JOURNEY)[number]["key"];

export function isDiasporaJourneyKey(value: string): value is DiasporaJourneyKey {
  return DIASPORA_JOURNEY.some((item) => item.key === value);
}
