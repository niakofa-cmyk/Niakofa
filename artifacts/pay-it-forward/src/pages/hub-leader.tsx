/**
 * Hub Leader Dashboard
 *
 * Before this page existed, a hub leader had to piece their hub's status
 * together from three unrelated places: pledge/ledger totals in admin
 * analytics, crisis status on the Globe, and open requests on the requests
 * browser. This page is the single "my hub" view: one fetch
 * (GET /griot/hubs/:id/summary) drives ring-fenced balance, crisis controls,
 * open requests, approved leaders, and recent inbound pledges together.
 *
 * Route: /hub-leader/:id
 */
import { useState, useEffect, useCallback } from "react";
import { useLocation, useRoute } from "wouter";
import {
  ChevronLeft, AlertCircle, ShieldCheck, Users, MapPin, DollarSign,
  RefreshCw, CheckCircle2, TrendingUp, Heart, Globe2, Coins,
  ArrowUpRight, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { authHeaders } from "@/lib/auth";
import { useAppContext } from "@/lib/AppContext";
import { LastUpdated } from "@/components/LastUpdated";

interface HubSummaryLeader {
  id: number;
  user_id: number;
  role: string;
  approved: boolean;
  created_at: string;
  name: string;
}

interface HubSummaryPledge {
  id: number;
  from_hub_id: number;
  amount: string | number;
  message: string | null;
  status: string;
  created_at: string;
}

interface HubSummaryRequest {
  id: number;
  title: string;
  category: string;
  pay_it_forward_amount: string | number | null;
  created_at: string;
}

interface HubSummary {
  hub: {
    id: number;
    name: string;
    region_label: string | null;
    is_crisis: boolean;
    crisis_message: string | null;
    community_id: number | null;
  };
  reserved_balance: number;
  open_request_count: number;
  open_requests: HubSummaryRequest[];
  leaders: HubSummaryLeader[];
  recent_pledges: HubSummaryPledge[];
  is_leader_or_admin: boolean;
}

export default function HubLeaderDashboard() {
  const [, params] = useRoute("/hub-leader/:id");
  const [, setLocation] = useLocation();
  const { currentUser } = useAppContext();
  const hubId = params?.id ? Number(params.id) : NaN;

  const [summary, setSummary] = useState<HubSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [crisisNote, setCrisisNote] = useState("");
  const [crisisMessage, setCrisisMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!Number.isFinite(hubId)) return;
    if (silent) setRefreshing(true);
    try {
      const res = await fetch(`/api/griot/hubs/${hubId}/summary`, { headers: authHeaders() });
      if (!res.ok) {
        setError(res.status === 404 ? "Hub not found" : "Failed to load hub dashboard");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setSummary(data);
      setError(null);
      setLastUpdated(new Date());
    } catch {
      setError("Failed to load hub dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [hubId]);

  // Periodic background refresh (matches the Globe's 60s cadence) so ring-
  // fenced balance, crisis status, and open-request counts don't silently
  // drift while a leader keeps this dashboard open.
  useEffect(() => {
    const id = setInterval(() => { load(true); }, 60_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!currentUser) {
      setLocation("/login");
      return;
    }
    load();
  }, [currentUser, load, setLocation]);

  async function declareCrisis() {
    if (!summary || crisisMessage.trim().length < 3) {
      toast({ title: "Describe the crisis (at least a few words)", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/griot/hubs/${summary.hub.id}/crisis`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ crisis_message: crisisMessage.trim() }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Crisis declared — the hub is now flagged on the Globe" });
      setCrisisMessage("");
      await load();
    } catch {
      toast({ title: "Failed to declare crisis", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function clearCrisis() {
    if (!summary || crisisNote.trim().length < 3) {
      toast({ title: "A resolution note is required to clear a crisis", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/griot/hubs/${summary.hub.id}/crisis`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ crisis_resolved_note: crisisNote.trim() }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Crisis cleared" });
      setCrisisNote("");
      await load();
    } catch {
      toast({ title: "Failed to clear crisis", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function applyToLead() {
    if (!summary) return;
    setApplying(true);
    try {
      const res = await fetch(`/api/griot/hubs/${summary.hub.id}/leaders/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
      });
      if (res.status === 409) {
        toast({ title: "You've already applied to lead this hub" });
      } else if (!res.ok) {
        throw new Error();
      } else {
        toast({ title: "Application submitted — an existing leader or admin will review it" });
      }
    } catch {
      toast({ title: "Failed to submit application", variant: "destructive" });
    } finally {
      setApplying(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <AlertCircle className="w-8 h-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{error ?? "Hub not found"}</p>
        <Button variant="outline" onClick={() => setLocation("/diaspora/heritage/globe")}>Back to Globe</Button>
      </div>
    );
  }

  const { hub } = summary;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-2">
        <button
          onClick={() => setLocation("/diaspora/heritage/globe")}
          className="p-1.5 -ml-1.5 rounded-lg hover:bg-muted transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="font-black text-[16px]">{hub.name}</h1>
          <p className="text-[11px] text-muted-foreground">{hub.region_label ?? "Hub leader dashboard"}</p>
        </div>
        <LastUpdated
          lastUpdated={lastUpdated}
          refreshing={refreshing}
          onRefresh={() => load(true)}
        />
      </div>

      <div className="max-w-lg mx-auto w-full px-4 pt-4 space-y-3">
        {!summary.is_leader_or_admin && (
          <div className="bg-muted/40 border border-border rounded-2xl p-4 text-center space-y-2">
            <ShieldCheck className="w-5 h-5 mx-auto text-muted-foreground" />
            <p className="text-[12px] text-muted-foreground">
              You can view this hub's public status, but you're not an approved leader — apply to unlock crisis controls and management actions.
            </p>
            <Button size="sm" onClick={applyToLead} disabled={applying}>
              {applying ? "Applying…" : "Apply to lead this hub"}
            </Button>
          </div>
        )}

        {/* Crisis status + controls */}
        <div className={`rounded-2xl border p-4 ${hub.is_crisis ? "border-red-500/40 bg-red-500/10" : "border-border bg-card"}`}>
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className={`w-4 h-4 ${hub.is_crisis ? "text-red-500" : "text-muted-foreground"}`} />
            <p className="font-bold text-[13px]">{hub.is_crisis ? "Crisis declared" : "No active crisis"}</p>
          </div>
          {hub.is_crisis && hub.crisis_message && (
            <p className="text-[12px] text-foreground/90 mb-3">{hub.crisis_message}</p>
          )}
          {summary.is_leader_or_admin && (
            hub.is_crisis ? (
              <div className="space-y-2">
                <textarea
                  value={crisisNote}
                  onChange={(e) => setCrisisNote(e.target.value)}
                  placeholder="Resolution note (required to clear)"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[12px]"
                  style={{ fontSize: "16px" }}
                  rows={2}
                />
                <Button size="sm" variant="outline" onClick={clearCrisis} disabled={busy} className="w-full">
                  Clear crisis
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  value={crisisMessage}
                  onChange={(e) => setCrisisMessage(e.target.value)}
                  placeholder="Describe the crisis so other hubs know how to help"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[12px]"
                  style={{ fontSize: "16px" }}
                  rows={2}
                />
                <Button size="sm" variant="destructive" onClick={declareCrisis} disabled={busy} className="w-full">
                  Declare crisis
                </Button>
              </div>
            )
          )}
        </div>

        {/* Pledge / reserve balance + open requests */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-2xl p-3">
            <DollarSign className="w-4 h-4 text-primary mb-1" />
            <p className="text-[18px] font-black">${summary.reserved_balance.toFixed(0)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Ring-fenced balance</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-3">
            <MapPin className="w-4 h-4 text-primary mb-1" />
            <p className="text-[18px] font-black">{summary.open_request_count}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Open requests</p>
          </div>
        </div>

        {/* Open requests list */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="font-bold text-[13px] mb-2">Open requests tagged to this hub</p>
          {summary.open_requests.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">No open requests right now.</p>
          ) : (
            <div className="space-y-2">
              {summary.open_requests.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setLocation(`/request/${r.id}/view`)}
                  className="w-full text-left flex items-center justify-between gap-2 py-2 border-b border-border/50 last:border-0 hover:bg-muted/30 rounded-lg px-1 -mx-1 transition-colors"
                >
                  <div>
                    <p className="text-[12px] font-semibold">{r.title}</p>
                    <p className="text-[10px] text-muted-foreground">{r.category}</p>
                  </div>
                  {r.pay_it_forward_amount != null && (
                    <span className="text-[11px] font-bold text-primary shrink-0">
                      ${Number(r.pay_it_forward_amount).toFixed(0)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          <Button size="sm" variant="ghost" className="w-full mt-2" onClick={() => setLocation("/requests")}>
            View all requests ↗
          </Button>
        </div>

        {/* PIF Repayment Progress Visuals */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-primary" />
            <p className="font-bold text-[13px]">Pay-It-Forward Repayment Pipeline</p>
          </div>
          {summary.open_requests.filter(r => r.pay_it_forward_amount != null && Number(r.pay_it_forward_amount) > 0).length === 0 ? (
            <p className="text-[12px] text-muted-foreground">No active PIF pledges on this hub's requests.</p>
          ) : (
            <div className="space-y-2">
              {summary.open_requests
                .filter(r => r.pay_it_forward_amount != null && Number(r.pay_it_forward_amount) > 0)
                .slice(0, 5)
                .map((r) => {
                  const pledged = Number(r.pay_it_forward_amount ?? 0);
                  return (
                    <button
                      key={r.id}
                      onClick={() => setLocation(`/request/${r.id}/view`)}
                      className="w-full text-left space-y-1.5 p-2.5 rounded-xl bg-primary/5 border border-primary/10 hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold leading-tight">{r.title}</p>
                        <span className="text-[11px] font-black text-primary shrink-0">+${pledged.toFixed(0)} pledge</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Coins className="w-3 h-3 text-primary/60 shrink-0" />
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          {/* Visual showing pledge as % of pool contribution target */}
                          <div
                            className="h-full bg-primary/60 rounded-full"
                            style={{ width: `${Math.min(100, (pledged / Math.max(pledged * 2, 50)) * 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground">PIF pledge pending</span>
                      </div>
                    </button>
                  );
                })}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1">
            <Heart className="w-3 h-3 text-primary/50 shrink-0" />
            <span>Pledges repay into the community pool when requesters pay forward — closing the kindness chain.</span>
          </div>
        </div>

        {/* Cross-hub kindness chains (recent inbound pledges) */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Globe2 className="w-4 h-4 text-muted-foreground" />
            <p className="font-bold text-[13px]">Cross-Hub Kindness Chains</p>
            {summary.recent_pledges.length > 0 && (
              <span className="ml-auto text-[10px] font-black text-primary px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                {summary.recent_pledges.length} hub{summary.recent_pledges.length !== 1 ? "s" : ""} helped
              </span>
            )}
          </div>
          {summary.recent_pledges.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">No inter-hub pledges yet. Kindness flows when hubs pledge support across the diaspora network.</p>
          ) : (
            <>
              <div className="space-y-2 mb-2">
                {summary.recent_pledges.map((p) => (
                  <div key={p.id} className="flex items-start justify-between gap-2 text-[12px] border-b border-border/50 last:border-0 pb-2 last:pb-0">
                    <div className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] font-semibold text-primary/70">Hub #{p.from_hub_id} sent support</p>
                        {p.message && <p className="text-foreground/90 text-[11px]">{p.message}</p>}
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(p.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <ArrowUpRight className="w-3 h-3 text-primary" />
                      <span className="font-bold text-primary">${Number(p.amount).toFixed(0)}</span>
                    </div>
                  </div>
                ))}
              </div>
              {/* Total kindness received */}
              <div className="flex items-center gap-2 bg-primary/5 border border-primary/10 rounded-xl px-3 py-2">
                <BarChart3 className="w-3.5 h-3.5 text-primary shrink-0" />
                <div className="flex-1">
                  <span className="text-[10px] text-muted-foreground">Total received from other hubs: </span>
                  <span className="text-[11px] font-black text-primary">
                    ${summary.recent_pledges.reduce((s, p) => s + Number(p.amount), 0).toFixed(0)}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Hub leadership actions — for leaders/admins */}
        {summary.is_leader_or_admin && (
          <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-muted-foreground" />
              <p className="font-bold text-[13px]">Approved Leaders</p>
            </div>
            {summary.leaders.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No approved leaders yet.</p>
            ) : (
              <div className="space-y-1.5">
                {summary.leaders.map((l) => (
                  <div key={l.id} className="flex items-center justify-between text-[12px]">
                    <span>{l.name}</span>
                    <span className="text-muted-foreground text-[10px] uppercase tracking-wide">{l.role}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Approved leaders — read-only for non-leaders */}
        {!summary.is_leader_or_admin && summary.leaders.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <p className="font-bold text-[13px]">Hub Leaders</p>
            </div>
            <div className="space-y-1.5">
              {summary.leaders.map((l) => (
                <div key={l.id} className="flex items-center justify-between text-[12px]">
                  <span>{l.name}</span>
                  <span className="text-muted-foreground text-[10px] uppercase tracking-wide">{l.role}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
