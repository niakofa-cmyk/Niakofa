import { useState, useCallback, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useAppContext } from "@/lib/AppContext";
import {
  useGetNearbyRequests, useGetRequests, useClaimRequest,
  useGetRequestStats, useGetOnlineHelpers,
  getGetNearbyRequestsQueryKey, getGetRequestsQueryKey,
  getGetRequestStatsQueryKey, getGetOnlineHelpersQueryKey,
  useGetUserTransactions, getGetUserTransactionsQueryKey,
} from "@workspace/api-client-react";
import type { HelpRequest, HelperLocation, Transaction } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, Activity, Star, MapPin, Clock, Heart, Award, Wrench, Zap,
  Filter, DollarSign, Coins, TrendingUp, Flame, Users, Wifi, WifiOff,
  Navigation, RefreshCw, CheckCircle2, AlertCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { useWebSocket } from "@/lib/useWebSocket";
import { wsIsConnected } from "@/lib/wsClient";

const CATEGORY_LABELS: Record<string, string> = {
  groceries: "🛒 Groceries", transportation: "🚗 Transportation", errands: "📦 Errands",
  home_repair: "🔧 Home Repair", medical: "💊 Medical", emergency: "🚨 Emergency",
  stock_shelves: "📦 Stock", event_setup: "🎪 Event", delivery_run: "🚚 Delivery",
  tech_support: "💻 Tech", local_farm: "🌾 Farm", food_pantry: "🥫 Pantry",
  moving_labor: "📦 Moving", pet_care: "🐾 Pets", childcare: "🧸 Childcare",
  senior_care: "🧓 Seniors", yard_work: "🌿 Yard", tutoring: "📚 Tutoring",
  cleaning: "🧹 Cleaning", meal_prep: "🍲 Meals", paperwork: "📄 Paperwork",
  business_services: "💼 Business", legal_aid: "⚖️ Legal Aid",
  financial_coaching: "💰 Financial", job_assistance: "👔 Jobs",
  language_help: "🌐 Language", mental_health_peer: "💜 Peer Support",
  technology_help: "📱 Tech Help", other: "💙 Other",
};

const URGENCY_COLORS: Record<string, string> = {
  emergency: "text-destructive border-destructive/40 bg-destructive/10",
  high:      "text-orange-400 border-orange-400/40 bg-orange-400/10",
  medium:    "text-yellow-400 border-yellow-400/40 bg-yellow-400/10",
  low:       "text-green-400 border-green-400/40 bg-green-400/10",
};

const ALL_SKILLS = [
  { id: "bilingual",            label: "Bilingual",     emoji: "🌐" },
  { id: "truck_owner",          label: "Truck Owner",   emoji: "🚛" },
  { id: "medical_background",   label: "Medical",       emoji: "🏥" },
  { id: "licensed_electrician", label: "Electrician",   emoji: "⚡" },
  { id: "licensed_plumber",     label: "Plumber",       emoji: "🔧" },
  { id: "carpenter",            label: "Carpenter",     emoji: "🪚" },
  { id: "tech_support",         label: "Tech Support",  emoji: "💻" },
  { id: "cdl_driver",           label: "CDL Driver",    emoji: "🚛" },
  { id: "food_handler",         label: "Food Handler",  emoji: "🍽️" },
  { id: "childcare",            label: "Childcare",     emoji: "👶" },
];

type FilterKey = "all" | "emergency" | "near";

export default function HelperDashboardScreen() {
  const [, setLocation] = useLocation();
  const { currentUser, helperModeActive, myLocation } = useAppContext();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [wsConnected, setWsConnected] = useState(() => wsIsConnected());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  // Live request list — updated via WS events
  const [liveNearby, setLiveNearby] = useState<HelpRequest[]>([]);
  const initRef = useRef(false);
  const connPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Your Guaranteed Wage card ──────────────────────────────────────────────
  // Fetches this helper's county wage floor (their community_id's override, or
  // the global platform rate if their county hasn't set one). Public endpoint,
  // no auth needed — mirrors the fetch pattern used on the county impact page.
  const [wageInfo, setWageInfo] = useState<{
    minimum_hourly_rate?: number;
    hourly_rate_is_county_override?: boolean;
    name?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
        const path = currentUser?.community_id
          ? `/api/communities/${currentUser.community_id}`
          : `/api/communities/default`;
        const res = await fetch(`${base}${path}`);
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (cancelled) return;
        const community = json.community as {
          minimum_hourly_rate?: number;
          hourly_rate_is_county_override?: boolean;
          name?: string;
        } | null;
        setWageInfo(community);
      } catch {
        // Non-fatal — the wage card simply doesn't render if this fails.
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser?.community_id]);

  const { data: nearbyRaw = [], isSuccess: nearbyLoaded } = useGetNearbyRequests(
    { lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: 10 },
    { query: { enabled: !!myLocation, queryKey: getGetNearbyRequestsQueryKey({ lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: 10 }) } }
  );

  const { data: onlineHelpersRaw = [] } = useGetOnlineHelpers(
    { lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: 10 },
    { query: { enabled: !!myLocation, queryKey: getGetOnlineHelpersQueryKey({ lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: 10 }), staleTime: 20000 } }
  );

  const { data: stats } = useGetRequestStats({
    query: { queryKey: getGetRequestStatsQueryKey(), staleTime: 15000 }
  });

  const { data: myActiveRaw = [] } = useGetRequests(
    { status: "claimed" },
    { query: { enabled: !!currentUser?.id, queryKey: getGetRequestsQueryKey({ status: "claimed" }) } }
  );

  const claimMutation = useClaimRequest();

  const { data: transactions = [] } = useGetUserTransactions(
    currentUser?.id ?? 0,
    { query: { enabled: !!currentUser?.id, queryKey: getGetUserTransactionsQueryKey(currentUser?.id ?? 0), staleTime: 60000 } }
  );

  // Seed live list from initial query result
  useEffect(() => {
    if (!nearbyLoaded) return;
    setLiveNearby(nearbyRaw as HelpRequest[]);
    if (!initRef.current) { initRef.current = true; setLastUpdated(new Date()); }
  }, [nearbyRaw, nearbyLoaded]);

  // Poll WS connectivity every 5s — wsClient has no disconnect event, only a close callback
  useEffect(() => {
    connPollRef.current = setInterval(() => setWsConnected(wsIsConnected()), 5000);
    return () => { if (connPollRef.current) clearInterval(connPollRef.current); };
  }, []);

  // Subscribe to WS for live request updates
  useWebSocket(useCallback((event) => {
    // "connected" = genuine (re)connect — resync missed events.
    // "pong" = heartbeat only — do NOT invalidate (would cause churn on every heartbeat).
    if (event.type === "connected") {
      setWsConnected(true);
      if (myLocation) {
        queryClient.invalidateQueries({
          queryKey: getGetNearbyRequestsQueryKey({ lat: myLocation.lat, lng: myLocation.lng, radius_miles: 10 }),
        });
        queryClient.invalidateQueries({ queryKey: getGetRequestStatsQueryKey() });
      }
      return;
    }
    if (event.type === "pong") {
      setWsConnected(true);
      return; // heartbeat only — no data resync
    }

    if (event.type === "REQUEST_CREATED" || event.type === "new_request") {
      const req = event.payload as HelpRequest;
      setLiveNearby(prev => prev.find(r => r.id === req.id) ? prev : [req, ...prev]);
      queryClient.invalidateQueries({ queryKey: getGetRequestStatsQueryKey() });
      setLastUpdated(new Date());
      if (helperModeActive) {
        toast({
          title: req.urgency === "emergency" ? "🚨 Emergency nearby!" : "📍 New request nearby",
          description: req.title,
        });
      }
    } else if (event.type === "REQUEST_ACCEPTED" || event.type === "REQUEST_COMPLETED" || event.type === "request_updated") {
      const req = event.payload as HelpRequest;
      setLiveNearby(prev => {
        const without = prev.filter(r => r.id !== req.id);
        return req.status === "open" ? [req, ...without] : without;
      });
      queryClient.invalidateQueries({ queryKey: getGetRequestStatsQueryKey() });
      setLastUpdated(new Date());
    }
  }, [myLocation, queryClient, helperModeActive]));

  if (!currentUser) return null;

  const nearbyRequests = liveNearby as HelpRequest[];
  const myActiveRequests = (myActiveRaw as HelpRequest[]).filter(r => r.helper_id === currentUser.id);
  const openNearby = nearbyRequests.filter(r => r.status === "open");
  const liveHelpers = (Array.isArray(onlineHelpersRaw) ? onlineHelpersRaw : []) as HelperLocation[];
  const onlineHelperCount = liveHelpers.filter(h => h.id !== currentUser.id).length;

  // Global stats from API (more authoritative for total counts across all areas)
  const globalOpenCount = stats?.total_open ?? openNearby.length;
  const globalHelperCount = stats?.total_helpers_online ?? onlineHelperCount;

  const filtered = filter === "emergency"
    ? openNearby.filter(r => r.urgency === "emergency" || r.urgency === "high")
    : filter === "near"
    ? openNearby.filter(r => (r.distance_miles ?? 99) < 2)
    : openNearby;

  const isAnchor = (currentUser.help_count ?? 0) >= 50 && (currentUser.trust_score ?? 0) >= 97;
  const helpCount = currentUser.help_count ?? 0;
  const trustScore = currentUser.trust_score ?? 0;

  // Earnings projections — based on this helper's own historical average per
  // completed task. When they have no history yet, fall back to their real
  // county (or platform) guaranteed-minimum rate — never an arbitrary made-up
  // number — so the projection is always grounded in real, server-sourced data.
  const allTxs = transactions as Transaction[];
  const earnedTxs = allTxs.filter((t: Transaction) => t.type === "earned" || (t.type as string) === "tip_received");
  const hasEarningsHistory = earnedTxs.length > 0;
  const fallbackHourlyRate = wageInfo?.minimum_hourly_rate ?? 15;
  const avgPerTask = hasEarningsHistory
    ? earnedTxs.reduce((s: number, t: Transaction) => s + t.amount, 0) / earnedTxs.length
    : fallbackHourlyRate;

  // Tier 1 — "right now": every open request actually nearby this instant.
  // 100% live data, capped so the number stays plausible for a single day.
  const nearbyOpenCount = Math.min(openNearby.length, 10);

  // Tier 2 — "a typical day for you": derived from this helper's own history
  // (distinct days with at least one completed task ÷ total completed tasks).
  // With fewer than 2 distinct active days, there isn't enough history to
  // trust an average, so it falls back to a clearly-labeled conservative
  // estimate instead of pretending to be a personalized number.
  const distinctEarnedDays = new Set(earnedTxs.map(t => new Date(t.created_at).toDateString())).size;
  const tasksPerTypicalDay = distinctEarnedDays >= 2
    ? Math.max(1, Math.round(earnedTxs.length / distinctEarnedDays))
    : 3;
  const typicalDayIsEstimate = distinctEarnedDays < 2;

  const projectionNearby = avgPerTask * nearbyOpenCount;
  const projectionTypical = avgPerTask * tasksPerTypicalDay;

  // Streak: count consecutive days with at least one earned transaction
  const earnedDates = new Set<string>(earnedTxs.map((t: Transaction) => new Date(t.created_at).toDateString()));
  let streak = 0;
  let checkDate = new Date();
  for (let i = 0; i < 30; i++) {
    if (earnedDates.has(checkDate.toDateString())) {
      streak++;
      checkDate = new Date(checkDate.getTime() - 86400000);
    } else if (i === 0) {
      checkDate = new Date(checkDate.getTime() - 86400000);
    } else break;
  }

  const recentImpact = earnedTxs.slice(0, 5);
  const pifTxs = allTxs.filter((t: Transaction) =>
    (t.description ?? "").toLowerCase().includes("pool") ||
    (t.description ?? "").toLowerCase().includes("pay-it-forward") ||
    (t.description ?? "").toLowerCase().includes("pif")
  );
  const pifTotal = pifTxs.reduce((s: number, t: Transaction) => s + t.amount, 0);

  const handleClaim = (req: HelpRequest) => {
    claimMutation.mutate(
      { id: req.id, data: { helper_id: currentUser.id } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetRequestsQueryKey() });
          toast({ title: "Request claimed!", description: `Heading to "${req.title}"` });
          setLocation(`/request/${req.id}`);
        },
        onError: (err: unknown) => {
          const serverMsg = (err as { data?: { error?: string } | null })?.data?.error;
          toast({
            title: "Failed to claim",
            ...(serverMsg ? { description: serverMsg } : {}),
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-28">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl border-b border-border">
        <div className="p-4 pt-safe flex items-center gap-3">
          <button onClick={() => setLocation("/")} className="p-2 rounded-xl hover:bg-muted transition-colors" style={{ touchAction: "manipulation" }}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-black flex items-center gap-2">
              Helper Dashboard
              {helperModeActive && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" title="Helper mode active" />}
            </h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="tabular-nums">{openNearby.length} nearby</span>
              {lastUpdated && (
                <span className="text-[10px] opacity-60">
                  · updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
          </div>
          {isAnchor && (
            <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-full shrink-0">
              <span className="text-sm">⚓</span>
              <span className="text-xs font-black text-amber-400">Anchor</span>
            </div>
          )}
        </div>

        {/* Live connection bar */}
        <div className={`px-4 pb-2.5 flex items-center gap-3 text-[10px] transition-colors ${
          wsConnected ? "text-green-400" : "text-muted-foreground"
        }`}>
          {wsConnected
            ? <Wifi className="w-3 h-3 shrink-0" />
            : <WifiOff className="w-3 h-3 shrink-0" />}
          <span className="font-bold uppercase tracking-wider">{wsConnected ? "Live" : "Reconnecting"}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            <span className="tabular-nums font-bold text-primary">{globalHelperCount}</span> helper{globalHelperCount !== 1 ? "s" : ""} online
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            <span className="tabular-nums font-bold text-yellow-400">{globalOpenCount}</span> open request{globalOpenCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Helper mode status banner */}
        {!helperModeActive && (
          <div className="bg-muted/50 border border-border rounded-2xl p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold">Helper mode is off</div>
              <div className="text-xs text-muted-foreground">Enable it from the map to start accepting requests</div>
            </div>
            <button
              onClick={() => setLocation("/")}
              style={{ touchAction: "manipulation" }}
              className="shrink-0 flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-black px-3 py-2 rounded-xl active:scale-95 transition-all"
            >
              <Navigation className="w-3.5 h-3.5" />
              Map
            </button>
          </div>
        )}

        {helperModeActive && myActiveRequests.length === 0 && openNearby.length === 0 && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
            <div>
              <div className="text-sm font-bold text-green-400">You're online and ready</div>
              <div className="text-xs text-muted-foreground">No open requests nearby right now — you'll be notified when one appears</div>
            </div>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center text-center">
            <Heart className="w-4 h-4 text-primary mb-1" />
            <div className="text-2xl font-black text-primary tabular-nums">{helpCount}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Completed</div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center text-center">
            <Star className="w-4 h-4 text-yellow-400 mb-1" />
            <div className="text-2xl font-black text-yellow-400 tabular-nums">{trustScore.toFixed(0)}%</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Trust</div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center text-center">
            <Activity className="w-4 h-4 text-green-400 mb-1" />
            <div className="text-2xl font-black text-green-400 tabular-nums">${(currentUser.benevolence_wallet ?? 0).toFixed(0)}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Earned</div>
          </div>
        </div>

        {/* No-show count — only shown once it's non-zero. Helpers can see this
            everywhere else via admin/trust-score effects but never their own
            raw count; surfacing it here gives a concrete reason if trust
            score or dispatch priority ever seems off. */}
        {(currentUser.no_show_count ?? 0) > 0 && (
          <div className="flex items-center gap-2 text-[11px] text-amber-400/90 bg-amber-400/10 border border-amber-400/25 rounded-xl px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>
              {currentUser.no_show_count} no-show{currentUser.no_show_count === 1 ? "" : "s"} on record — cancelling after claiming affects your trust score. Only claim what you can complete.
            </span>
          </div>
        )}

        {/* Daily Earnings Projection — grounded in this helper's real history
            (or their real county guaranteed-minimum rate when they have none)
            and the actual open requests nearby right now. No made-up numbers. */}
        <div className="bg-gradient-to-br from-green-500/20 via-green-500/5 to-background border border-green-500/30 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-green-400" />
            <span className="text-xs font-black uppercase tracking-widest text-green-400">Before You Start — Today's Earning Potential</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-background/50 rounded-xl p-3 text-center">
              <div className="text-xs text-muted-foreground mb-1">
                {nearbyOpenCount > 0 ? `${nearbyOpenCount} open nearby now` : "Nothing open nearby yet"}
              </div>
              <div className="text-2xl font-black text-green-400 tabular-nums">~${projectionNearby.toFixed(0)}</div>
              <div className="text-[10px] text-muted-foreground">if you claim what's live right now</div>
            </div>
            <div className="bg-background/50 rounded-xl p-3 text-center">
              <div className="text-xs text-muted-foreground mb-1">
                {typicalDayIsEstimate ? "A typical day (est.)" : "Your typical day"}
              </div>
              <div className="text-2xl font-black text-green-400 tabular-nums">~${projectionTypical.toFixed(0)}</div>
              <div className="text-[10px] text-muted-foreground">
                {typicalDayIsEstimate ? `based on ~${tasksPerTypicalDay} tasks` : `${tasksPerTypicalDay} tasks, your own average`}
              </div>
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground/70 text-center">
            {hasEarningsHistory
              ? `Based on your average of ${avgPerTask.toFixed(2)}/task across ${earnedTxs.length} completed task${earnedTxs.length === 1 ? "" : "s"}.`
              : `No completed tasks yet — estimate uses your ${fallbackHourlyRate.toFixed(2)}/hr guaranteed minimum.`}
          </div>
          {pifTotal > 0 && (
            <div className="text-[11px] text-green-400/70 text-center tabular-nums">
              ${pifTotal.toFixed(2)} earned from the PIF community pool so far
            </div>
          )}
        </div>

        {/* Your Guaranteed Wage — surfaces the county livable-wage floor so the
            "paid a livable wage for thinking of others" promise is a visible,
            specific number rather than a hidden calculation. */}
        {wageInfo?.minimum_hourly_rate != null && wageInfo.minimum_hourly_rate > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Your Guaranteed Wage
              </div>
              <div className="text-lg font-black text-foreground tabular-nums">
                ${wageInfo.minimum_hourly_rate.toFixed(2)}/hr minimum
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                {wageInfo.hourly_rate_is_county_override
                  ? `${wageInfo.name ?? "Your county"} set this rate for timed tasks`
                  : "Platform-wide rate — your county hasn't set its own floor yet"}
                {" "}· based on a single-adult cost-of-living estimate. Tenure and pool health can raise this further.
              </div>
            </div>
          </div>
        )}

        {/* Streak & Rewards */}
        <div className="flex gap-3">
          <div className={`flex-1 rounded-2xl p-4 border flex flex-col items-center text-center ${
            streak > 0 ? "bg-orange-500/15 border-orange-500/30" : "bg-card border-border"
          }`}>
            <Flame className={`w-5 h-5 mb-1 ${streak > 0 ? "text-orange-400" : "text-muted-foreground"}`} />
            <div className={`text-2xl font-black tabular-nums ${streak > 0 ? "text-orange-400" : "text-muted-foreground"}`}>{streak}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Day Streak</div>
            {streak >= 3 && <div className="text-[9px] text-orange-400 mt-0.5 font-bold">🔥 On Fire!</div>}
            {streak >= 7 && <div className="text-[9px] text-amber-400 font-bold">⭐ Weekly Legend</div>}
          </div>
          <div className="flex-1 bg-card border border-border rounded-2xl p-4 flex flex-col items-center text-center">
            <Users className="w-5 h-5 text-purple-400 mb-1" />
            <div className="text-2xl font-black text-purple-400 tabular-nums">{helpCount + (currentUser.goodwill_score ?? 0)}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Lives Touched</div>
          </div>
        </div>

        {/* Benevolence Impact Feed */}
        {recentImpact.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-green-400" /> Benevolence Impact
            </h3>
            <div className="space-y-2">
              {recentImpact.map((tx: Transaction) => (
                <div key={tx.id} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-green-500/15 flex items-center justify-center shrink-0">
                    <Heart className="w-3.5 h-3.5 text-green-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{tx.description ?? "Help completed"}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(tx.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                  </div>
                  <div className="text-sm font-black text-green-400 shrink-0 tabular-nums">+${tx.amount.toFixed(2)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills */}
        {(currentUser.specialties?.length ?? 0) > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-primary" /> Your Skills
            </h3>
            <div className="flex flex-wrap gap-2">
              {currentUser.specialties!.map((skill: string) => {
                const match = ALL_SKILLS.find(s => s.id === skill.toLowerCase().replace(/\s+/g, "_"));
                return (
                  <span key={skill} className="flex items-center gap-1 text-xs font-bold bg-primary/10 text-primary border border-primary/20 px-3 py-1.5 rounded-full">
                    {match?.emoji ?? "✦"} {match?.label ?? skill}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Active claims */}
        {myActiveRequests.length > 0 && (
          <div className="bg-card border border-primary/30 rounded-2xl p-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-3 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" /> Active Claims ({myActiveRequests.length})
            </h3>
            <div className="space-y-2">
              {myActiveRequests.map(req => (
                <button
                  key={req.id}
                  onClick={() => setLocation(`/request/${req.id}`)}
                  style={{ touchAction: "manipulation" }}
                  className="w-full text-left bg-primary/5 rounded-xl p-3 border border-primary/20 hover:border-primary/50 active:scale-[0.99] transition-all"
                >
                  <div className="font-bold text-sm truncate">{req.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${URGENCY_COLORS[req.urgency ?? "low"]}`}>
                      {req.urgency}
                    </span>
                    <span>{CATEGORY_LABELS[req.category ?? "other"] ?? req.category}</span>
                    {req.distance_miles != null && <span>· {req.distance_miles.toFixed(1)} mi</span>}
                  </div>
                  <div className="text-[10px] text-primary mt-1 font-bold">Tap to track →</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Available requests queue */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              Nearby Queue
              {openNearby.length > 0 && (
                <span className="bg-primary/15 text-primary text-[10px] font-black px-1.5 py-0.5 rounded-full tabular-nums">
                  {filtered.length}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              {/* Refresh button */}
              <button
                onClick={() => {
                  if (!myLocation) return;
                  queryClient.invalidateQueries({
                    queryKey: getGetNearbyRequestsQueryKey({ lat: myLocation.lat, lng: myLocation.lng, radius_miles: 10 }),
                  });
                }}
                style={{ touchAction: "manipulation" }}
                className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors"
                title="Refresh requests"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
          </div>

          <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4">
            {([
              { key: "all" as FilterKey,       label: "All" },
              { key: "emergency" as FilterKey, label: "🚨 Urgent" },
              { key: "near" as FilterKey,      label: "📍 < 2 mi" },
            ]).map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{ touchAction: "manipulation", minHeight: "44px" }}
                className={`shrink-0 flex items-center justify-center text-xs font-bold px-4 py-2.5 rounded-2xl border transition-all active:scale-95 whitespace-nowrap ${
                  filter === f.key
                    ? "bg-primary text-primary-foreground border-primary shadow-[0_0_10px_rgba(0,212,255,0.25)]"
                    : "bg-muted/80 border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MapPin className="w-6 h-6 mx-auto mb-2 opacity-30" />
              <p className="text-sm">
                {filter === "all" ? "No open requests nearby right now" : "No requests match this filter"}
              </p>
              <p className="text-xs mt-1 opacity-60">You'll be notified when new requests appear</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {filtered.slice(0, 15).map(req => (
                <motion.div
                  key={req.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`mb-2 rounded-xl border p-3 ${
                    req.urgency === "emergency"
                      ? "bg-destructive/10 border-destructive/30"
                      : "bg-muted/30 border-border"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{req.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${URGENCY_COLORS[req.urgency ?? "low"]}`}>
                          {req.urgency}
                        </span>
                        <span>{CATEGORY_LABELS[req.category ?? "other"] ?? req.category}</span>
                        {req.distance_miles != null && (
                          <span className="font-semibold">{req.distance_miles.toFixed(1)} mi</span>
                        )}
                        {req.requester_name && <span>· {req.requester_name}</span>}
                      </div>
                      {(req.category === "childcare" || req.category === "senior_care" || req.category === "medical") && (
                        <div className="text-[10px] text-amber-400 mt-0.5 flex items-center gap-1">
                          🛡️ Verified helper preferred
                        </div>
                      )}
                      {req.created_at && (
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {Math.round((Date.now() - new Date(req.created_at).getTime()) / 60000)} min ago
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                      {/* Payment type badge + projected earnings before claiming */}
                      {(req as HelpRequest & { payment_type?: string; pay_it_forward_amount?: number }).payment_type === "immediate" &&
                        (req as HelpRequest & { pay_it_forward_amount?: number }).pay_it_forward_amount ? (
                        <div className="flex items-center gap-0.5 text-[10px] font-black text-green-400 bg-green-400/10 border border-green-400/20 px-1.5 py-0.5 rounded-full tabular-nums">
                          <DollarSign className="w-2.5 h-2.5" />
                          ${((req as HelpRequest & { pay_it_forward_amount?: number }).pay_it_forward_amount!).toFixed(2)}
                        </div>
                      ) : (req as HelpRequest & { payment_type?: string }).payment_type === "pay_it_forward" ? (
                        <div
                          className="flex flex-col items-end gap-0.5"
                          title={`Pool guarantees at least ${(wageInfo?.minimum_hourly_rate ?? 15).toFixed(2)}/hr — your projected pay for this task`}
                        >
                          <div className="flex items-center gap-0.5 text-[10px] font-black text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-full">
                            <Coins className="w-2.5 h-2.5" />
                            Pool pays
                          </div>
                          {/* Projected earnings: hourly_rate × estimated_hours.
                              Falls back to 1.0 hr only when the requester didn't provide
                              an estimate — prefixed with "~" so helpers can tell the
                              difference between a real estimate and a default. */}
                          {(() => {
                            const hours = (req as HelpRequest & { estimated_hours?: number }).estimated_hours;
                            const rate = wageInfo?.minimum_hourly_rate ?? 15;
                            const proj = rate * (hours ?? 1);
                            return (
                              <div className="text-[9px] text-muted-foreground tabular-nums">
                                {hours ? `~${proj.toFixed(2)} (${hours}h)` : `~${proj.toFixed(2)} est.`}
                              </div>
                            );
                          })()}
                        </div>
                      ) : null}
                      {helperModeActive && (
                        <button
                          onClick={() => handleClaim(req)}
                          disabled={claimMutation.isPending}
                          style={{ touchAction: "manipulation", minHeight: "44px" }}
                          className="shrink-0 bg-primary text-primary-foreground text-xs font-black px-3 py-2 rounded-xl disabled:opacity-50 active:scale-95 transition-all shadow-[0_0_8px_rgba(0,212,255,0.2)]"
                        >
                          {claimMutation.isPending ? "…" : "Claim"}
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Anchor Program progress */}
        {isAnchor ? (
          <div className="bg-gradient-to-br from-amber-500/20 to-background border border-amber-500/30 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">⚓</span>
              <div>
                <div className="font-black text-sm text-amber-400">You're an Anchor Helper</div>
                <div className="text-xs text-muted-foreground">Top pillar of the Niakofa community</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Anchor Helpers are the backbone of Niakofa. New helpers in your area look to you as an informal mentor. Your consistency and high trust score make this community stronger every day.
            </p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Award className="w-4 h-4 text-primary" />
              <div className="font-bold text-sm">Path to Anchor Helper ⚓</div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Helps completed</span>
                  <span className="font-bold tabular-nums">{helpCount} / 50</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min((helpCount / 50) * 100, 100)}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Trust score</span>
                  <span className="font-bold tabular-nums">{trustScore.toFixed(0)}% / 97%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-yellow-400 rounded-full transition-all" style={{ width: `${Math.min((trustScore / 97) * 100, 100)}%` }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
