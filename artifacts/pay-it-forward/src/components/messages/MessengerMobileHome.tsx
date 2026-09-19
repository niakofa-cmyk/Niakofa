import { ArrowLeft, MessageCircle, Menu, PenSquare, Search, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import type { UnifiedConversation } from "@/lib/unifiedConversation";
import { MessageAvatar } from "./MessageAvatar";

type Person = { id: number; name: string; avatar_url: string | null };

function formatTime(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function preview(item: UnifiedConversation): string {
  if (item.lastMessage?.trim()) return item.lastMessage;
  if (item.kind === "request") return "Request conversation";
  if (item.kind === "hub") return "Hub conversation";
  return "Start a conversation";
}

export function MessengerMobileHome({
  items,
  people,
  searchResults,
  search,
  onSearchChange,
  onSelect,
  onSelectPerson,
  onCompose,
  onNotifications,
  onMenu,
}: {
  items: UnifiedConversation[];
  people: Person[];
  searchResults: Person[];
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (item: UnifiedConversation) => void;
  onSelectPerson: (person: Person) => void;
  onCompose: () => void;
  onNotifications: () => void;
  onMenu: () => void;
  onBackToApp: () => void;
  onCommunity: () => void;
}) {
  const [view, setView] = useState<"chats" | "people">("chats");
  const visiblePeople = useMemo(() => {
    if (search.trim()) return searchResults;
    return people;
  }, [people, search, searchResults]);
  const storyPeople = people.slice(0, 8);

  return (
    <main className="min-h-[100dvh] bg-background text-foreground pb-[5.5rem]">
      <header className="px-4 pb-2 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" onClick={onBackToApp} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-muted" aria-label="Back to Niakofa app" title="Back to Niakofa app">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="truncate text-[2rem] font-black tracking-[-0.04em]">Messages</h1>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={onCompose} className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted" aria-label="New message" title="New message">
              <PenSquare className="h-6 w-6" />
            </button>
            <button type="button" onClick={onCommunity} className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted" aria-label="Open Niakofa Community" title="Open Niakofa Community">
              <UsersRound className="h-6 w-6" />
            </button>
          </div>
        </div>
        <label className="relative mt-3 block">
          <Search className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Ask Nia or search"
            aria-label="Ask Nia or search messages"
            className="min-h-12 w-full rounded-full border-0 bg-muted px-12 text-base outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
          />
        </label>
      </header>

      {view === "chats" && (
        <section aria-label="People" className="overflow-x-auto px-4 pb-4 pt-5">
          <div className="flex w-max gap-4">
            <button type="button" onClick={onCompose} className="flex w-16 flex-col items-center gap-1.5">
              <span className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-primary/60 bg-primary/10">
                <span className="text-2xl font-light text-primary">+</span>
              </span>
              <span className="max-w-16 truncate text-[11px] font-semibold">Your story</span>
            </button>
            {storyPeople.map((person, index) => (
              <button key={person.id} type="button" onClick={() => onSelectPerson(person)} className="flex w-16 flex-col items-center gap-1.5">
                <span className={`rounded-full p-[2px] ${index < 4 ? "bg-primary" : "bg-border"}`}>
                  <MessageAvatar name={person.name} avatarUrl={person.avatar_url} size={56} />
                </span>
                <span className="max-w-16 truncate text-[11px] font-semibold">{person.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section aria-label={view === "chats" ? "Messages" : "People"} className="px-2">
        {view === "people" ? (
          visiblePeople.length ? visiblePeople.map((person) => (
            <button key={person.id} type="button" onClick={() => onSelectPerson(person)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left active:bg-muted">
              <MessageAvatar name={person.name} avatarUrl={person.avatar_url} size={56} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-bold">{person.name}</span>
                <span className="block truncate text-sm text-muted-foreground">Start a direct conversation</span>
              </span>
            </button>
          )) : (
            <div className="px-6 py-16 text-center">
              <UsersRound className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-base font-black">No people found</p>
              <p className="mt-1 text-sm text-muted-foreground">Search for an approved Niakofa member above.</p>
            </div>
          )
        ) : items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <MessageCircle className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-base font-black">No messages yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Start a conversation with an approved Niakofa member.</p>
            <button type="button" onClick={onCompose} className="mt-5 rounded-full bg-primary px-5 py-3 text-sm font-black text-primary-foreground">New message</button>
          </div>
        ) : (
          items.map((item) => (
            <button key={item.key} type="button" onClick={() => onSelect(item)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left active:bg-muted">
              <MessageAvatar name={item.title} avatarUrl={item.avatarUrl} size={56} />
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[16px] ${item.unreadCount > 0 ? "font-black" : "font-bold"}`}>{item.title}</span>
                <span className={`mt-0.5 block truncate text-sm ${item.unreadCount > 0 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{preview(item)}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-2 self-stretch pt-1">
                <span className="text-xs text-muted-foreground">{formatTime(item.timestamp)}</span>
                {item.unreadCount > 0 && <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-label={`${item.unreadCount} unread`} />}
              </span>
            </button>
          ))
        )}
      </section>

      <nav aria-label="Messages navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-2 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur-xl">
        <div className="flex items-center justify-around">
          <button type="button" onClick={() => setView("chats")} className={`flex min-h-16 min-w-16 flex-col items-center justify-center gap-1 ${view === "chats" ? "text-primary" : "text-muted-foreground"}`} aria-current={view === "chats" ? "page" : undefined}>
            <MessageCircle className="h-6 w-6" />
            <span className="text-[11px] font-bold">Chats</span>
          </button>
          <button type="button" onClick={() => setView("people")} className={`flex min-h-16 min-w-16 flex-col items-center justify-center gap-1 ${view === "people" ? "text-primary" : "text-muted-foreground"}`}>
            <UsersRound className="h-6 w-6" />
            <span className="text-[11px] font-bold">People</span>
          </button>
          <button type="button" onClick={onNotifications} className="flex min-h-16 min-w-16 flex-col items-center justify-center gap-1 text-muted-foreground">
            <Bell className="h-6 w-6" />
            <span className="text-[11px] font-bold">Notifications</span>
          </button>
          <button type="button" onClick={onMenu} className="flex min-h-16 min-w-16 flex-col items-center justify-center gap-1 text-muted-foreground">
            <Menu className="h-6 w-6" />
            <span className="text-[11px] font-bold">Menu</span>
          </button>
        </div>
      </nav>
    </main>
  );
}
