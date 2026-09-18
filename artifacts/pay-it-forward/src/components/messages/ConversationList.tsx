import { Search } from "lucide-react";
import type { UnifiedConversation } from "@/lib/unifiedConversation";
import { ConversationListItem } from "./ConversationListItem";
import { MessageAvatar } from "./MessageAvatar";

type Person = { id: number; name: string; avatar_url: string | null };

export function ConversationList({
  items,
  selectedKey,
  search,
  searchResults,
  onSearchChange,
  onSelect,
  onSelectPerson,
  emptyLabel,
}: {
  items: UnifiedConversation[];
  selectedKey: string | null;
  search: string;
  searchResults: Person[];
  onSearchChange: (value: string) => void;
  onSelect: (item: UnifiedConversation) => void;
  onSelectPerson?: (person: Person) => void;
  emptyLabel: string;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col bg-card lg:border-r lg:border-border">
      <div className="border-b border-border p-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search messages or people" aria-label="Search messages or people" className="min-h-11 w-full rounded-2xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
        </label>
        {searchResults.length > 0 && onSelectPerson && (
          <div className="mt-2 max-h-44 space-y-0.5 overflow-y-auto rounded-2xl border border-border bg-background p-1">
            {searchResults.map((person) => (
              <button key={person.id} type="button" onClick={() => onSelectPerson(person)} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-muted">
                <MessageAvatar name={person.name} avatarUrl={person.avatar_url} size={36} />
                <span className="text-sm font-bold">{person.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? <p className="p-6 text-center text-xs text-muted-foreground">{emptyLabel}</p> : items.map((item) => (
          <ConversationListItem key={item.key} item={item} selected={item.key === selectedKey} onSelect={() => onSelect(item)} />
        ))}
      </div>
    </section>
  );
}