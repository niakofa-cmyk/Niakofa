import { ArrowLeft, Bell, MessageCircle, Menu, PenSquare, Search, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { authHeaders } from "@/lib/auth";
import { MessengerAskNia } from "./MessengerAskNia";
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
  onBackToApp,
  onCommunity,
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
  const [activePeople, setActivePeople] = useState<Person[]>(people);
  const [stories, setStories] = useState<Array<{
    user_id: number;
    name: string;
    avatar_url: string | null;
    active_now: boolean;
    stories: Array<{ id: number; body: string | null; media_url: string | null; media_type: string | null; created_at: string | null; expires_at: string | null }>;
  }>>([]);
  const [storyUser, setStoryUser] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [peopleResponse, storiesResponse] = await Promise.all([
        fetch("/api/messages/people", { headers: authHeaders() }),
        fetch("/api/messages/stories", { headers: authHeaders() }),
      ]);
      if (cancelled) return;
      if (peopleResponse.ok) {
        const data = await peopleResponse.json() as { people?: Person[] };
        if (Array.isArray(data.people)) setActivePeople(data.people);
      }
      if (storiesResponse.ok) {
        const data = await storiesResponse.json() as { people?: typeof stories };
        if (Array.isArray(data.people)) setStories(data.people);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);
  const visiblePeople = useMemo(() => {
    if (search.trim()) return searchResults;
    return activePeople;
  }, [activePeople, search, searchResults]);
  const storyPeople = stories.slice(0, 8);

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

      {search.trim().length >= 2 && (
        <MessengerAskNia query={search} onClose={() => onSearchChange("")} />
      )}

      {view === "chats" && (
        <section aria-label="Stories" className="overflow-x-auto px-4 pb-4 pt-5">
          <div className="flex w-max gap-4">
            <button type="button" onClick={onCompose} className="flex w-16 flex-col items-center gap-1.5">
              <span className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-primary/60 bg-primary/10">
                <span className="text-2xl font-light text-primary">+</span>
              </span>
              <span className="max-w-16 truncate text-[11px] font-semibold">Your story</span>
            </button>
            {storyPeople.map((person) => (
              <button key={person.user_id} type="button" onClick={() => setStoryUser(person.user_id)} className="flex w-16 flex-col items-center gap-1.5">
                <span className={`rounded-full p-[2px] ${person.active_now ? "bg-primary" : "bg-border"}`}>
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
              <p className="mt-1 text-sm text-muted-foreground">Search for an approved Niakofa member above. Active people appear first.</p>
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

      {storyUser !== null && (() => {
        const group = stories.find((item) => item.user_id === storyUser);
        if (!group) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5" role="dialog" aria-modal="true" onClick={() => setStoryUser(null)}>
            <div className="w-full max-w-sm rounded-3xl bg-card p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center gap-3">
                <MessageAvatar name={group.name} avatarUrl={group.avatar_url} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="font-black">{group.name}</p>
                  <p className="text-xs text-muted-foreground">{group.active_now ? "Active now" : "Story"}</p>
                </div>
                <button type="button" onClick={() => setStoryUser(null)} className="rounded-full p-2 hover:bg-muted" aria-label="Close Story"><X className="h-5 w-5" /></button>
              </div>
              <div className="mt-5 space-y-3">
                {group.stories.map((story) => (
                  <article key={story.id} className="rounded-2xl bg-muted p-4">
                    {story.media_url && <img src={story.media_url} alt="" className="mb-3 max-h-80 w-full rounded-xl object-cover" />}
                    {story.body && <p className="whitespace-pre-wrap text-sm leading-6">{story.body}</p>}
                    <p className="mt-2 text-[10px] text-muted-foreground">{story.created_at ? formatTime(story.created_at) : ""}</p>
                  </article>
                ))}
              </div>
              <button type="button" onClick={() => { setStoryUser(null); onSelectPerson({ id: group.user_id, name: group.name, avatar_url: group.avatar_url }); }} className="mt-4 w-full rounded-full bg-primary py-3 text-sm font-black text-primary-foreground">Message {group.name}</button>
            </div>
          </div>
        );
      })()}

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
