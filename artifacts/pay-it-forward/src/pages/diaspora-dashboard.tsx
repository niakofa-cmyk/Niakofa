/**
 * Diaspora Dashboard — Globe-first experience
 * Route: /diaspora
 *
 * The dashboard is intentionally a doorway, not a feature directory:
 * Globe → Family → Oral History → Tree → Heritage → Research → Legacy.
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowRight, BookHeart, Clock3, Dna, Globe2, GraduationCap, History,
  Layers3, Loader2, Map, Mic, Sparkles, TreePine, Users,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { buildOralHistoryHref } from "@/lib/diaspora/oralHistoryDeepLink";
import { diasporaTheme } from "@/lib/diaspora/theme";
import { toast } from "sonner";

interface DashboardStats {
  family_spaces: number;
  vault_items: number;
  oral_histories: number;
  family_tree_people: number;
}

interface ActivityItem {
  type: string;
  title: string;
  time: string;
  family_id: number;
  memory_id?: number;
}

interface Hub {
  story_count?: number;
  member_count?: number;
}

const JOURNEY = [
  { label: "Family", note: "Gather", icon: Users, href: "/diaspora/family", tone: diasporaTheme.gold },
  { label: "Stories", note: "Record", icon: Mic, href: "/diaspora/family?intent=oral-history", tone: diasporaTheme.rose },
  { label: "Tree", note: "Connect", icon: TreePine, href: "/diaspora/tree", tone: diasporaTheme.emerald },
  { label: "Heritage", note: "Explore", icon: Layers3, href: "/diaspora/heritage", tone: diasporaTheme.teal },
  { label: "Research", note: "Discover", icon: GraduationCap, href: "/diaspora/research", tone: diasporaTheme.teal },
  { label: "Legacy", note: "Preserve", icon: History, href: "/diaspora/timeline", tone: diasporaTheme.gold },
] as const;

function relativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Recently";
  const minutes = Math.max(0, (Date.now() - timestamp) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${Math.floor(minutes)}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

function StatCard({ value, label, icon: Icon, onClick, tone }: {
  value: number;
  label: string;
  icon: typeof Users;
  onClick: () => void;
  tone: string;
}) {
  return (
    <button onClick={onClick} className={`${diasporaTheme.radius} group border border-white/10 bg-white/[0.035] p-3 text-left ${diasporaTheme.focus}`}>
      <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></span>
      <p className="mt-2.5 text-lg font-black tabular-nums text-white">{value}</p>
      <p className="text-[10px] leading-tight text-white/40">{label}</p>
    </button>
  );
}

export default function DiasporaDashboardPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [hubCount, setHubCount] = useState<number | null>(null);
  const [storyCount, setStoryCount] = useState<number | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [dashboardRes, activityRes, hubsRes] = await Promise.all([
          fetch("/api/diaspora/dashboard", { headers: authHeaders() }),
          fetch("/api/diaspora/activity", { headers: authHeaders() }),
          fetch("/api/griot/hubs", { headers: authHeaders() }),
        ]);
        if (!dashboardRes.ok) throw new Error("dashboard");
        const dashboard = await dashboardRes.json();
        if (cancelled) return;
        setStats(dashboard.stats ?? null);
        if (activityRes.ok) {
          const data = await activityRes.json();
          setActivity(Array.isArray(data.activities) ? data.activities : []);
        }
        if (hubsRes.ok) {
          const data = await hubsRes.json();
          const hubs = Array.isArray(data.hubs) ? data.hubs as Hub[] : [];
          setHubCount(hubs.length);
          setStoryCount(hubs.reduce((sum, hub) => sum + Number(hub.story_count ?? 0), 0));
          setMemberCount(hubs.reduce((sum, hub) => sum + Number(hub.member_count ?? 0), 0));
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

  if (!currentUser) {
    return <div className="flex min-h-screen items-center justify-center bg-background px-6"><p className="text-sm text-muted-foreground">Sign in to access your Diaspora Dashboard.</p></div>;
  }

  const user = currentUser as unknown as Record<string, unknown>;
  const displayName = (user.display_name as string | undefined) ?? (user.username as string | undefined) ?? "Friend";
  const locale = (user.city as string | undefined) ?? (user.locale as string | undefined);
  const oralHistoryHref = buildOralHistoryHref(activity[0]?.family_id);

  return (
    <div className={`${diasporaTheme.page} min-h-screen pb-28`}>
      <header className="relative overflow-hidden border-b border-teal-300/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_15%,rgba(45,212,191,0.20),transparent_30%),radial-gradient(circle_at_12%_80%,rgba(245,158,11,0.16),transparent_32%)]" />
        <div className="relative mx-auto max-w-3xl px-4 pb-6 pt-8 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-teal-200/75">Niakofa Diaspora</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">Your story has a world.</h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-teal-50/60">{locale ? `From ${locale} to every place your family calls home.` : "Connect family, culture, memory, and community across generations."}</p>
            </div>
            <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-300/10 sm:flex"><BookHeart className="h-7 w-7 text-amber-300" /></div>
          </div>
          <div className="mt-6 grid grid-cols-4 gap-2">
            <StatCard value={stats?.family_spaces ?? 0} label="Family spaces" icon={Users} onClick={() => navigate("/diaspora/family")} tone="bg-amber-300/10 text-amber-300" />
            <StatCard value={stats?.vault_items ?? 0} label="Vault items" icon={BookHeart} onClick={() => navigate("/diaspora/family")} tone="bg-teal-300/10 text-teal-300" />
            <StatCard value={stats?.oral_histories ?? 0} label="Oral histories" icon={Mic} onClick={() => navigate(oralHistoryHref)} tone="bg-rose-300/10 text-rose-300" />
            <StatCard value={stats?.family_tree_people ?? 0} label="People in trees" icon={TreePine} onClick={() => navigate("/diaspora/tree")} tone="bg-emerald-300/10 text-emerald-300" />
          </div>
        </div>
      </header>

      <nav className="sticky top-0 z-30 border-b border-white/10 bg-[#071312]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none] sm:px-5">
          {JOURNEY.map(({ label, icon: Icon, href, tone }) => (
            <button key={label} onClick={() => navigate(href)} className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white/50 hover:bg-white/5 hover:text-white ${diasporaTheme.focus}`}>
              <Icon className={`h-3.5 w-3.5 ${tone.split(" ").at(-1)}`} />{label}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-3xl space-y-8 px-4 pt-6 sm:px-6">
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-teal-300/70">The living map</p><h2 className="mt-1 text-xl font-black text-white">Diaspora Globe</h2></div>
            <button onClick={() => navigate("/diaspora/heritage/globe")} className={`flex items-center gap-1 text-xs font-bold text-teal-300 ${diasporaTheme.focus}`}>Enter globe <ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
          <button onClick={() => navigate("/diaspora/heritage/globe")} className={`group relative w-full overflow-hidden rounded-[2rem] border border-teal-200/20 bg-gradient-to-br from-[#082b29] via-[#063f3b] to-[#071a19] p-5 text-left shadow-[0_24px_80px_rgba(13,148,136,0.14)] sm:p-7 ${diasporaTheme.focus}`}>
            <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full border border-teal-100/10 bg-teal-200/[0.03]" />
            <div className="pointer-events-none absolute right-10 top-8 h-44 w-44 rounded-full border border-teal-100/10 sm:right-16 sm:h-52 sm:w-52" />
            <div className="pointer-events-none absolute right-[7.5rem] top-[5.5rem] h-2.5 w-2.5 rounded-full bg-amber-300 shadow-[0_0_24px_rgba(245,158,11,0.95)] sm:right-[10rem]" />
            <div className="relative grid gap-7 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="max-w-xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-teal-100/10 bg-teal-100/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-teal-100/70"><Globe2 className="h-3 w-3" /> Connected world</span>
                <h3 className="mt-4 text-2xl font-black text-white sm:text-3xl">From homeland to home base.</h3>
                <p className="mt-2 max-w-lg text-sm leading-relaxed text-teal-50/60">Explore living diaspora hubs, migration arcs, Griot stories, and communities connected through Niakofa.</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-white/65"><Map className="mr-1 inline h-3 w-3 text-teal-300" /> {hubCount ?? "—"} hubs</span>
                  <span className="rounded-full bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-white/65"><Mic className="mr-1 inline h-3 w-3 text-rose-300" /> {storyCount ?? "—"} stories</span>
                  <span className="rounded-full bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-white/65"><Users className="mr-1 inline h-3 w-3 text-amber-300" /> {memberCount ?? "—"} hub members</span>
                </div>
              </div>
              <div className="flex h-24 w-24 items-center justify-center rounded-full border border-teal-100/10 bg-teal-100/[0.04] sm:h-32 sm:w-32"><Globe2 className="h-14 w-14 text-teal-200/75 sm:h-20 sm:w-20" /></div>
            </div>
          </button>
        </section>

        <section>
          <div className="mb-3"><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300/70">One journey</p><h2 className="mt-1 text-xl font-black text-white">Preserve. Connect. Discover.</h2></div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {JOURNEY.map(({ label, note, icon: Icon, href, tone }) => (
              <button key={label} onClick={() => navigate(href)} className={`rounded-2xl border ${tone.split(" ")[0]} ${tone.split(" ")[1]} p-4 text-left ${diasporaTheme.focus}`}>
                <Icon className={`h-5 w-5 ${tone.split(" ").at(-1)}`} /><p className="mt-3 text-sm font-bold text-white">{label}</p><p className="mt-0.5 text-[11px] text-white/40">{note}</p>
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-rose-300/70">Your family story</p><h2 className="mt-1 text-xl font-black text-white">Recent activity</h2></div><button onClick={() => navigate("/diaspora/family")} className={`text-xs font-bold text-teal-300 ${diasporaTheme.focus}`}>Open vault</button></div>
          {loading ? <div className={`${diasporaTheme.radius} flex items-center justify-center border border-white/10 bg-white/[0.03] py-12`}><Loader2 className="h-5 w-5 animate-spin text-teal-300" /></div> : activity.length === 0 ? <div className={`${diasporaTheme.radius} border border-dashed border-white/10 bg-white/[0.025] p-7 text-center`}><Clock3 className="mx-auto h-8 w-8 text-white/20" /><p className="mt-3 text-sm font-bold text-white/70">Your story starts here.</p><p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-white/40">Preserve a memory, record an elder, or build your family tree.</p><button onClick={() => navigate(oralHistoryHref)} className="mt-4 rounded-xl bg-amber-300 px-4 py-2 text-xs font-black text-[#201600]">Record a story</button></div> : <div className="space-y-2">{activity.slice(0, 5).map(item => <button key={`${item.family_id}-${item.memory_id ?? item.time}-${item.title}`} onClick={() => navigate(item.memory_id ? `/family/${item.family_id}/memory/${item.memory_id}` : `/diaspora/vault/${item.family_id}`)} className={`flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3.5 text-left hover:bg-white/[0.06] ${diasporaTheme.focus}`}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-300/10"><BookHeart className="h-4 w-4 text-teal-300" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white/85">{item.title}</span><span className="mt-0.5 block text-[11px] text-white/35">{relativeTime(item.time)}</span></span><ArrowRight className="h-4 w-4 text-white/20" /></button>)}</div>}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <button onClick={() => navigate("/diaspora/dna")} className={`rounded-2xl border border-blue-300/15 bg-blue-300/[0.05] p-5 text-left ${diasporaTheme.focus}`}><Dna className="h-5 w-5 text-blue-300" /><p className="mt-3 text-sm font-bold text-white">DNA Connections</p><p className="mt-1 text-xs leading-relaxed text-white/40">Connect a supported dataset. No match or ethnicity result is shown unless a real source provides it.</p><span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-blue-300">Connect data <ArrowRight className="h-3.5 w-3.5" /></span></button>
          <button onClick={() => window.openNia?.("Help me preserve a family story.")} className={`rounded-2xl border border-amber-300/15 bg-gradient-to-br from-amber-300/[0.08] to-teal-300/[0.04] p-5 text-left ${diasporaTheme.focus}`}><Sparkles className="h-5 w-5 text-amber-300" /><p className="mt-3 text-sm font-bold text-white">Ask Nia</p><p className="mt-1 text-xs leading-relaxed text-white/40">Use the global Nia guide without duplicating the full chat interface on the dashboard.</p><span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-amber-300">Open Nia <ArrowRight className="h-3.5 w-3.5" /></span></button>
        </section>

        <footer className="border-t border-white/10 py-6 text-center"><p className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-300/70">NIAKOFA</p><p className="mt-1 text-xs italic text-white/30">Life · Community · Purpose</p></footer>
      </main>
    </div>
  );
}
