/**
 * Diaspora — Globe-only doorway
 * Route: /diaspora
 *
 * Product hierarchy: Diaspora → Globe → Hub → Action.
 * The landing page intentionally contains no secondary dashboard modules.
 * Family, stories, research, Legacy, Spirals, messaging and Pool remain
 * reachable after a Hub is selected.
 */

import { useEffect, useState } from "react";
import { Globe2 } from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { diasporaTheme } from "@/lib/diaspora/theme";
import { DiasporaGlobeFirst, type DiasporaGlobeHub } from "@/components/diaspora/DiasporaGlobeFirst";
import { toast } from "sonner";

export default function DiasporaDashboardPage() {
  const { currentUser } = useAppContext();
  const [hubs, setHubs] = useState<DiasporaGlobeHub[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const response = await fetch("/api/griot/village-pulse", {
          headers: authHeaders(),
        });
        if (!response.ok) throw new Error("diaspora-globe");
        const data = await response.json();
        if (cancelled) return;

        const nextHubs = (Array.isArray(data.hubs) ? data.hubs : []).map(
          (hub: Record<string, unknown>) => ({
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
            local_hubs: Array.isArray(hub.local_hubs)
              ? (hub.local_hubs as DiasporaGlobeHub["local_hubs"])
              : null,
          }),
        ) as DiasporaGlobeHub[];

        setHubs(
          nextHubs.filter(
            (hub) =>
              Number.isFinite(hub.id) &&
              Number.isFinite(hub.lat) &&
              Number.isFinite(hub.lng),
          ),
        );
      } catch {
        if (!cancelled) toast.error("Couldn't load your Diaspora Globe");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <p className="text-sm text-muted-foreground">Sign in to enter the Diaspora Globe.</p>
      </div>
    );
  }

  return (
    <div className={`${diasporaTheme.page} min-h-screen`}>
      <header className="border-b border-white/10 bg-[#071312]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 sm:px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-teal-300/20 bg-teal-300/10">
            <Globe2 className="h-5 w-5 text-teal-300" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-teal-300/75">
              Niakofa Diaspora
            </p>
            <h1 className="truncate text-lg font-black text-white sm:text-xl">
              Where is your community in the world?
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-3 sm:px-5 sm:py-5">
        <DiasporaGlobeFirst hubs={hubs} loading={loading} />
      </main>
    </div>
  );
}
