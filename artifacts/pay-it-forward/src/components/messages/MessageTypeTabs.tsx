import { Inbox, MessageCircle, Radio, Users } from "lucide-react";
import type { MessageMode } from "@/lib/messageRoutes";
import { UnreadBadge } from "./UnreadBadge";

type Counts = { all: number; direct: number; requests: number; hubs: number };
const tabs: Array<{ mode: MessageMode; label: string; icon: React.ReactNode }> = [
  { mode: "all", label: "All", icon: <Inbox className="h-4 w-4" /> },
  { mode: "direct", label: "Direct", icon: <MessageCircle className="h-4 w-4" /> },
  { mode: "requests", label: "Requests", icon: <Users className="h-4 w-4" /> },
  { mode: "hub", label: "Hubs", icon: <Radio className="h-4 w-4" /> },
];

export function MessageTypeTabs({
  active,
  counts,
  onChange,
  orientation = "horizontal",
}: {
  active: MessageMode;
  counts?: Partial<Counts>;
  onChange: (mode: MessageMode) => void;
  orientation?: "horizontal" | "vertical";
}) {
  const vertical = orientation === "vertical";
  return (
    <nav className={vertical ? "flex flex-col gap-1" : "flex gap-2 overflow-x-auto pb-1"} aria-label="Message types">
      {tabs.map((tab) => {
        const count = counts?.[tab.mode === "hub" ? "hubs" : tab.mode] ?? 0;
        const selected = active === tab.mode;
        return (
          <button
            key={tab.mode}
            type="button"
            onClick={() => onChange(tab.mode)}
            className={`flex min-h-11 shrink-0 items-center gap-2 rounded-2xl border px-4 text-sm font-bold transition-colors ${
              selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"
            } ${vertical ? "w-full justify-between" : ""}`}
          >
            <span className="inline-flex items-center gap-2">{tab.icon}{tab.label}</span>
            <UnreadBadge count={count} />
          </button>
        );
      })}
    </nav>
  );
}