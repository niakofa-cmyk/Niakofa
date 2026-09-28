import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Loader2, MessageCircle, Search, Users, X } from "lucide-react";
import { authHeaders } from "@/lib/auth";
import { MessageAvatar } from "@/components/messages/MessageAvatar";
import { PeopleDiscoveryView } from "@/components/community/CommunityDiscoveryViews";

type Person = {
  id: number;
  name: string;
  avatar_url: string | null;
};

export function CommunityPeopleView({ hubId }: { hubId: number | null }) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const value = query.trim();
    requestRef.current?.abort();
    setError(null);

    if (value.length < 2) {
      setPeople([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void fetch(`/api/messages/direct/users?q=${encodeURIComponent(value)}`, {
        headers: authHeaders(),
        signal: controller.signal,
      })
        .then(async (response) => {
          const data = await response.json().catch(() => ({})) as { users?: Person[]; error?: string };
          if (!response.ok) throw new Error(data.error || "Could not search approved neighbors.");
          return Array.isArray(data.users) ? data.users : [];
        })
        .then((users) => {
          if (!controller.signal.aborted) setPeople(users);
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted) {
            setPeople([]);
            setError(reason instanceof Error ? reason.message : "Could not search approved neighbors.");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <section aria-label="Community people" className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Users className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Community directory</p>
            <h1 className="mt-1 text-xl font-black">People</h1>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Find approved neighbors by name and start a private conversation. Email addresses stay private.
            </p>
          </div>
        </div>

        <label className="relative mt-5 block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search approved neighbors"
            aria-label="Search approved neighbors"
            className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-10 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear people search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </label>

        <div className="mt-3" aria-live="polite">
          {loading && (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
              Searching approved neighbors…
            </div>
          )}
          {!loading && error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
              {error}
            </div>
          )}
          {!loading && !error && query.trim().length >= 2 && people.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No approved neighbors found. Try a different name.
            </div>
          )}
          {!loading && people.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {people.map((person) => (
                <article key={person.id} className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/60 p-3">
                  <MessageAvatar name={person.name} avatarUrl={person.avatar_url} size={40} />
                  <p className="min-w-0 flex-1 truncate text-sm font-bold">{person.name}</p>
                  <Link
                    href={`/messages?mode=direct&recipientId=${encodeURIComponent(String(person.id))}`}
                    className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground transition hover:bg-primary/90"
                    aria-label={`Message ${person.name}`}
                  >
                    <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    Message
                  </Link>
                </article>
              ))}
            </div>
          )}
          {!query.trim() && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Search with at least two characters to find an approved neighbor.
            </p>
          )}
        </div>
      </div>

      {hubId !== null && !query.trim() && (
        <PeopleDiscoveryView hubId={hubId} />
      )}
    </section>
  );
}