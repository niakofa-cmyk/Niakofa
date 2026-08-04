/**
 * Dashboard — a distinct hub page, separate from Map (which stays Home/"/").
 * Route: /dashboard
 *
 * Everything rendered here comes from real, existing endpoints:
 *   - Personal stats come straight off currentUser (same fields profile.tsx
 *     already uses: benevolence_wallet, trust_score, help_count, goodwill_score)
 *   - "My Recent Activity" merges GET /requests?requester_id= and
 *     GET /requests?helper_id= (real personal request history)
 *   - "Community Pool" comes from GET /pool/stats (public, real ledger totals)
 *   - "Diaspora Activity" comes from GET /diaspora/activity (real family
 *     memory feed) when the user belongs to a family space; hidden otherwise
 * No invented data, no placeholder numbers.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Users, Map as MapIcon, Globe2, Landmark, Radio, Wallet as WalletIcon,
  Settings as SettingsIcon, ChevronRight, Loader2, Heart, Sparkles, ArrowRight,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";

interface RequestRow {
  id: number;
  title: string;
  status: string;
  category: string;
  created_at: string;
  requester_id: number;
  helper_id: number | null;
}

interface DiasporaActivity {
  type: string;
  title: string;
  time: string;
  family_id: number;
}

interface PoolStats {
  balance: number;
}

const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

export default function DashboardPage() {
  const { currentUser } = useAppContext();
  const [, setLocation] = useLocation();
  const [myRequests, setMyRequests] = useState<RequestRow[]>([]);
  const [diasporaActivity, setDiasporaActivity] = useState<DiasporaActivity[]>([]);
  const [pool, setPool] = useState<PoolStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;

    (async () => {
      try {
        const [asRequester, asHelper, activity, poolStats] = await Promise.all([
          fetch(`${base}/api/requests?requester_id=${currentUser.id}&limit=5`, { headers: authHeaders() })
            .then(r => (r.ok ? r.json() : [])).catch(() => []),
          fetch(`${base}/api/requests?helper_id=${currentUser.id}&limit=5`, { headers: authHeaders() })
            .then(r => (r.ok ? r.json() : [])).catch(() => []),
          fetch(`${base}/api/diaspora/activity`, { headers: authHeaders() })
            .then(r => (r.ok ? r.json() : { activities: [] })).catch(() => ({ activities: [] })),
          fetch(`${base}/api/pool/stats`)
            .then(r => (r.ok ? r.json() : null)).catch(() => null),
        ]);

        if (cancelled) return;

        const merged: RequestRow[] = [...(asRequester ?? []), ...(asHelper ?? [])]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 6);

        setMyRequests(merged);
        setDiasporaActivity((activity?.activities ?? []).slice(0, 4));
        setPool(poolStats);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [currentUser]);

  if (!currentUser) return null;

  const stats = [
    { label: "Niakofa Wallet", value: `$${(currentUser.benevolence_wallet ?? 0).toFixed(2)}`, icon: WalletIcon, onClick: () => setLocation("/wallet") },
    { label: "Trust Score", value: `${(currentUser.trust_score ?? 0).toFixed(0)}%`, icon: Sparkles, onClick: undefined as (() => void) | undefined },
    { label: "People Helped", value: `${currentUser.help_count ?? 0}`, icon: Heart, onClick: undefined as (() => void) | undefined },
    { label: "Goodwill", value: `${currentUser.goodwill_score ?? 0}`, icon: Sparkles, onClick: undefined as (() => void) | undefined },
  ];

  const quickLinks = [
    { key: "community", label: "Community", desc: "Feed, heroes, resources & more", icon: Users, href: "/community" },
    { key: "map", label: "Map", desc: "Nearby requests & live help", icon: MapIcon, href: "/" },
    { key: "diaspora", label: "Diaspora", desc: "Family spaces, DNA, heritage", icon: Globe2, href: "/diaspora" },
    { key: "civic", label: "Civic Engagement", desc: "Local needs & civic tasks", icon: Landmark, href: "/civic-needs" },
    { key: "circles", label: "Circles", desc: "Live audio community rooms", icon: Radio, href: "/audio-circles" },
    { key: "settings", label: "Settings", desc: "Account & Niakofa preferences", icon: SettingsIcon, href: "/settings" },
  ];

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-8">
      <div className="max-w-5xl mx-auto px-4 pt-8 lg:pt-10 space-y-8">
        {/* Welcome header */}
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-primary/80">Dashboard</div>
          <h1 className="text-2xl font-black mt-1">Welcome back, {currentUser.name?.split(" ")[0] ?? "friend"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Help Today, Pay It Forward Tomorrow — here's what's happening across Niakofa.
          </p>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map((s) => (
            <button
              key={s.label}
              onClick={s.onClick}
              disabled={!s.onClick}
              className={`text-left p-4 bg-card border border-border rounded-2xl ${s.onClick ? "hover:border-primary/40 cursor-pointer" : ""}`}
            >
              <s.icon className="w-4 h-4 text-primary mb-2" />
              <div className="text-lg font-black">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </button>
          ))}
        </div>

        {/* Quick access grid */}
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">Quick Access</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {quickLinks.map((q) => (
              <button
                key={q.key}
                onClick={() => setLocation(q.href)}
                className="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl text-left hover:border-primary/40 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <q.icon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">{q.label}</div>
                  <div className="text-xs text-muted-foreground truncate">{q.desc}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* My recent activity */}
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">
                My Recent Activity
              </div>
              {myRequests.length === 0 ? (
                <div className="p-4 bg-card border border-border rounded-2xl text-sm text-muted-foreground">
                  No requests yet — head to the Map to ask for or offer help.
                </div>
              ) : (
                <div className="space-y-2">
                  {myRequests.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setLocation(`/request/${r.id}/view`)}
                      className="w-full flex items-center justify-between gap-3 p-3 bg-card border border-border rounded-xl text-left hover:border-primary/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-bold truncate">{r.title}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {r.requester_id === currentUser.id ? "You requested" : "You helped"} · {r.status}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Diaspora + Community Pool */}
            <div className="space-y-6">
              <div>
                <div className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">
                  Diaspora Activity
                </div>
                {diasporaActivity.length === 0 ? (
                  <button
                    onClick={() => setLocation("/diaspora")}
                    className="w-full flex items-center justify-between gap-3 p-4 bg-card border border-border rounded-2xl text-left hover:border-primary/40 transition-colors"
                  >
                    <div>
                      <div className="text-sm font-bold">Start your Family Space</div>
                      <div className="text-xs text-muted-foreground">Preserve memories, oral histories & your family tree</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-primary shrink-0" />
                  </button>
                ) : (
                  <div className="space-y-2">
                    {diasporaActivity.map((a, i) => (
                      <button
                        key={i}
                        onClick={() => setLocation(`/diaspora/vault/${a.family_id}`)}
                        className="w-full flex items-center justify-between gap-3 p-3 bg-card border border-border rounded-xl text-left hover:border-primary/40 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-bold truncate">{a.title}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {a.type === "oral_history" ? "Oral history" : "Memory"}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {pool && (
                <button
                  onClick={() => setLocation("/community?tab=pool")}
                  className="w-full flex items-center justify-between gap-3 p-4 bg-gradient-to-br from-primary/15 to-background border border-primary/30 rounded-2xl text-left hover:border-primary/50 transition-colors"
                >
                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-primary/80">Community Pool</div>
                    <div className="text-lg font-black mt-1">${pool.balance.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground">Fueling pay-it-forward help across Niakofa</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-primary shrink-0" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
