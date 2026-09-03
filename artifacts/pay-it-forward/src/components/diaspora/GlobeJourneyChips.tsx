import { BookOpen, Dna, FileSearch, Mic, TreePine, Users } from "lucide-react";

const CHIPS = [
  { label: "Family", href: "/diaspora/family", icon: Users, tone: "border-emerald-300/20 bg-emerald-300/10 text-emerald-200" },
  { label: "Oral history", href: "/diaspora/family?intent=oral-history", icon: Mic, tone: "border-rose-300/20 bg-rose-300/10 text-rose-200" },
  { label: "Tree", href: "/diaspora/tree", icon: TreePine, tone: "border-teal-300/20 bg-teal-300/10 text-teal-200" },
  { label: "Research", href: "/diaspora/research", icon: FileSearch, tone: "border-amber-300/20 bg-amber-300/10 text-amber-200" },
  { label: "DNA", href: "/diaspora/dna", icon: Dna, tone: "border-rose-300/20 bg-rose-300/10 text-rose-200" },
  { label: "Legacy", href: "/diaspora/timeline", icon: BookOpen, tone: "border-amber-300/20 bg-amber-300/10 text-amber-100" },
] as const;

export function GlobeJourneyChips({ navigate }: { navigate: (href: string) => void }) {
  return (
    <nav aria-label="Diaspora journey" className="flex flex-wrap gap-2">
      {CHIPS.map((chip) => {
        const Icon = chip.icon;
        return (
          <button
            key={chip.href}
            type="button"
            onClick={() => navigate(chip.href)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors hover:brightness-110 ${chip.tone}`}
          >
            <Icon className="h-3 w-3" />
            {chip.label}
          </button>
        );
      })}
    </nav>
  );
}