/**
 * Diaspora — Globe-first doorway
 * Route: /diaspora
 *
 * Product hierarchy: Diaspora → Globe → Hub → Action.
 * Downstream family, stories, research, Legacy, Spirals and Pool surfaces
 * remain reachable after a Hub is selected instead of competing for attention
 * on the landing page.
 */

import { useEffect, useState } from "react";
import { ArrowRight, BookHeart, Globe2, History, Loader2, Mic, TreePine, Users } from "lucide-react";
import { useLocation } from "wouter";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { diasporaTheme } from "@/lib/diaspora/theme";
import { DiasporaGlobeFirst, type DiasporaGlobeHub } from "@/components/diaspora/DiasporaGlobeFirst";
import { toast } from "sonner";

interface DashboardStats {
  family_spaces: number;
  vault_items: number;
  oral_histories: number;
  family_tree_people: number;
  heritage_collections: number;
}

export default function DiasporaDashboardPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [hubs, setHubs] = useState<DiasporaGlobeHub[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [dashboardRes, pulseRes] = await Promise.all([
          fetch("/api/diaspora/dashboard", { headers: authHeaders() }),
          fetch("/api/griot/village-pulse", { headers: authHeaders() }),
        ]);
        if (!dashboardRes.ok) throw new Error("dashboard");
        const dashboard = await dashboardRes.json();
        if (cancelled) return;
        setStats(dashboard.stats ?? null);

        if (pulseRes.ok) {
          const data = await pulseRes.json();
          const nextHubs = (Array.isArray(data.hubs) ? data.hubs : []).map((hub: Record<string, unknown>) => ({
            ...hub,
            id: Number(hub.id ?? hub.hub_id),
            name: String(hub.name ?? hub.hub_name ?? "Diaspora Hub"),
            display_name: typeof hub.display_name === "string" ? hub.display_name : null,
            region: String(hub.region ?? hub.region_label ?? ""),
            lat: Number(hub.lat ?? 0),
            lng: Number(hub.lng ?? 0),
            tag: String(hub.tag ?? "country"),
            hub_scope: typeof hub.hub_scope === "string" ? hub.hub_scope : null,
            country_code: typeof hub.country_code === "string" ? hub.country_code : null,
            subdivision_code: typeof hub.subdivision_code === "string" ? hub.subdivision_code : null,
            story_count: Number(hub.story_count ?? 0),
            member_count: Number(hub.member_count ?? 0),
            live_user_count: Number(hub.live_user_count ?? 0),
            neighborhood_count: Number(hub.neighborhood_count ?? 0),
            spiral_count: Number(hub.spiral_count ?? 0),
            open_requests: Number(hub.open_requests ?? 0),
            reserved_balance: (hub.reserved_balance as string | number | null | undefined) ?? null,
            is_crisis: hub.is_crisis === true,
            crisis_message: typeof hub.crisis_message === "string" ? hub.crisis_message : null,
            local_hubs: Array.isArray(hub.local_hubs) ? hub.local_hubs as DiasporaGlobeHub["local_hubs"] : null,
          })) as DiasporaGlobeHub[];
          setHubs(nextHubs.filter((hub) => Number.isFinite(hub.id) && Number.isFinite(hub.lat) && Number.isFinite(hub.lng)));
        }
      } catch {
        if (!cancelled) toast.error("Couldn't load your Diaspora Globe");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [currentUser]);

  if (!currentUser) return <div className="flex min-h-screen items-center justify-center bg-background px-6"><p className="text-sm text-muted-foreground">Sign in to enter the Diaspora Globe.</p></div>;

  const familyLabel = stats ? `${stats.family_tree_people} people in your family tree` : "Your family network";

  return (
    <div className={`${diasporaTheme.page} min-h-screen pb-20`}>
      <header className="border-b border-white/10 bg-[#071312]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-5 sm:px-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-teal-300/20 bg-teal-300/10"><Globe2 className="h-5 w-5 text-teal-300" /></div>
          <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.26em] text-teal-300/75">Niakofa Diaspora</p><h1 className="truncate text-xl font-black text-white sm:text-2xl">Where is your community in the world?</h1></div>
          <button onClick={() => navigate("/diaspora/family")} className={`hidden items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-white/60 hover:text-white sm:flex ${diasporaTheme.focus}`}><BookHeart className="h-3.5 w-3.5 text-amber-300" /> My family</button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 pt-5 sm:px-6">
        <DiasporaGlobeFirst hubs={hubs} loading={loading} />

        <section className={`${diasporaTheme.radius} border border-white/10 bg-white/[0.025] p-4 sm:p-5`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-300/10"><TreePine className="h-4 w-4 text-amber-300" /></span><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-300/65">My Family</p><p className="truncate text-sm font-semibold text-white/80">{familyLabel}</p>{stats != null && <p className="truncate text-[11px] text-white/40">Curated heritage catalog · {stats.heritage_collections} collections</p>}</div></div>
            <div className="flex flex-wrap gap-2"><SmallAction icon={Users} label="Family" onClick={() => navigate("/diaspora/family")} /><SmallAction icon={Mic} label="Record" onClick={() => navigate("/diaspora/family?intent=oral-history")} /><SmallAction icon={History} label="Legacy" onClick={() => navigate("/diaspora/timeline")} /><SmallAction icon={ArrowRight} label="Open" onClick={() => navigate("/diaspora/family")} /></div>
          </div>
        </section>

        {loading && !hubs.length && <div className="flex items-center justify-center py-4 text-xs text-white/35"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading your Diaspora network…</div>}
      </main>
    </div>
  );
}

function SmallAction({ icon: Icon, label, onClick }: { icon: typeof Users; label: string; onClick: () => void }) {
  return <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-bold text-white/55 hover:bg-white/[0.06] hover:text-white ${diasporaTheme.focus}`}><Icon className="h-3.5 w-3.5 text-teal-300" />{label}</button>;
}
