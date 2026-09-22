import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Loader2, Mic } from "lucide-react";
import { useLocation } from "wouter";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { diasporaTheme } from "@/lib/diaspora/theme";

type Story = {
  id: number;
  title: string | null;
  text_content: string | null;
  audio_url: string | null;
  original_language: string;
  hub_id: number | null;
  hub_location: string | null;
  published_at: string | null;
};

function languageLabel(value: string) {
  return ({ en: "English", es: "Español", fr: "Français", pt: "Português", ht: "Kreyòl", sw: "Kiswahili", yo: "Yorùbá", tw: "Twi" } as Record<string, string>)[value] ?? value.toUpperCase();
}

export default function DiasporaStoriesPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const params = new URLSearchParams(window.location.search);
  const hubId = Number(params.get("hub"));
  const hubName = params.get("hubName");

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    fetch("/api/griot/stories?limit=50", { headers: authHeaders() })
      .then(async (response) => {
        if (!response.ok) throw new Error("Stories are temporarily unavailable.");
        return response.json() as Promise<{ stories?: Story[] }>;
      })
      .then((data) => {
        if (!cancelled) setStories(Array.isArray(data.stories) ? data.stories : []);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Stories are temporarily unavailable.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [currentUser]);

  const visibleStories = useMemo(() => {
    if (Number.isSafeInteger(hubId) && hubId > 0) return stories.filter((story) => story.hub_id === hubId);
    if (hubName?.trim()) return stories.filter((story) => story.hub_location?.trim().toLowerCase() === hubName.trim().toLowerCase());
    return stories;
  }, [stories, hubId, hubName]);

  if (!currentUser) return null;
  return (
    <div className={`${diasporaTheme.page} min-h-screen p-4 pb-24 sm:p-6 lg:pb-8`}>
      <main className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-start gap-3">
          <button type="button" onClick={() => navigate(diasporaHubHrefFromSearch())} aria-label="Back to Diaspora Globe" className={`mt-1 rounded-xl border border-white/10 p-2 text-white/65 hover:bg-white/10 ${diasporaTheme.focus}`}><ArrowLeft className="h-4 w-4" /></button>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-200/70">Diaspora</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Stories{hubName ? ` from ${hubName}` : ""}</h1>
            <p className="mt-2 text-sm leading-relaxed text-white/55">Published family and community stories connected to the selected Hub.</p>
          </div>
        </header>
        {error && <p role="alert" className="mb-4 rounded-xl border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">{error}</p>}
        {loading ? <div className="flex items-center gap-2 py-16 text-sm text-white/50"><Loader2 className="h-4 w-4 animate-spin" /> Loading stories…</div> :
          visibleStories.length === 0 ? <div className={`${diasporaTheme.panelStrong} ${diasporaTheme.radius} border p-8 text-center`}><BookOpen className="mx-auto h-8 w-8 text-rose-200/50" /><h2 className="mt-3 text-lg font-black">No published stories yet</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/45">This Hub does not have a published story in the current view. You can preserve a family story from the Hub context.</p><button type="button" onClick={() => navigate(`/diaspora/family?intent=oral-history${Number.isSafeInteger(hubId) && hubId > 0 ? `&hubId=${hubId}` : ""}`)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-rose-200 px-4 py-2.5 text-sm font-black text-[#071312]"><Mic className="h-4 w-4" /> Record a story</button></div> :
          <div className="grid gap-4 md:grid-cols-2">{visibleStories.map((story) => <article key={story.id} className={`${diasporaTheme.panelStrong} ${diasporaTheme.radius} border p-5`}><div className="flex items-start gap-3"><div className="rounded-xl border border-rose-300/20 bg-rose-300/10 p-2"><BookOpen className="h-4 w-4 text-rose-200" /></div><div className="min-w-0"><h2 className="font-black text-white">{story.title || "Untitled family story"}</h2><p className="mt-1 text-xs text-white/40">{languageLabel(story.original_language)} · {story.hub_location || "Diaspora"}</p></div></div>{story.text_content && <p className="mt-4 line-clamp-5 text-sm leading-7 text-white/70">{story.text_content}</p>}{story.audio_url && <audio className="mt-4 w-full" controls preload="none" src={story.audio_url} />}</article>)}</div>}
      </main>
    </div>
  );
}

function diasporaHubHrefFromSearch() {
  const params = new URLSearchParams(window.location.search);
  const hub = params.get("hub");
  const hubName = params.get("hubName");
  return hub ? `/diaspora?hub=${encodeURIComponent(hub)}` : hubName ? `/diaspora?hubName=${encodeURIComponent(hubName)}` : "/diaspora";
}