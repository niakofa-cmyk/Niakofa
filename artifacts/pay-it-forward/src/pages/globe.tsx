import { useEffect, useMemo, useState } from "react";
import Map, { Layer, Marker, Source } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { ArrowLeft, BookOpen, Globe2, MapPin, Mic, Pause, Play, Users, Volume2 } from "lucide-react";
import { useLocation } from "wouter";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { diasporaTheme } from "@/lib/diaspora/theme";

type Hub = { id: number; name: string; region: string; lat: number; lng: number; tag: string; story_count: number; member_count: number; is_crisis: boolean; crisis_message: string | null };
type Story = { id: number; title: string | null; text_content: string | null; audio_url: string | null; original_language: string; hub_location: string | null; lat: number | null; lng: number | null; duration_seconds: number | null; published_at: string | null };
const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
const fallbackHome = { lat: 32.75, lng: -97.33 };

function arcs(hubs: Hub[]) {
  const home = hubs.find(h => h.tag === "home") ?? fallbackHome;
  return { type: "FeatureCollection" as const, features: hubs.filter(h => h.tag !== "home").map(h => ({ type: "Feature" as const, properties: { id: h.id }, geometry: { type: "LineString" as const, coordinates: [[home.lng, home.lat], [h.lng, h.lat]] } })) };
}

export default function GlobePage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [selectedHub, setSelectedHub] = useState<Hub | null>(null);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    (async () => { try {
      const [h, s] = await Promise.all([fetch("/api/griot/hubs", { headers: authHeaders() }), fetch("/api/griot/stories?limit=40", { headers: authHeaders() })]);
      if (h.ok) { const data = await h.json(); setHubs(data.hubs ?? []); }
      if (s.ok) { const data = await s.json(); setStories(data.stories ?? []); }
    } finally { setLoading(false); } })();
    return () => { audio?.pause(); };
  }, [currentUser]);

  function playStory(story: Story) {
    if (!story.audio_url) return;
    audio?.pause();
    const next = new Audio(story.audio_url);
    next.onended = () => setPlaying(false);
    next.play().then(() => { setAudio(next); setPlaying(true); }).catch(() => setPlaying(false));
  }
  function toggleStory(story: Story) {
    if (audio && selectedStory?.id === story.id && playing) { audio.pause(); setPlaying(false); return; }
    playStory(story);
  }
  const visibleStories = useMemo(() => selectedHub ? stories.filter(s => s.hub_location === selectedHub.name || (s.lat != null && s.lng != null && Math.abs(s.lat - selectedHub.lat) < 2 && Math.abs(s.lng - selectedHub.lng) < 2)) : stories, [stories, selectedHub]);
  const totalStories = hubs.reduce((n, h) => n + (h.story_count || 0), 0);
  const totalMembers = hubs.reduce((n, h) => n + (h.member_count || 0), 0);

  if (!currentUser) return <div className="min-h-screen flex items-center justify-center">Sign in to enter the Diaspora Globe.</div>;
  if (!token) return <div className={`${diasporaTheme.page} min-h-screen p-6`}><button onClick={() => navigate("/diaspora")} className="mb-6 flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> Diaspora</button><div className="max-w-xl mx-auto p-6 rounded-2xl border border-amber-300/20 bg-amber-300/10"><h1 className="font-bold text-xl">Globe needs a Mapbox token</h1><p className="text-sm text-white/60 mt-2">Set VITE_MAPBOX_TOKEN in the web app environment to enable the interactive globe.</p></div></div>;

  return <div className={`${diasporaTheme.page} min-h-screen pb-20`}>
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#071312]/85 backdrop-blur-xl"><div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3"><button onClick={() => navigate("/diaspora")} className={`p-2 rounded-xl ${diasporaTheme.focus}`}><ArrowLeft className="w-5 h-5" /></button><div className="flex-1"><p className="font-semibold flex items-center gap-2"><Globe2 className="w-4 h-4 text-teal-300" /> Diaspora Globe</p><p className="text-xs text-white/45">A living map of family stories and community memory</p></div><button onClick={() => navigate("/diaspora/family?intent=oral-history")} className="hidden sm:flex items-center gap-2 rounded-xl bg-rose-300/10 text-rose-200 border border-rose-300/20 px-3 py-2 text-xs"><Mic className="w-3 h-3" /> Record a story</button></div></header>
    <main className="max-w-7xl mx-auto px-4 pt-5 space-y-5">
      <section className={`${diasporaTheme.radiusHero} overflow-hidden border border-teal-300/20 bg-gradient-to-br from-teal-300/10 via-[#071312] to-amber-300/10 ${diasporaTheme.shadow}`}><div className="p-6 md:p-8"><div className="max-w-3xl"><p className="text-xs uppercase tracking-[0.22em] text-teal-300">Globe → Family → Stories</p><h1 className="text-3xl md:text-5xl font-bold mt-2 leading-tight">See where your family's memory lives.</h1><p className="text-sm md:text-base text-white/60 mt-3">Move from a place on the map into the people, voices, heritage, research, and Legacy stories connected to it.</p></div><div className="flex flex-wrap gap-3 mt-6"><div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10"><p className="text-lg font-bold">{hubs.length}</p><p className="text-[11px] text-white/45">living hubs</p></div><div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10"><p className="text-lg font-bold">{totalStories}</p><p className="text-[11px] text-white/45">hub stories</p></div><div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10"><p className="text-lg font-bold">{totalMembers}</p><p className="text-[11px] text-white/45">hub members*</p></div></div></div>
        <div className="h-[52vh] min-h-[430px] relative"><Map initialViewState={{ longitude: -20, latitude: 18, zoom: 1.35 }} projection="globe" mapStyle="mapbox://styles/mapbox/dark-v11" mapboxAccessToken={token} attributionControl={false} fog={{ color: "rgb(7,19,18)", "high-color": "rgb(7,19,18)", "horizon-blend": 0.08 }}><Source id="diaspora-arcs" type="geojson" data={arcs(hubs)}><Layer id="diaspora-arc-lines" type="line" paint={{ "line-color": "#f59e0b", "line-opacity": 0.28, "line-width": 1.4, "line-dasharray": [2, 2] }} /></Source>{hubs.map(h => <Marker key={h.id} longitude={h.lng} latitude={h.lat} anchor="center"><button onClick={() => { setSelectedHub(h); setSelectedStory(null); }} className={`relative group w-9 h-9 rounded-full border-2 ${h.is_crisis ? "border-rose-300 bg-rose-300/30" : h.tag === "home" ? "border-amber-300 bg-amber-300/30" : "border-teal-300 bg-teal-300/25"} shadow-lg`} title={h.name}><span className="absolute inset-1 rounded-full border border-white/30 animate-pulse" /></button></Marker>)}</Map><div className="absolute left-4 bottom-4 px-3 py-2 rounded-xl bg-[#071312]/85 border border-white/10 text-[11px] text-white/55">*Hub members are a hub-level count, not guaranteed unique people across hubs.</div></div></section>

      <section className="grid lg:grid-cols-[320px_1fr] gap-5"><aside className={`${diasporaTheme.panel} ${diasporaTheme.radius} p-4`}><div className="flex items-center justify-between"><h2 className="font-semibold">Places in the story</h2><span className="text-xs text-white/40">{hubs.length}</span></div><div className="space-y-2 mt-3">{hubs.map(h => <button key={h.id} onClick={() => setSelectedHub(h)} className={`w-full text-left rounded-xl border p-3 ${selectedHub?.id === h.id ? "border-teal-300/30 bg-teal-300/10" : "border-white/10 bg-white/[0.025]"}`}><div className="flex items-start gap-3"><MapPin className="w-4 h-4 text-teal-300 mt-0.5" /><div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{h.name}</p><p className="text-xs text-white/45">{h.region}</p><div className="flex gap-3 mt-2 text-[10px] text-white/45"><span>{h.story_count} stories</span><span>{h.member_count} members</span></div></div></div></button>)}</div></aside>
        <div className={`${diasporaTheme.panel} ${diasporaTheme.radius} p-4`}><div className="flex items-center justify-between"><div><h2 className="font-semibold">Voices from the map</h2><p className="text-xs text-white/45">{selectedHub ? selectedHub.name : "Across the diaspora"}</p></div><button onClick={() => navigate("/diaspora/heritage/globe")} className="text-xs text-teal-300">Refresh view</button></div><div className="grid md:grid-cols-2 gap-3 mt-4">{visibleStories.slice(0, 8).map(s => <article key={s.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><div className="flex gap-3"><div className="w-10 h-10 rounded-full bg-rose-300/10 border border-rose-300/20 flex items-center justify-center"><BookOpen className="w-4 h-4 text-rose-300" /></div><div className="flex-1 min-w-0"><h3 className="font-medium text-sm line-clamp-2">{s.title || "Untitled family story"}</h3><p className="text-[11px] text-white/40 mt-1">{s.original_language.toUpperCase()} · {s.hub_location || "Diaspora"}</p>{s.text_content && <p className="text-xs text-white/55 mt-2 line-clamp-3">{s.text_content}</p>}{s.audio_url && <button onClick={() => { setSelectedStory(s); toggleStory(s); }} className="mt-3 inline-flex items-center gap-2 text-xs text-teal-300"><span className="w-7 h-7 rounded-full bg-teal-300/10 flex items-center justify-center">{selectedStory?.id === s.id && playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}</span><Volume2 className="w-3 h-3" /> {selectedStory?.id === s.id && playing ? "Playing" : "Listen"}</button>}</div></div></article>)}{!visibleStories.length && <div className="md:col-span-2 text-sm text-white/45 py-8 text-center">No published stories are attached to this place yet. Be the first to record one.</div>}</div></div></section>
      <section className="grid sm:grid-cols-3 gap-3"><button onClick={() => navigate("/diaspora/family")} className="p-4 rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-left"><Users className="w-5 h-5 text-emerald-300" /><p className="font-semibold mt-3">Family</p><p className="text-xs text-white/45 mt-1">Open the people behind the places.</p></button><button onClick={() => navigate("/diaspora/research")} className="p-4 rounded-xl border border-amber-300/20 bg-amber-300/10 text-left"><BookOpen className="w-5 h-5 text-amber-300" /><p className="font-semibold mt-3">Research</p><p className="text-xs text-white/45 mt-1">Turn clues into a reviewable proof chain.</p></button><button onClick={() => navigate("/diaspora/dna")} className="p-4 rounded-xl border border-rose-300/20 bg-rose-300/10 text-left"><Globe2 className="w-5 h-5 text-rose-300" /><p className="font-semibold mt-3">Connections</p><p className="text-xs text-white/45 mt-1">Review consented DNA signals with genealogy evidence.</p></button></section>
    </main>
  </div>;
}
