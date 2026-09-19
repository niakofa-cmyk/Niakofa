import { Search } from "lucide-react";
import type { UnifiedConversation } from "@/lib/unifiedConversation";
import { ConversationListItem } from "./ConversationListItem";
import { MessageAvatar } from "./MessageAvatar";

type Person = { id: number; name: string; avatar_url: string | null };
type MessageSearchResult = { conversation_id: number; message_id: number; sender_id: number; sender_name: string; sender_avatar: string | null; body: string; created_at: string | null; peer?: Person };

export function ConversationList({
  items,
  selectedKey,
  search,
  searchResults,
  messageSearchResults,
  onSearchChange,
  onSelect,
  onSelectPerson,
  onCompose,
  emptyLabel,
}: {
  items: UnifiedConversation[];
  selectedKey: string | null;
  search: string;
  searchResults: Person[];
  messageSearchResults: MessageSearchResult[];
  onSearchChange: (value: string) => void;
  onSelect: (item: UnifiedConversation) => void;
  onSelectPerson?: (person: Person) => void;
  onCompose?: () => void;
  emptyLabel: string;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col bg-card lg:border-r lg:border-border">
      <div className="border-b border-border p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Inbox</p>
            <h2 className="text-base font-black">Conversations</h2>
          </div>
          {onCompose && (
            <button type="button" onClick={onCompose} data-testid="button-new-message-list" className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl bg-primary/10 text-primary hover:bg-primary/15" aria-label="New message">
              <span className="text-xl leading-none">+</span>
            </button>
          )}
        </div>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <input data-testid="input-message-search" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search conversations…" aria-label="Search messages or people" className="min-h-11 w-full rounded-2xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
        </label>
        {(searchResults.length > 0 || messageSearchResults.length > 0) && (
          <div className="mt-2 max-h-80 space-y-3 overflow-y-auto rounded-2xl border border-border bg-background p-2">
            {searchResults.length > 0 && onSelectPerson && (
              <div>
                <p className="px-2 pb-1 text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">People</p>
                <div className="space-y-0.5">
                  {searchResults.map((person) => (
                    <button key={person.id} type="button" onClick={() => onSelectPerson(person)} data-testid={`button-message-person-${person.id}`} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-muted">
                      <MessageAvatar name={person.name} avatarUrl={person.avatar_url} size={36} />
                      <span className="min-w-0 flex-1 truncate text-sm font-bold">{person.name}</span>
                      <span className="text-[9px] font-black text-primary">Message</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messageSearchResults.length > 0 && (
              <div>
                <p className="px-2 pb-1 text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">Messages</p>
                <div className="space-y-0.5">
                  {messageSearchResults.map((result) => (
                    <button key={`${result.conversation_id}-${result.message_id}`} type="button" onClick={() => onSelect(result.conversation_id)} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-muted">
                      <MessageAvatar name={result.peer?.name || result.sender_name} avatarUrl={result.peer?.avatar_url || result.sender_avatar} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-black">{result.peer?.name || result.sender_name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{result.body}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
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