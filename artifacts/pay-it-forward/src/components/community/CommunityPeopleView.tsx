import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { LockKeyhole, MessageCircle, Search, X } from "lucide-react";
import { authHeaders } from "@/lib/auth";
import { MessageAvatar } from "@/components/messages/MessageAvatar";
import { PeopleDiscoveryView } from "@/components/community/CommunityDiscoveryViews";
import "@/components/community/CommunityHomeView.css";

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
  const [retryKey, setRetryKey] = useState(0);
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
  }, [query, retryKey]);

  return (
    <section aria-label="Community people" className="nia-people">
      <header className="nia-people__hero">
        <p className="nia-people__eyebrow">Niakofa · Community</p>
        <h1 className="nia-people__title">People</h1>
        <p className="nia-people__lede">
          Find approved neighbors and begin a private conversation. No connection status—just a way to say hello.
        </p>
        <label className="nia-people__search">
          <Search className="nia-people__search-icon h-4 w-4" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people by name"
            aria-label="Search approved neighbors by name"
            className="nia-people__input"
            data-testid="input-community-people-search"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear people search"
              className="nia-people__clear"
              data-testid="button-clear-people-search"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </label>
        <p className="nia-people__privacy"><LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" /> Only approved neighbors appear in direct-message search. Email addresses stay private.</p>
      </header>

      <div className="mt-3" aria-live="polite">
          {loading && (
            <div className="nia-people__results" role="status" aria-label="Searching approved neighbors">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="nia-people__person" aria-hidden="true">
                  <div className="h-10 w-10 animate-pulse rounded-full bg-[#edf1f4]" />
                  <div className="h-3 w-32 animate-pulse rounded bg-[#edf1f4]" />
                </div>
              ))}
            </div>
          )}
          {!loading && error && (
            <div className="nia-people__result-box" role="alert">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => setRetryKey((value) => value + 1)}
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-xl border border-[#e8b99f] bg-white px-4 font-bold text-[#a94f25] transition hover:bg-[#fff3eb]"
                data-testid="button-retry-people-search"
              >
                Try search again
              </button>
            </div>
          )}
          {!loading && !error && query.trim().length >= 2 && people.length === 0 && (
            <div className="nia-people__result-box">
              No approved neighbors found for that search. Try another name.
            </div>
          )}
          {!loading && people.length > 0 && (
            <div className="nia-people__results">
              {people.map((person) => (
                <article key={person.id} className="nia-people__person" data-testid={`card-approved-neighbor-${person.id}`}>
                  <MessageAvatar name={person.name} avatarUrl={person.avatar_url} size={40} />
                  <p className="nia-people__person-name" data-testid={`text-neighbor-name-${person.id}`}>{person.name}</p>
                  <Link
                    href={`/messages?mode=direct&recipientId=${encodeURIComponent(String(person.id))}`}
                    className="nia-people__message"
                    aria-label={`Message ${person.name}`}
                    data-testid={`link-message-neighbor-${person.id}`}
                  >
                    <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    Message
                  </Link>
                </article>
              ))}
            </div>
          )}
          {!query.trim() && (
            <p className="nia-people__status">Search with at least two characters to find an approved neighbor.</p>
          )}
      </div>

      {hubId !== null && !query.trim() && (
        <div className="nia-people__discovery">
          <PeopleDiscoveryView hubId={hubId} />
        </div>
      )}
    </section>
  );
}