/**
 * Diaspora Dashboard — refreshed brand experience
 * Route: /diaspora
 *
 * Design direction:
 * - Niakofa teal + gold are the anchor colors.
 * - The Diaspora Globe is the visual doorway into the ecosystem.
 * - Family preservation is the primary action.
 * - DNA is presented as a connection flow, never as fabricated user data.
 * - Mobile-first, with a calm editorial rhythm and progressive disclosure.
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, BookHeart, Clock3, Dna, Globe2, GraduationCap, History, Layers3, Loader2, Map, MessageSquare, Mic, Search, Sparkles, TreePine, Users } from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "sonner";

interface DashboardStats {
  family_spaces: number;
  vault_items: number;
  oral_histories: number;
  family_tree_people: number;
  dna_connections?: number | null;
  heritage_collections?: number | null;
}

interface ActivityItem {
  type: string;
  title: string;
  time: string;
  family_id: number;
  memory_id?: number;
}

const NAV_ITEMS = [
  { label: "Home", icon: Sparkles, href: "/diaspora" },
  { label: "Family", icon: Users, href: "/diaspora/family" },
  { label: "Tree", icon: TreePine, href: "/diaspora/tree" },
  { label: "Globe", icon: Globe2, href: "/diaspora/heritage/globe" },
  { label: "Research", icon: GraduationCap, href: "/diaspora/research" },
  { label: "Legacy", icon: History, href: "/diaspora/timeline" },
] as const;

const QUICK_ACTIONS = [
  { label: "Family Spaces", description: "Bring your people together.", icon: Users, href: "/diaspora/family", className: "border-amber-400/25 bg-amber-400/10 text-amber-300" },
  { label: "Family Tree", description: "Connect the generations.", icon: TreePine, href: "/diaspora/tree", className: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" },
  { label: "Oral History", description: "Capture a voice while you can.", icon: Mic, href: "/diaspora/family", className: "border-rose-400/25 bg-rose-400/10 text-rose-300" },
  { label: "Heritage", description: "Explore stories and culture.", icon: Layers3, href: "/diaspora/heritage", className: "border-teal-400/25 bg-teal-400/10 text-teal-300" },
] as const;

function relativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Recently";
  const seconds = Math.max(0, (Date.now() - timestamp) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function StatCard({ value, label, icon: Icon, onClick, accent }: { value: number; label: string; icon: typeof Users; onClick: () => void; accent: string }) {
  return (
    <button onClick={onClick} className="group rounded-2xl border border-border bg-card/80 p-3.5 text-left transition-transform active:scale-[0.98]">
      <div className="flex items-center justify-between gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${accent}`}><Icon className="h-4 w-4" /></span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      <p className="mt-3 text-xl font-bold tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{label}</p>
    </button>
  );
}

export default function DiasporaDashboardPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [niaMessage, setNiaMessage] = useState("");
  const [niaInput, setNiaInput] = useState("");
  const [niaLoading, setNiaLoading] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [dashboardRes, activityRes] = await Promise.all([
          fetch("/api/diaspora/dashboard", { headers: authHeaders() }),
          fetch("/api/diaspora/activity", { headers: authHeaders() }),
        ]);
        if (!dashboardRes.ok) throw new Error("dashboard");
        const dashboard = await dashboardRes.json();
        if (!cancelled) {
          setStats(dashboard.stats ?? null);
          if (activityRes.ok) {
            const activityData = await activityRes.json();
            setActivity(activityData.activities ?? []);
          }
        }
      } catch {
        if (!cancelled) toast.error("Couldn't load your Diaspora Dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [currentUser]);

  async function askNia(message = niaInput) {
    const prompt = message.trim();
    if (!prompt || niaLoading) return;
    setNiaLoading(true);
    setNiaInput("");
    try {
      const response = await fetch("/api/nia/chat", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      if (!response.ok) throw new Error("Nia unavailable");
      const data = (await response.json()) as { reply?: string; response?: string; message?: string };
      setNiaMessage(data.reply ?? data.response ?? data.message ?? "Nia didn't respond.");
    } catch {
      setNiaMessage("Nia is unavailable right now. Please try again in a moment.");
    } finally {
      setNiaLoading(false);
    }
  }

  if (!currentUser) {
    return <div className="flex min-h-screen items-center justify-center bg-background px-6"><p className="text-sm text-muted-foreground">Sign in to access your Diaspora Dashboard.</p></div>;
  }

  const userRecord = currentUser as unknown as Record<string, unknown>;
  const displayName = (userRecord.display_name as string | undefined) ?? (userRecord.username as string | undefined) ?? "Friend";
  const locale = (userRecord.city as string | undefined) ?? (userRecord.locale as string | undefined);

  return (
    <div className="min-h-screen bg-[#071312] pb-28 text-foreground">
      <header className="relative overflow-hidden border-b border-teal-400/15">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(45,212,191,0.18),transparent_34%),radial-gradient(circle_at_15%_90%,rgba(245,158,11,0.14),transparent_38%)]" />
        <div className="relative mx-auto max-w-2xl px-4 pb-7 pt-8">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-300/80">Niakofa Diaspora</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-white">Welcome back, {displayName}</h1>
              <p className="mt-1 text-xs text-teal-100/60">{locale ? `Your story connects ${locale} to generations beyond.` : "Your story connects family, culture, and generations beyond."}</p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-300/10 shadow-[0_0_32px_rgba(245,158,11,0.12)]"><BookHeart className="h-6 w-6 text-amber-300" /></div>
          </div>
          <button onClick={() => navigate("/diaspora/family")} className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-left backdrop-blur"><Search className="h-4 w-4 text-teal-300/70" /><span className="text-sm text-white/45">Search memories, people, places…</span><ArrowRight className="ml-auto h-4 w-4 text-white/30" /></button>
          <div className="mt-4 grid grid-cols-4 gap-2">
            <StatCard value={stats?.family_spaces ?? 0} label="Family spaces" icon={Users} onClick={() => navigate("/diaspora/family")} accent="bg-amber-400/10 text-amber-300" />
            <StatCard value={stats?.vault_items ?? 0} label="Vault items" icon={BookHeart} onClick={() => navigate("/diaspora/family")} accent="bg-teal-400/10 text-teal-300" />
            <StatCard value={stats?.oral_histories ?? 0} label="Oral histories" icon={Mic} onClick={() => navigate("/diaspora/family")} accent="bg-rose-400/10 text-rose-300" />
            <StatCard value={stats?.family_tree_people ?? 0} label="People in trees" icon={TreePine} onClick={() => navigate("/diaspora/tree")} accent="bg-emerald-400/10 text-emerald-300" />
          </div>
        </div>
      </header>

      <nav className="sticky top-0 z-30 border-b border-white/10 bg-[#071312]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl gap-1 overflow-x-auto px-2 py-2 [scrollbar-width:none]">
          {NAV_ITEMS.map((item) => { const Icon = item.icon; const active = item.href === "/diaspora"; return <button key={item.href} onClick={() => navigate(item.href)} className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${active ? "bg-amber-300/10 text-amber-300" : "text-white/50 hover:bg-white/5 hover:text-white"}`}><Icon className="h-3.5 w-3.5" />{item.label}</button>; })}
        </div>
      </nav>

      <main className="mx-auto max-w-2xl space-y-7 px-4 pt-6">
        <section>
          <div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-300/70">Your world, connected</p><h2 className="mt-1 text-lg font-bold text-white">Diaspora Globe</h2></div><button onClick={() => navigate("/diaspora/heritage/globe")} className="flex items-center gap-1 text-xs font-semibold text-teal-300">Explore <ArrowRight className="h-3.5 w-3.5" /></button></div>
          <button onClick={() => navigate("/diaspora/heritage/globe")} className="group relative w-full overflow-hidden rounded-3xl border border-teal-300/20 bg-gradient-to-br from-[#0a2d2a] via-[#083b38] to-[#0b1d1c] p-5 text-left shadow-[0_18px_60px_rgba(13,148,136,0.12)]">
            <div className="absolute -right-10 -top-14 h-48 w-48 rounded-full border border-teal-200/15 bg-teal-200/5 shadow-[0_0_80px_rgba(45,212,191,0.12)]" /><div className="absolute right-8 top-7 h-32 w-32 rounded-full border border-amber-300/20"><span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300 shadow-[0_0_18px_rgba(245,158,11,0.9)]" /></div>
            <div className="relative flex min-h-44 flex-col justify-between"><div className="max-w-[70%]"><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-teal-200/20 bg-teal-200/10"><Globe2 className="h-6 w-6 text-teal-200" /></div><h3 className="text-xl font-black text-white">From homeland to home base.</h3><p className="mt-2 text-sm leading-relaxed text-teal-50/65">Explore diaspora hubs, migration routes, Griot stories, and communities connected through Niakofa.</p></div><div className="mt-5 flex flex-wrap gap-2"><span className="rounded-full border border-teal-200/15 bg-teal-200/10 px-3 py-1.5 text-[11px] font-semibold text-teal-100/80"><Map className="mr-1 inline h-3 w-3" /> Migration routes</span><span className="rounded-full border border-amber-200/15 bg-amber-200/10 px-3 py-1.5 text-[11px] font-semibold text-amber-100/80"><Mic className="mr-1 inline h-3 w-3" /> Griot stories</span><span className="rounded-full border border-emerald-200/15 bg-emerald-200/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-100/80"><Users className="mr-1 inline h-3 w-3" /> Communities</span></div></div>
          </button>
        </section>

        <section><div className="mb-3"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/70">Preserve + connect</p><h2 className="mt-1 text-lg font-bold text-white">Start with what matters.</h2></div><div className="grid grid-cols-2 gap-2.5">{QUICK_ACTIONS.map((action) => { const Icon = action.icon; return <button key={action.label} onClick={() => navigate(action.href)} className={`rounded-2xl border p-4 text-left transition-transform active:scale-[0.98] ${action.className}`}><Icon className="h-5 w-5" /><p className="mt-3 text-sm font-bold">{action.label}</p><p className="mt-1 text-[11px] leading-relaxed text-white/45">{action.description}</p></button>; })}</div></section>

        <section><div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-300/70">Your family story</p><h2 className="mt-1 text-lg font-bold text-white">Recent activity</h2></div><button onClick={() => navigate("/diaspora/family")} className="text-xs font-semibold text-teal-300">View vault</button></div>{loading ? <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] py-10"><Loader2 className="h-5 w-5 animate-spin text-teal-300" /></div> : activity.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-6 text-center"><Clock3 className="mx-auto h-8 w-8 text-white/20" /><p className="mt-3 text-sm font-semibold text-white/70">Your story starts here.</p><p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-white/40">Add a photo, document, or oral history to begin building a family record that can travel across generations.</p><button onClick={() => navigate("/diaspora/family")} className="mt-4 rounded-xl bg-amber-300 px-4 py-2 text-xs font-bold text-[#201600]">Preserve a memory</button></div> : <div className="space-y-2">{activity.slice(0, 5).map((item) => <button key={`${item.family_id}-${item.memory_id ?? item.time}-${item.title}`} onClick={() => item.memory_id ? navigate(`/family/${item.family_id}/memory/${item.memory_id}`) : navigate(`/diaspora/vault/${item.family_id}`)} className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3.5 text-left transition-colors hover:bg-white/[0.06]"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-300/10">{item.type === "oral_history" ? <Mic className="h-4 w-4 text-rose-300" /> : <BookHeart className="h-4 w-4 text-teal-300" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white/85">{item.title}</span><span className="mt-0.5 block text-[11px] text-white/35">{relativeTime(item.time)}</span></span><ArrowRight className="h-4 w-4 text-white/20" /></button>)}</div>}</section>

        <section><div className="mb-3"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/70">Explore</p><h2 className="mt-1 text-lg font-bold text-white">Follow the story.</h2></div><div className="grid gap-2.5 sm:grid-cols-3"><button onClick={() => navigate("/diaspora/heritage")} className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] p-4 text-left"><BookHeart className="h-5 w-5 text-amber-300" /><p className="mt-3 text-sm font-bold text-white">Collections</p><p className="mt-1 text-[11px] leading-relaxed text-white/40">Curated cultural archives and community themes.</p></button><button onClick={() => navigate("/diaspora/research")} className="rounded-2xl border border-teal-300/15 bg-teal-300/[0.06] p-4 text-left"><GraduationCap className="h-5 w-5 text-teal-300" /><p className="mt-3 text-sm font-bold text-white">Research</p><p className="mt-1 text-[11px] leading-relaxed text-white/40">Build evidence around names, places, and records.</p></button><button onClick={() => navigate("/diaspora/timeline")} className="rounded-2xl border border-rose-300/15 bg-rose-300/[0.06] p-4 text-left"><History className="h-5 w-5 text-rose-300" /><p className="mt-3 text-sm font-bold text-white">Legacy</p><p className="mt-1 text-[11px] leading-relaxed text-white/40">Turn preserved moments into a family timeline.</p></button></div></section>

        <section><div className="rounded-2xl border border-blue-300/15 bg-blue-300/[0.05] p-5"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-300/10"><Dna className="h-5 w-5 text-blue-300" /></span><div className="min-w-0 flex-1"><p className="text-sm font-bold text-white">DNA Connections</p><p className="mt-1 text-xs leading-relaxed text-white/45">Connect a supported DNA dataset to explore relatives and ancestry. Until data is connected, Niakofa will not invent match counts or ethnicity results.</p></div></div><button onClick={() => navigate("/diaspora/dna")} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-300 px-4 py-2.5 text-xs font-bold text-[#06111a]">Connect DNA data <ArrowRight className="h-3.5 w-3.5" /></button></div></section>

        <section><div className="rounded-2xl border border-amber-300/15 bg-gradient-to-br from-amber-300/[0.08] to-teal-300/[0.05] p-5"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-300/10"><Sparkles className="h-5 w-5 text-amber-300" /></span><div className="min-w-0 flex-1"><p className="text-sm font-bold text-white">Nia</p><p className="mt-0.5 text-xs text-white/40">Your guide for family history and preservation.</p>{niaLoading ? <div className="mt-3 flex items-center gap-2 rounded-xl bg-black/15 p-3 text-xs text-white/50"><Loader2 className="h-4 w-4 animate-spin text-amber-300" /> Nia is thinking…</div> : niaMessage ? <div className="mt-3 rounded-xl bg-black/15 p-3 text-sm leading-relaxed text-white/80">{niaMessage}</div> : <div className="mt-3 space-y-1.5">{["Help me plan an oral history interview.", "How should I organize my family tree?", "Help me find records for an ancestor."].map((prompt) => <button key={prompt} onClick={() => void askNia(prompt)} className="block text-left text-xs text-amber-200/65 hover:text-amber-200">· {prompt}</button>)}</div>}</div></div><div className="mt-4 flex gap-2"><input value={niaInput} onChange={(event) => setNiaInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void askNia(); }} placeholder="Ask Nia…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/15 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:ring-2 focus:ring-amber-300/25" style={{ fontSize: "16px" }} /><button onClick={() => void askNia()} disabled={!niaInput.trim() || niaLoading} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-300 text-[#201600] disabled:opacity-40" aria-label="Ask Nia"><MessageSquare className="h-4 w-4" /></button></div></div></section>

        <footer className="border-t border-white/10 py-5 text-center"><p className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-300/70">NIAKOFA</p><p className="mt-1 text-xs italic text-white/30">Life · Community · Purpose</p></footer>
      </main>
    </div>
  );
}
