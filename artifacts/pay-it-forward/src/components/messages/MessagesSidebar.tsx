import { PenSquare } from "lucide-react";
import type { MessageMode } from "@/lib/messageRoutes";
import { MessageTypeTabs } from "./MessageTypeTabs";
import { MessageAvatar } from "./MessageAvatar";

type Person = { id: number; name: string; avatar_url: string | null };

export function MessagesSidebar({
  activeMode,
  counts,
  people,
  onModeChange,
  onCompose,
  onSelectPerson,
}: {
  activeMode: MessageMode;
  counts?: { all: number; direct: number; requests: number; hubs: number };
  people?: Person[];
  onModeChange: (mode: MessageMode) => void;
  onCompose?: () => void;
  onSelectPerson?: (person: Person) => void;
}) {
  return (
    <aside className="hidden h-full min-h-0 w-56 shrink-0 flex-col border-r border-border bg-card xl:flex">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-lg font-black">Messages</h2>
        {onCompose && (
          <button type="button" onClick={onCompose} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl bg-primary/10 text-primary hover:bg-primary/15" aria-label="New message">
            <PenSquare className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="p-3">
        <MessageTypeTabs active={activeMode} counts={counts} onChange={onModeChange} orientation="vertical" />
      </div>
      {people && people.length > 0 && (
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border p-3">
          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">People</p>
          <div className="space-y-1">
            {people.map((person) => (
              <button key={person.id} type="button" onClick={() => onSelectPerson?.(person)} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left hover:bg-muted">
                <MessageAvatar name={person.name} avatarUrl={person.avatar_url} size={32} />
                <span className="truncate text-sm font-bold">{person.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}