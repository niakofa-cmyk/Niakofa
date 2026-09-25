import { useEffect, useRef, useState } from "react";
import { Loader2, Search, Send, X } from "lucide-react";
import { MessageAvatar } from "@/components/messages/MessageAvatar";
import { authHeaders } from "@/lib/auth";
import { sendStoryContextMessage, shareStory } from "@/lib/community-story-client";
import { trackCommunityContent } from "@/lib/communityMediaAnalytics";

type Person = { id: number; name: string; avatar_url: string | null };

export function StoryShareSheet({
  storyId,
  onClose,
}: {
  storyId: number;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [message, setMessage] = useState("");
  const [sendingTo, setSendingTo] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const value = query.trim();
    searchRequest.current?.abort();
    if (value.length < 2) {
      setPeople([]);
      return;
    }
    const controller = new AbortController();
    searchRequest.current = controller;
    const timer = window.setTimeout(() => {
      void fetch(`/api/messages/direct/users?q=${encodeURIComponent(value)}`, {
        headers: authHeaders(),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) return [];
          const data = await response.json().catch(() => ({})) as { users?: Person[] };
          return Array.isArray(data.users) ? data.users : [];
        })
        .then((users) => {
          if (!controller.signal.aborted) setPeople(users);
        })
        .catch(() => {});
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function send(person: Person) {
    if (sendingTo !== null) return;
    setSendingTo(person.id);
    setError(null);
    try {
      await sendStoryContextMessage({ recipientId: person.id, storyId, body: message });
      await shareStory(storyId);
      trackCommunityContent("community_spark_shared", { spark_id: storyId });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not share the Spark.");
    } finally {
      setSendingTo(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Send Spark">
      <div className="w-full max-w-md rounded-3xl border border-border bg-background p-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Community Spark</p>
            <h2 className="mt-1 font-black">Share this Spark</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-muted" aria-label="Close Spark share sheet">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a neighbor"
            className="min-h-11 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary"
            autoFocus
          />
        </div>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Add a message (optional)"
          className="mt-2 w-full resize-none rounded-xl border border-border bg-card p-3 text-sm outline-none focus:border-primary"
        />
        {error && <p role="alert" className="mt-2 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
        <div className="mt-3 max-h-64 overflow-y-auto">
          {query.trim().length >= 2 && !people.length && <p className="px-3 py-4 text-center text-xs text-muted-foreground">No approved neighbors found.</p>}
          {people.map((person) => (
            <button
              key={person.id}
              type="button"
              disabled={sendingTo !== null}
              onClick={() => void send(person)}
              className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-muted disabled:opacity-50"
            >
              <MessageAvatar name={person.name} avatarUrl={person.avatar_url} size={36} />
              <span className="min-w-0 flex-1 truncate font-bold">{person.name}</span>
              {sendingTo === person.id ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Send className="h-4 w-4 text-muted-foreground" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}