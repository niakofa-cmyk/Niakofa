import React, { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useIsAnimationSuppressed } from "@/hooks/useAnimationPreference";
import { useNiaStory } from "@/hooks/useNiaStory";
import { authHeaders } from "@/lib/auth";
import { useAppContext } from "@/lib/AppContext";
import LiveLeaderboard from "@/components/LiveLeaderboard";
import { Users, Heart, Star, Sparkles, Activity, DollarSign, Shield, PlusCircle, X, Send, ChevronDown, MapPin, Award, Wrench, Globe, Mic, MicOff, Loader2, CheckCircle2, RefreshCw, Clock, AlertTriangle, ClipboardList, Radio } from "lucide-react";
import { contributeToPool, useGetRequests, useGetRequestStats, getGetRequestsQueryKey, getGetRequestStatsQueryKey, useGetPoolStats, getGetPoolStatsQueryKey, useGetPoolLedger, getGetPoolLedgerQueryKey } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { useWebSocket } from "@/lib/useWebSocket";
import { useGetSponsorHistory } from "@/hooks/useGetSponsorHistory";
import { StripePaymentModal, isStripeConfigured } from "@/components/StripePaymentModal";
import { MAX_POOL_AMOUNT, MIN_POOL_AMOUNT, PoolContributionPanel } from "@/components/PoolContributionPanel";
import { CommunityPoolFinancialBreakdown } from "@/components/CommunityPoolFinancialBreakdown";

interface GratitudePost {
  id: number;
  author_name: string;
  author_avatar?: string | null;
  helper_name?: string | null;
  message: string;
  request_title?: string | null;
  likes: number;
  created_at: string;
}

function formatPoolCurrency(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0);
  return (Number.isFinite(amount) ? amount : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function createPoolIdempotencyKey(scope: "contribution" | "donation"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `pool-${scope}-${crypto.randomUUID()}`;
  }
  return `pool-${scope}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createPoolPaymentReturnUrl(scope: "contribution" | "donation"): string | undefined {
  if (typeof window === "undefined") return undefined;
  const url = new URL(window.location.href);
  url.searchParams.set("pool_payment_return", scope);
  return url.toString();
}

const CATEGORY_LABELS: Record<string, string> = {
  groceries: "🛒 Groceries",
  transportation: "🚗 Transportation",
  errands: "📦 Errands",
  home_repair: "🔧 Home Repair",
  medical: "🏥 Medical",
  emergency: "🚨 Emergency",
  moving_labor: "📦 Moving & Labor",
  pet_care: "🐾 Pet Care",
  childcare: "🧸 Childcare",
  senior_care: "🧓 Senior Care",
  yard_work: "🌿 Yard Work",
  tutoring: "📚 Tutoring",
  cleaning: "🧹 Cleaning",
  meal_prep: "🍲 Meal Prep",
  paperwork: "📄 Paperwork",
  local_farm: "🌾 Local Farm",
  food_pantry: "🥫 Food Pantry",
  stock_shelves: "📦 Stock Shelves",
  event_setup: "🎪 Event Setup",
  delivery_run: "🚚 Delivery Run",
  tech_support: "💻 Tech Support",
  business_services: "💼 Business Services",
  legal_aid: "⚖️ Legal Aid",
  financial_coaching: "💰 Financial Help",
  job_assistance: "👔 Job Search Help",
  language_help: "🌐 Translation / Interpretation",
  mental_health_peer: "💜 Peer Support",
  technology_help: "📱 Technology Help",
  other: "💙 Other",
};

type Tab = "feed" | "heroes" | "pool" | "county" | "impact" | "resources" | "circles" | "skills";

interface CommunityStats {
  id: number;
  name: string;
  target_reserve_amount: number;
  pool_balance: number;
  pool_health_ratio: number;
  pool_pct: number;
  member_count: number;
  total_contributed: number;
  total_paid_to_helpers: number;
  total_repaid: number;
  helpers_paid: number;
  sponsor_count: number;
  inflow_30d: number;
  outflow_30d: number;
  helpers_earned_7d?: number;
  helpers_paid_7d?: number;
  /** This county's resolved livable-wage floor ($/hr) — county override if set, else the global platform rate. */
  minimum_hourly_rate?: number;
  /** True when this county set its own rate rather than inheriting the global default. */
  hourly_rate_is_county_override?: boolean;
  county?: string | null;
  state?: string | null;
  created_at: string;
}

interface LedgerEntry {
  id: number;
  entry_type: string;
  amount: number;
  description: string | null;
  created_at: string;
}


interface CivicResource {
  id: number;
  org_name: string;
  category: string | null;
  description: string | null;
  address: string | null;
  phone: string | null;
  url: string;
  open_hours: string | null;
  coverage_status?: string;
  is_authoritative?: boolean;
}

interface CivicResourcesResponse {
  resources: CivicResource[];
  place_name?: string;
  match_level?: "city" | "county" | "state" | "fallback";
}

const CIVIC_ICONS: Record<string, string> = {
  shelter: "🏠", food: "🍱", medical: "💊", mental_health: "🧠",
  legal: "⚖️", financial: "💰", employment: "💼", transportation: "🚌",
  childcare: "👶", education: "📚", local_farm: "🍎", other: "💙",
};

interface SuggestionForm {
  name: string;
  category: string;
  description: string;
  phone: string;
  website: string;
}

function CivicResourcesTab() {
  const [resources, setResources] = useState<CivicResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestionSent, setSuggestionSent] = useState(false);
  const [locationRequired, setLocationRequired] = useState(false);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<SuggestionForm>({
    name: "", category: "other", description: "", phone: "", website: "",
  });

  const submitSuggestion = async () => {
    if (!suggestion.name.trim()) return;
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      await fetch(`${base}/api/civic/suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(suggestion),
      });
    } catch {}
    setSuggestionSent(true);
    setTimeout(() => { setShowSuggest(false); setSuggestionSent(false); setSuggestion({ name: "", category: "other", description: "", phone: "", website: "" }); }, 2000);
  };

  const loadResources = useCallback(() => {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    setLoading(true);
    if (!navigator.geolocation) {
      setLocationRequired(true);
      setLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        fetch(`${base}/api/civic/resources?lat=${encodeURIComponent(coords.latitude)}&lng=${encodeURIComponent(coords.longitude)}`)
          .then(async (response) => {
            if (!response.ok) throw new Error("Unable to resolve resources");
            return response.json() as Promise<CivicResourcesResponse>;
          })
          .then((data) => {
            setResources(Array.isArray(data.resources) ? data.resources : []);
            setLocationLabel(data.place_name ?? null);
            setLocationRequired(false);
          })
          .catch(() => setResources([]))
          .finally(() => setLoading(false));
      },
      () => {
        setLocationRequired(true);
        setLoading(false);
      },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 8000 },
    );
  }, []);

  useEffect(() => {
    loadResources();
  }, [loadResources]);

  const categories = [
    "all",
    ...Array.from(new Set(
      resources
        .map(r => r.category)
        .filter((cat): cat is string => Boolean(cat)),
    )),
  ];
  const filtered = category === "all" ? resources : resources.filter(r => r.category === category);

  if (loading && resources.length === 0) return (
    <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (resources.length === 0) return (
    <div className="text-center py-16 px-4">
      <div className="text-4xl mb-3">🏛️</div>
      <div className="font-bold text-sm text-muted-foreground">
        {locationRequired ? "Location is needed to show local resources" : "No verified resources found for this area"}
      </div>
      <div className="text-xs text-muted-foreground/60 mt-1">
        {locationRequired
          ? "Allow location access so Niakofa can keep civic resources in the right jurisdiction."
          : `We searched ${locationLabel ?? "your area"} without showing unrelated results.`}
      </div>
      {locationRequired && (
        <button
          onClick={loadResources}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Try location again
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Category filter — min 44px touch targets for mobile */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            style={{ touchAction: "manipulation", minHeight: "44px" }}
            className={`shrink-0 flex items-center justify-center text-xs font-bold px-4 py-2.5 rounded-2xl border transition-all capitalize active:scale-95 whitespace-nowrap ${
              category === cat
                ? "bg-primary text-primary-foreground border-primary shadow-[0_0_10px_rgba(0,212,255,0.25)]"
                : "bg-muted/80 border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {cat === "all" ? "All" : cat.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {filtered.map(r => (
        <div key={r.id} className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-lg shrink-0">
               {CIVIC_ICONS[r.category ?? "other"] ?? "💙"}
            </div>
            <div className="flex-1 min-w-0">
           <div className="font-black text-sm">{r.org_name}</div>
              {r.description && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{r.description}</p>}
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                {r.address && <span className="text-[10px] text-muted-foreground">📍 {r.address}</span>}
                 {r.open_hours && <span className="text-[10px] text-muted-foreground">🕐 {r.open_hours}</span>}
              </div>
              <div className="flex gap-2 mt-3">
                {r.phone && (
                  <a href={`tel:${r.phone}`} className="flex items-center gap-1 text-xs text-primary font-bold bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-full active:scale-95 transition-all">
                    📞 Call
                  </a>
                )}
                 {r.url && (
                   <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground font-bold bg-muted border border-border px-3 py-1.5 rounded-full active:scale-95 transition-all">
                    🌐 Website
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Suggest a resource — §3.3.2 */}
      <button
        onClick={() => setShowSuggest(true)}
        className="w-full flex items-center justify-center gap-2 p-3 border border-dashed border-primary/30 rounded-2xl text-sm text-primary/70 hover:text-primary hover:border-primary/60 transition-all"
      >
        <PlusCircle className="w-4 h-4" />
        Know a resource we're missing? Suggest it
      </button>

      {/* Suggestion modal */}
      <AnimatePresence>
        {showSuggest && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
              onClick={() => setShowSuggest(false)}
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 220 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-3xl max-h-[80dvh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 pb-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-primary" />
                  <h3 className="font-black text-lg">Suggest a Resource</h3>
                </div>
                <button onClick={() => setShowSuggest(false)} className="p-2 rounded-full hover:bg-muted transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {suggestionSent ? (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-3">🙏</div>
                    <div className="font-black text-lg">Thank you!</div>
                    <p className="text-sm text-muted-foreground mt-1">Your suggestion will be reviewed by the Niakofa team.</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Organization Name *</label>
                      <input
                        className="mt-1.5 w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
                        placeholder="e.g. Tarrant County Food Bank"
                        value={suggestion.name}
                        onChange={e => setSuggestion(s => ({ ...s, name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Category</label>
                      <select
                        className="mt-1.5 w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
                        value={suggestion.category}
                        onChange={e => setSuggestion(s => ({ ...s, category: e.target.value }))}
                      >
                        {Object.entries(CIVIC_ICONS).map(([k, icon]) => (
                          <option key={k} value={k}>{icon} {k.replace(/_/g, " ")}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Description</label>
                      <textarea
                        className="mt-1.5 w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-primary transition-colors min-h-[80px] resize-none"
                        placeholder="What services do they provide?"
                        value={suggestion.description}
                        onChange={e => setSuggestion(s => ({ ...s, description: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Phone</label>
                        <input
                          className="mt-1.5 w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
                          placeholder="(817) 555-0000"
                          value={suggestion.phone}
                          onChange={e => setSuggestion(s => ({ ...s, phone: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Website</label>
                        <input
                          className="mt-1.5 w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
                          placeholder="https://..."
                          value={suggestion.website}
                          onChange={e => setSuggestion(s => ({ ...s, website: e.target.value }))}
                        />
                      </div>
                    </div>
                    <button
                      onClick={submitSuggestion}
                      disabled={!suggestion.name.trim()}
                      className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold py-3.5 rounded-xl disabled:opacity-40 transition-all active:scale-[0.98]"
                    >
                      <Send className="w-4 h-4" />
                      Submit Suggestion
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

interface NeighborhoodInfo {
  id: number;
  neighborhood_id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  city_key: string;
  city_display: string;
}

interface NeighborhoodLiveStatus {
  session_id: number | null;
  host_name: string | null;
  speaker_count: number;
  listener_count: number;
  video_enabled: boolean;
}

function NeighborhoodCirclesTab() {
  const [, setLocation] = useLocation();
  const { currentUser } = useAppContext();
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const city = currentUser?.city?.trim() || "Fort Worth";
  const userHood = currentUser?.neighborhood?.toLowerCase().replace(/\s+/g, "_");

  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodInfo[]>([]);
  const [hoodLoading, setHoodLoading] = useState(true);
  const [hoodError, setHoodError] = useState(false);

  // Fetch real neighborhoods for the user's city (auto-provisioned by the
  // backend for any city — not just Fort Worth). Falls back gracefully on
  // error so the city-wide Circle card below still works.
  useEffect(() => {
    let cancelled = false;
    setHoodLoading(true);
    setHoodError(false);
    fetch(`${base}/api/community/neighborhoods?city=${encodeURIComponent(city)}`, { headers: authHeaders() })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: { neighborhoods?: NeighborhoodInfo[] }) => {
        if (cancelled) return;
        setNeighborhoods(Array.isArray(data.neighborhoods) ? data.neighborhoods : []);
        setHoodLoading(false);
      })
      .catch(() => { if (!cancelled) { setHoodError(true); setHoodLoading(false); } });
    return () => { cancelled = true; };
  }, [base, city]);

  // Fetch live circle data so cards show real-time status
  const [liveByHood, setLiveByHood] = useState<Map<string, NeighborhoodLiveStatus>>(new Map());
  const [fetchedCity, setFetchedCity] = useState<string | null>(null);

  useEffect(() => {
    if (fetchedCity === city) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${base}/api/audio-circles?city=${encodeURIComponent(city)}`, { headers: authHeaders() });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const map = new Map<string, NeighborhoodLiveStatus>();
        for (const circle of data.circles ?? []) {
          const key = (circle.neighborhood_name ?? "").toLowerCase().replace(/\s+/g, "_");
          if (key) {
            map.set(key, {
              session_id: circle.live_session?.id ?? null,
              host_name: circle.live_session?.host_name ?? null,
              speaker_count: circle.live_session?.speaker_count ?? 0,
              listener_count: circle.live_session?.listener_count ?? 0,
              video_enabled: circle.live_session?.video_enabled ?? false,
            });
          }
        }
        if (!cancelled) { setLiveByHood(map); setFetchedCity(city); }
      } catch { /* non-critical */ }
    })();
    return () => { cancelled = true; };
  }, [base, city, fetchedCity]);

  const hoodKey = (n: NeighborhoodInfo) => (n.neighborhood_id || n.name).toLowerCase().replace(/\s+/g, "_");

  const openCircle = (hood: NeighborhoodInfo) => {
    const key = hoodKey(hood);
    const live = liveByHood.get(key);
    if (live?.session_id) {
      setLocation(`/audio-circle/${live.session_id}`);
    } else {
      setLocation(`/audio-circles?neighborhood=${encodeURIComponent(hood.name)}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-primary/20 via-primary/5 to-background border border-primary/30 rounded-2xl p-4">
        <h3 className="font-black text-sm flex items-center gap-2 mb-1">
          <MapPin className="w-4 h-4 text-primary" /> Neighborhood Circles
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Tap your neighborhood to join or host a live Circle — voice and video rooms where neighbors talk in real time.
        </p>
      </div>

      {hoodLoading && (
        <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading neighborhoods…</span>
        </div>
      )}

      {!hoodLoading && hoodError && neighborhoods.length === 0 && (
        <div className="bg-card/50 border border-dashed border-border rounded-2xl p-6 text-center space-y-2">
          <AlertTriangle className="w-8 h-8 text-muted-foreground/40 mx-auto" />
          <div className="text-sm font-bold text-muted-foreground">Couldn't load neighborhoods</div>
          <div className="text-xs text-muted-foreground/60">We had trouble reaching the server. You can still browse all circles below.</div>
        </div>
      )}

      {neighborhoods.map((hood, i) => {
        const key = hoodKey(hood);
        const isYours = userHood === key || currentUser?.neighborhood?.toLowerCase() === hood.name.toLowerCase();
        const live = liveByHood.get(key);
        const isLive = !!live?.session_id;
        return (
          <motion.div
            key={hood.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className={`bg-card border rounded-2xl p-4 cursor-pointer transition-all active:scale-[0.98] ${
              isLive
                ? "border-red-500/50 bg-red-500/5"
                : isYours
                  ? "border-primary/60 bg-primary/5"
                  : "border-border hover:border-primary/30"
            }`}
            onClick={() => openCircle(hood)}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-xl shrink-0">
                {hood.emoji ?? "🏘️"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-black text-sm">{hood.name}</div>
                  {isYours && !isLive && (
                    <span className="text-[10px] font-black text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                      Your Circle
                    </span>
                  )}
                  {isLive && (
                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 flex items-center gap-1">
                      <Radio className="w-2.5 h-2.5" /> Live
                    </span>
                  )}
                </div>
                {isLive && live ? (
                  <div className="mt-1 space-y-0.5">
                    <div className="text-xs text-muted-foreground">
                      Hosted by <span className="font-bold text-foreground">{live.host_name}</span>
                      {live.video_enabled && <span className="ml-1 text-[10px] text-primary">· 🎥 Video</span>}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Mic className="w-3 h-3" /> {live.speaker_count} speaker{live.speaker_count !== 1 ? "s" : ""}</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {live.listener_count} audience</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground mt-0.5">{hood.description ?? "Neighborhood Circle"}</div>
                )}
              </div>
              {isLive ? (
                <div className="shrink-0">
                  <span className="text-xs font-black text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-1.5 rounded-xl">Join</span>
                </div>
              ) : (
                <div className="shrink-0">
                  <span className="text-xs font-bold text-muted-foreground bg-muted px-3 py-1.5 rounded-xl">Host</span>
                </div>
              )}
            </div>
          </motion.div>
        );
      })}

      <div
        onClick={() => setLocation("/audio-circles")}
        className="bg-gradient-to-br from-primary/15 via-card to-card border border-primary/30 rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:border-primary/50 transition-colors"
      >
        <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Radio className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-black">Browse all Circles</div>
          <div className="text-xs text-muted-foreground mt-0.5">See all neighborhoods + a city-wide Circle for all of {currentUser?.city?.trim() || "your city"}.</div>
        </div>
      </div>
    </div>
  );
}

const SKILLS_DIRECTORY = [
  { id: "bilingual",            label: "Bilingual",    emoji: "🌐", desc: "Spanish, Vietnamese, or other language support", cats: ["groceries","errands","medical"] },
  { id: "truck_owner",          label: "Truck Owner",  emoji: "🚛", desc: "Move furniture, haul supplies, or transport large items", cats: ["transportation","errands","stock_shelves"] },
  { id: "medical_background",   label: "Medical",      emoji: "🏥", desc: "Healthcare worker, EMT, nurse, or caregiver experience", cats: ["medical","emergency"] },
  { id: "licensed_electrician", label: "Electrician",  emoji: "⚡", desc: "Safe assistance with electrical needs and home repairs", cats: ["home_repair"] },
  { id: "licensed_plumber",     label: "Plumber",      emoji: "🔧", desc: "Pipe repairs, leak fixes, and plumbing emergencies", cats: ["home_repair"] },
  { id: "carpenter",            label: "Carpenter",    emoji: "🪚", desc: "Woodworking, furniture assembly, and construction", cats: ["home_repair","event_setup"] },
  { id: "tech_support",         label: "Tech Support", emoji: "💻", desc: "Computer setup, smartphone help, device troubleshooting", cats: ["tech_support"] },
  { id: "cdl_driver",           label: "CDL Driver",   emoji: "🚚", desc: "Commercial driver's license — large vehicle expertise", cats: ["transportation","delivery_run"] },
  { id: "food_handler",         label: "Food Handler", emoji: "🍽️", desc: "Safe food preparation and handling certified", cats: ["errands","event_setup"] },
  { id: "childcare",            label: "Childcare",    emoji: "👶", desc: "Experienced in caring for children", cats: ["other"] },
];

const CAT_LABELS: Record<string, string> = {
  groceries: "Groceries", transportation: "Transport", errands: "Errands",
  home_repair: "Home Repair", medical: "Medical", emergency: "Emergency",
  stock_shelves: "Stocking", event_setup: "Events", delivery_run: "Delivery",
  tech_support: "Tech", other: "General",
};

function SkillsMarketplaceTab() {
  const [active, setActive] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-primary/20 via-primary/5 to-background border border-primary/30 rounded-2xl p-4">
        <h3 className="font-black text-sm flex items-center gap-2 mb-1">
          <Wrench className="w-4 h-4 text-primary" /> Skills Directory
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Helpers tag their specialties so requesters find the right person. Skill-matched requests get dispatch priority.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {SKILLS_DIRECTORY.map(skill => (
          <motion.button
            key={skill.id}
            onClick={() => setActive(active === skill.id ? null : skill.id)}
            whileTap={{ scale: 0.97 }}
            className={`text-left rounded-2xl border p-3 transition-all ${
              active === skill.id ? "border-primary/60 bg-primary/10" : "border-border bg-card hover:border-primary/30"
            }`}
          >
            <div className="text-2xl mb-1.5">{skill.emoji}</div>
            <div className="font-black text-xs">{skill.label}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{skill.desc}</div>
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {active && SKILLS_DIRECTORY.find(s => s.id === active) && (() => {
          const skill = SKILLS_DIRECTORY.find(s => s.id === active)!;
          return (
            <motion.div
              key={skill.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="bg-card border border-primary/30 rounded-2xl p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">{skill.emoji}</span>
                <div>
                  <div className="font-black text-sm">{skill.label}</div>
                  <div className="text-xs text-muted-foreground">{skill.desc}</div>
                </div>
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Helps With</div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {skill.cats.map(cat => (
                  <span key={cat} className="text-[10px] font-bold bg-muted border border-border px-2 py-1 rounded-full">
                    {CAT_LABELS[cat] ?? cat}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Add this skill in Profile → Settings to get matched with relevant requests automatically.
              </p>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      <div className="bg-card/50 border border-dashed border-border rounded-2xl p-4 text-center">
        <Award className="w-5 h-5 text-primary/40 mx-auto mb-2" />
        <div className="text-sm font-bold text-muted-foreground">Add skills in Profile Settings</div>
        <div className="text-xs text-muted-foreground/60 mt-1">Skill-matched helpers get priority in dispatch</div>
      </div>
    </div>
  );
}

// ── Phase 7c: NiaStoryModal ────────────────────────────────────────────────
function NiaStoryModal({ onClose, onPosted }: { onClose: () => void; onPosted: (story: string) => void }) {
  const { currentUser } = useAppContext();
  const suppressed = useIsAnimationSuppressed();
  const userName = currentUser?.name ?? "A neighbor";
  const { state, story, error, transcript, startRecording, stopAndSubmit, reset } = useNiaStory(userName);

  const [posting, setPosting] = React.useState(false);
  const [postError, setPostError] = React.useState<string | null>(null);

  const handlePost = async () => {
    if (!story || !currentUser) return;
    setPosting(true);
    setPostError(null);
    try {
      const res = await fetch("/api/gratitude", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          message: story.story,
        }),
      });
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => ({}));
        const message = typeof data === "object" && data !== null && "error" in data
          && typeof data.error === "string"
          ? data.error
          : `Post failed (${res.status})`;
        throw new Error(message);
      }
      onPosted(story.story);
      onClose();
    } catch (err: unknown) {
      setPostError(err instanceof Error ? err.message : "Failed to post story. Try again.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-background rounded-t-3xl p-6 pb-10 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="font-black text-base">Share Your Story</div>
            <div className="text-xs text-muted-foreground">Nia will polish your words into a community post</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>

        {state === "idle" && (
          <button
            onClick={startRecording}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-2xl py-4 font-bold text-sm"
          >
            <Mic className="w-5 h-5" /> Tap to Record
          </button>
        )}

        {state === "recording" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-primary font-semibold">
              <span className={`w-2 h-2 rounded-full bg-red-500${suppressed ? "" : " animate-pulse"}`} />
              Recording… speak naturally
            </div>
            {transcript && <p className="text-xs text-muted-foreground italic leading-relaxed">"{transcript}"</p>}
            <button
              onClick={() => stopAndSubmit()}
              className="w-full flex items-center justify-center gap-2 bg-muted border border-border rounded-2xl py-3 font-bold text-sm"
            >
              <MicOff className="w-4 h-4" /> Done — let Nia craft it
            </button>
          </div>
        )}

        {state === "processing" && (
          <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm">
            <Loader2 className="w-5 h-5 animate-spin" /> Nia is crafting your story…
          </div>
        )}

        {state === "done" && story && (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs text-green-400 font-semibold">
              <CheckCircle2 className="w-4 h-4" /> Nia crafted your story
            </div>
            <div className="bg-muted rounded-2xl p-4 text-sm leading-relaxed text-foreground">
              "{story.story}"
            </div>
            <div className="flex gap-2">
              <button
                onClick={reset}
                className="flex-1 border border-border rounded-2xl py-3 text-sm font-bold text-muted-foreground hover:bg-muted"
              >
                Re-record
              </button>
              <button
                onClick={handlePost}
                disabled={posting}
                className="flex-2 bg-primary text-primary-foreground rounded-2xl px-6 py-3 text-sm font-bold flex items-center gap-2 disabled:opacity-70"
              >
                {posting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Posting…</>
                ) : (
                  <><Send className="w-4 h-4" /> Post to Community</>
                )}
              </button>
              {postError && <p className="text-xs text-destructive mt-1">{postError}</p>}
            </div>
          </div>
        )}

        {state === "error" && (
          <div className="space-y-3">
            <div className="text-xs text-destructive">{error ?? "Something went wrong."}</div>
            <button onClick={reset} className="w-full border border-border rounded-2xl py-3 text-sm font-bold">Try Again</button>
          </div>
        )}
      </div>
    </div>
  );
}


export default function CommunityScreen() {
  const [, setLocation] = useLocation();
  const initialTab = (() => {
    if (typeof window === "undefined") return "feed" as Tab;
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    const valid: Tab[] = ["feed", "heroes", "pool", "county", "impact", "resources", "circles", "skills"];
    return t && valid.includes(t) ? t : "feed";
  })();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [showNiaStory, setShowNiaStory] = useState(false);
  const [likedPosts, setLikedPosts] = useState<Set<number>>(new Set());
  const [posts, setPosts] = useState<GratitudePost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const { currentUser, niaEnabled } = useAppContext();
  const sponsorHistory = useGetSponsorHistory(currentUser?.id ?? null);

  // Load initial gratitude posts from API.
  // Guard: only replace the posts list when the API returns a valid array —
  // an error response (object/null) must not wipe posts already displayed
  // (flash-empty: user sees content disappear, then nothing, on a transient error).
  useEffect(() => {
    fetch(`${base}/api/gratitude`)
      .then(r => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setPosts(data as GratitudePost[]);
        }
        setPostsLoading(false);
      })
      .catch(() => setPostsLoading(false));
  }, [base]);

  // Real-time: new gratitude post arrives
  useWebSocket("new_gratitude", (event) => {
    const post = event.payload as GratitudePost;
    setPosts(prev => [post, ...prev.slice(0, 49)]);
  });

  // Real-time: like count update
  useWebSocket("gratitude_liked", (event) => {
    const { id, likes } = event.payload as { id: number; likes: number };
    setPosts(prev => prev.map(p => p.id === id ? { ...p, likes } : p));
  });

  const { data: rawRecentCompleted } = useGetRequests(
    { status: "completed" },
    { query: { queryKey: getGetRequestsQueryKey({ status: "completed" }), staleTime: 60000 } }
  );
  // Defensive: useGetRequests is typed HelpRequest[] but guard against API shape drift
  const recentCompleted = Array.isArray(rawRecentCompleted) ? rawRecentCompleted : [];

  const { data: stats } = useGetRequestStats({
    query: { queryKey: getGetRequestStatsQueryKey(), staleTime: 30000 }
  });

  // ── County portal: default community stats + ledger ──────────────────────
  const [countyData, setCountyData] = useState<CommunityStats | null>(null);
  const [countyLedger, setCountyLedger] = useState<LedgerEntry[]>([]);
  const [countyLoading, setCountyLoading] = useState(false);
  const [countyLoaded, setCountyLoaded] = useState(false);

  const loadCountyData = useCallback(async () => {
    if (countyLoading) return;
    setCountyLoading(true);
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const res = await fetch(`${base}/api/communities/default`);
      if (res.ok) {
        const json = await res.json();
        const community: CommunityStats | null = json.community ?? null;
        setCountyData(community);
        if (community) {
          const lr = await fetch(`${base}/api/communities/${community.id}/ledger`);
          if (lr.ok) {
            const lj = await lr.json();
            setCountyLedger(lj.entries ?? []);
          }
        }
      }
    } catch {
      // swallow — county portal is non-critical
    } finally {
      setCountyLoading(false);
      setCountyLoaded(true);
    }
  }, [countyLoading]);

  useEffect(() => {
    if (tab === "county" && !countyLoaded) {
      loadCountyData();
    }
  }, [tab, countyLoaded, loadCountyData]);

  // ── Community Pool: live stats, transparency ledger, contribute flow ──────
  const { data: poolStats, refetch: refetchPoolStats } = useGetPoolStats({
    query: { queryKey: getGetPoolStatsQueryKey(), staleTime: 15000 }
  });
  const { data: poolLedger, refetch: refetchPoolLedger } = useGetPoolLedger(
    { limit: 15 },
    { query: { queryKey: getGetPoolLedgerQueryKey({ limit: 15 }), staleTime: 15000 } }
  );
  // Public Pool endpoints are platform-wide transparency views. Members get a
  // scoped view of the Community Pool assigned to their account.
  const [myPoolStats, setMyPoolStats] = useState<CommunityStats | null>(null);
  const [myPoolLedger, setMyPoolLedger] = useState<LedgerEntry[] | null>(null);

  const refreshMyPool = useCallback(async () => {
    if (!currentUser) {
      setMyPoolStats(null);
      setMyPoolLedger(null);
      return;
    }
    try {
      const headers = authHeaders();
      const [statsRes, ledgerRes] = await Promise.all([
        fetch(`${base}/api/pool/my-stats`, { headers }),
        fetch(`${base}/api/pool/my-ledger?limit=15`, { headers }),
      ]);
      if (statsRes.ok) {
        const data = await statsRes.json();
        setMyPoolStats({
          id: Number(data.community_id),
          name: data.community_name ?? "Your Community",
          target_reserve_amount: Number(data.target_reserve_amount ?? 500),
          pool_balance: Number(data.balance ?? 0),
          pool_health_ratio: 0,
          pool_pct: Number(data.pool_pct ?? 0),
          member_count: 0,
          total_contributed: Number(data.total_contributed ?? 0),
          total_paid_to_helpers: Number(data.total_fronted ?? 0),
          total_repaid: Number(data.total_repaid ?? 0),
          helpers_paid: 0,
          sponsor_count: Number(data.sponsor_count ?? 0),
          inflow_30d: 0,
          outflow_30d: 0,
          created_at: new Date().toISOString(),
        });
      }
      if (ledgerRes.ok) {
        const data = await ledgerRes.json();
        setMyPoolLedger(Array.isArray(data.entries) ? data.entries : []);
      }
    } catch {
      // Keep the public transparency data visible if the scoped request fails.
    }
  }, [currentUser, base]);

  useEffect(() => {
    if (tab === "pool") void refreshMyPool();
  }, [tab, refreshMyPool]);

  const [contributePending, setContributePending] = useState(false);
  const [contributeAmount, setContributeAmount] = useState("");
  const [contributeMsg, setContributeMsg] = useState<string | null>(null);
  const [contributeSecret, setContributeSecret] = useState<string | null>(null);

  // Anonymous donation state (no login required — POST /pool/donate)
  const [anonAmount, setAnonAmount] = useState("");
  const [anonMsg, setAnonMsg] = useState<string | null>(null);
  const [anonSecret, setAnonSecret] = useState<string | null>(null);
  const [anonPending, setAnonPending] = useState(false);

  // Stripe may send the browser back here after an authentication redirect,
  // after the modal has unmounted. Read only returns explicitly marked by the
  // Pool modal, surface the final redirect status, and remove Stripe's query
  // parameters so a refresh cannot repeat the notification.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const scope = url.searchParams.get("pool_payment_return");
    const redirectStatus = url.searchParams.get("redirect_status");
    if (
      (scope !== "contribution" && scope !== "donation") ||
      !redirectStatus
    ) {
      return;
    }

    const completed =
      redirectStatus === "succeeded" || redirectStatus === "processing";
    const message = completed
      ? redirectStatus === "processing"
        ? "Your payment is processing. The pool will update as soon as Stripe confirms it. 💙"
        : scope === "contribution"
          ? "Thank you! Your contribution is on its way to the pool. 💙"
          : "Thank you for supporting the community! Your donation is on its way to the pool. 💙"
      : "Payment was not completed. You can try again whenever you’re ready.";

    if (scope === "contribution") {
      setContributeMsg(message);
    } else {
      setAnonMsg(message);
    }
    let refreshTimer: number | undefined;
    if (completed) {
      void refetchPoolStats();
      void refetchPoolLedger();
      refreshTimer = window.setTimeout(() => {
        void refetchPoolStats();
        void refetchPoolLedger();
      }, 2500);
    }

    ["pool_payment_return", "redirect_status", "payment_intent", "payment_intent_client_secret"]
      .forEach((key) => url.searchParams.delete(key));
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    };
  }, [refetchPoolLedger, refetchPoolStats]);

  useWebSocket("pool_updated", () => { refetchPoolStats(); refetchPoolLedger(); });
  useWebSocket("pool_front_paid", () => { refetchPoolStats(); refetchPoolLedger(); });
  useWebSocket("pool_low_balance", () => { refetchPoolStats(); });

  const submitContribution = async () => {
    const amt = Number(contributeAmount);
    if (!Number.isFinite(amt) || amt < MIN_POOL_AMOUNT || amt > MAX_POOL_AMOUNT) {
      setContributeMsg("Enter an amount from $1.00 to $10,000.00.");
      return;
    }
    setContributeMsg(null);
    setContributePending(true);
    try {
      const result = await contributeToPool(
        { amount: amt },
        {
          headers: {
            ...authHeaders(),
            "Idempotency-Key": createPoolIdempotencyKey("contribution"),
          },
        },
      );
      if (result.mode === "stripe" && result.client_secret) {
        setContributeSecret(result.client_secret);
      } else {
        setContributeMsg(`Thank you! $${formatPoolCurrency(amt)} added to the pool. 💙`);
        setContributeAmount("");
        refetchPoolStats();
        refetchPoolLedger();
      }
    } catch {
      setContributeMsg("Contribution failed. Please try again.");
    } finally {
      setContributePending(false);
    }
  };

  // Anonymous donation — no account required (POST /pool/donate, Stripe-only)
  const submitAnonDonation = async () => {
    const amt = Number(anonAmount);
    if (!Number.isFinite(amt) || amt < MIN_POOL_AMOUNT || amt > MAX_POOL_AMOUNT) {
      setAnonMsg("Enter an amount from $1.00 to $10,000.00.");
      return;
    }
    setAnonMsg(null);
    setAnonPending(true);
    try {
      const res = await fetch(`${base}/api/pool/donate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": createPoolIdempotencyKey("donation"),
        },
        body: JSON.stringify({ amount: amt }),
      });
      const data = await res.json() as { mode?: string; client_secret?: string; error?: string; setup?: string };
      if (!res.ok) {
        setAnonMsg(data.setup ?? data.error ?? "Donation failed. Please try again.");
        return;
      }
      if (data.mode === "stripe" && data.client_secret) {
        setAnonSecret(data.client_secret);
      } else {
        setAnonMsg("Thank you for supporting the community! 💙");
        setAnonAmount("");
      }
    } catch {
      setAnonMsg("Network error. Please try again.");
    } finally {
      setAnonPending(false);
    }
  };

  const effectivePoolLedger = currentUser && myPoolLedger ? myPoolLedger : poolLedger?.entries;
  const poolBalance = currentUser && myPoolStats
    ? myPoolStats.pool_balance
    : (poolStats?.balance ?? 0);
  const poolTarget = currentUser && myPoolStats
    ? myPoolStats.target_reserve_amount
    : 500;
  const poolPct = Math.max(0, Math.min(Math.round((poolBalance / poolTarget) * 100), 100));
  const poolReached = poolBalance >= poolTarget;

  const toggleLike = (id: number) => {
    setLikedPosts(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Fire-and-forget — WS event will broadcast the updated count.
        // Auth header required now that /like enforces per-user identity
        // (gratitude_likes unique index) instead of a raw open counter.
        fetch(`${base}/api/gratitude/${id}/like`, { method: "POST", headers: { ...authHeaders() } }).catch(() => {});
      }
      return next;
    });
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "feed",      label: "💙 Feed" },
    { key: "circles",   label: "🏘️ Circles" },
    { key: "skills",    label: "🔧 Skills" },
    { key: "heroes",    label: "⭐ Heroes" },
    { key: "pool",      label: "🏦 Pool" },
    { key: "county",    label: "🏛️ County" },
    { key: "impact",    label: "📊 Impact" },
    { key: "resources", label: "📋 Resources" },
  ];

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl border-b border-border p-4 pt-safe">
        <h1 className="text-xl font-black uppercase tracking-widest flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" /> Community
        </h1>
        {/* Scrollable pill tab bar — min 44px touch targets for mobile */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{ touchAction: "manipulation", minHeight: "44px" }}
              className={`shrink-0 flex items-center justify-center py-2.5 px-4 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all active:scale-95 whitespace-nowrap ${
                tab === t.key
                  ? "bg-primary text-primary-foreground shadow-[0_0_14px_rgba(0,212,255,0.35)]"
                  : "bg-muted/80 text-muted-foreground border border-border/60 hover:text-foreground hover:bg-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-4 max-w-lg mx-auto w-full">

        {/* FEED TAB */}
        {tab === "feed" && (
          <div className="space-y-4">
            {/* Diaspora Globe pointer — the Globe now lives in Diaspora only,
                this card keeps it discoverable from Community without
                duplicating the page here. */}
            <button
              onClick={() => setLocation("/diaspora/heritage/globe")}
              className="w-full flex items-center gap-3 bg-gradient-to-br from-primary/15 to-background border border-primary/30 rounded-2xl p-4 text-left hover:border-primary/50 transition-colors"
            >
              <span className="text-2xl shrink-0">🌍</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-black">Explore the Diaspora Globe</div>
                <div className="text-xs text-muted-foreground">See where our community's roots and stories connect worldwide</div>
              </div>
              <Globe className="w-4 h-4 text-primary shrink-0" />
            </button>

            {/* Personal Impact Banner */}
            {currentUser && (
              <div className="bg-gradient-to-br from-primary/15 to-background border border-primary/30 rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-lg font-black text-primary">
                      {currentUser.name?.[0]?.toUpperCase() ?? "?"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm text-foreground">{currentUser.name}</p>
                    <p className="text-xs text-muted-foreground">Your community impact</p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black text-primary">{currentUser.trust_score ?? 0}</div>
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Trust</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-background/60 rounded-xl p-2.5 text-center">
                    <div className="text-lg font-black text-green-400">{(currentUser as { help_count?: number }).help_count ?? 0}</div>
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Helped</div>
                  </div>
                  <div className="bg-background/60 rounded-xl p-2.5 text-center">
                    <div className="text-lg font-black text-yellow-400">{(currentUser as { request_count?: number }).request_count ?? 0}</div>
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Received</div>
                  </div>
                  <div className="bg-background/60 rounded-xl p-2.5 text-center">
                    <div className="text-lg font-black text-primary">{currentUser.is_helper ? "✓" : "—"}</div>
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Helper</div>
                  </div>
                </div>
              </div>
            )}

            {/* Full Circle — recently completed Pay-It-Forward tasks */}
            {recentCompleted.filter(r => (r as { payment_type?: string }).payment_type === "pay_it_forward").length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🔄</span>
                  <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Full Circle Moments</h3>
                </div>
                <p className="text-[11px] text-muted-foreground/70 -mt-1">Neighbors who received help and paid it forward in return.</p>
                {recentCompleted
                  .filter(r => (r as { payment_type?: string }).payment_type === "pay_it_forward")
                  .slice(0, 3)
                  .map(req => (
                    <motion.div
                      key={`pif-${req.id}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="bg-gradient-to-r from-primary/10 via-primary/5 to-background border border-primary/25 rounded-xl p-3.5 flex items-center gap-3"
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-xl">🔄</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold truncate">{req.title}</div>
                        <div className="text-[10px] text-primary/70 mt-0.5">
                          {req.requester_name} received help
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {CATEGORY_LABELS[(req as unknown as Record<string, string>).category] ?? (req as unknown as Record<string, string>).category}
                        </div>
                      </div>
                      <span className="shrink-0 text-[9px] font-black text-primary bg-primary/10 border border-primary/20 px-2 py-1 rounded-full">
                        FULL CIRCLE
                      </span>
                    </motion.div>
                  ))}
              </div>
            )}

            {recentCompleted.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Recent Help</h3>
                {recentCompleted.slice(0, 3).map(req => (
                  <div key={req.id} className="bg-card border border-border rounded-xl p-3.5 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                      <Heart className="w-4 h-4 text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{req.title}</div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <span className="text-green-400 font-bold">✓ Completed</span>
                        <span>·</span>
                        <span>{req.requester_name}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Gratitude &amp; Stories</h3>
              {niaEnabled === true ? (
                <button
                  onClick={() => setShowNiaStory(true)}
                  className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-full transition-colors"
                >
                  <Mic className="w-3.5 h-3.5" /> Share with Nia
                </button>
              ) : niaEnabled === false ? (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground/50 px-3 py-1.5 rounded-full cursor-default select-none" title="Nia AI is currently resting — share your story in text below">
                  <Mic className="w-3.5 h-3.5" /> Nia resting
                </span>
              ) : null /* loading — render nothing until we know */}
            </div>
            {postsLoading ? (
              <div className="flex justify-center items-center py-10">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                >
                  <Heart className="w-6 h-6 text-primary/40" />
                </motion.div>
              </div>
            ) : posts.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Heart className="w-8 h-8 text-muted-foreground/30" />
                <div className="text-sm text-muted-foreground leading-relaxed">
                  No gratitude posts yet.<br />
                  <span className="text-primary font-semibold">Complete a request</span> to add the first one!
                </div>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {posts.map(post => (
                  <motion.div
                    key={post.id}
                    initial={{ opacity: 0, y: -16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-card border border-border rounded-2xl p-4"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center border border-border shrink-0">
                        <span className="text-sm font-black text-muted-foreground">
                          {post.author_name[0]?.toUpperCase() ?? "?"}
                        </span>
                      </div>
                      <div>
                        <div className="font-bold text-sm">{post.author_name}</div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1 flex-wrap">
                          {post.helper_name && (
                            <>
                              <span className="text-primary font-medium">Thanks to {post.helper_name}</span>
                              <span>·</span>
                            </>
                          )}
                          <span>{new Date(post.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                        </div>
                      </div>
                    </div>
                    {post.request_title && (
                      <div className="text-[10px] font-semibold text-primary/80 bg-primary/10 rounded-lg px-2 py-1 mb-2.5 inline-block max-w-full truncate">
                        📋 {post.request_title}
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground leading-relaxed mb-3">"{post.message}"</p>
                    <button
                      onClick={() => toggleLike(post.id)}
                      className={`flex items-center gap-1.5 text-xs transition-colors ${likedPosts.has(post.id) ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
                    >
                      <Heart className={`w-4 h-4 ${likedPosts.has(post.id) ? "fill-current" : ""}`} />
                      {post.likes + (likedPosts.has(post.id) ? 1 : 0)}
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        )}

        {showNiaStory && (
          <NiaStoryModal
            onClose={() => setShowNiaStory(false)}
            onPosted={(_story: string) => {
              setShowNiaStory(false);
              // Re-fetch gratitude posts so the new story appears immediately
              const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
              fetch(`${base}/api/gratitude`)
                .then(r => r.json())
                .then((data: GratitudePost[]) => setPosts(data))
                .catch(() => {});
            }}
          />
        )}

        {/* HEROES TAB — Live Leaderboard */}
        {tab === "heroes" && <LiveLeaderboard />}

        {/* PAY IT FORWARD POOL TAB */}
        {tab === "pool" && (
          <div className="space-y-4">

            {/* Live pool balance card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-br from-primary/20 via-primary/5 to-background border border-primary/40 rounded-3xl p-6 shadow-[0_0_40px_rgba(0,212,255,0.12)] flex flex-col items-center gap-3"
            >
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-primary" />
              </div>
              <div className="text-center">
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Community Pool</div>
                <div className="text-4xl font-black text-primary mt-1">
                  {poolStats ? `$${formatPoolCurrency(poolBalance)}` : "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {poolStats ? "Available now to pay helpers instantly" : "Loading pool balance…"}
                </div>
                {poolStats && poolStats.guaranteed_minimum > 0 && (
                  <div className="text-[10px] text-green-400 font-bold mt-1">
                    ✓ ${formatPoolCurrency(poolStats.guaranteed_minimum)} flat floor
                    {poolStats.minimum_hourly_rate
                      ? ` · $${formatPoolCurrency(poolStats.minimum_hourly_rate)}/hr for timed tasks`
                      : ""} guaranteed per task
                  </div>
                )}
              </div>

              {/* Progress to milestone */}
              <div className="w-full">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
                  <span>Community milestone</span>
                  <span className="font-bold text-primary">{poolStats ? `${poolPct}% to $${poolTarget}` : "Loading…"}</span>
                </div>
                <div
                  className="h-2 bg-muted rounded-full overflow-hidden"
                  role="progressbar"
                  aria-label="Community Pool progress toward the Emergency Assistance Reserve"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={poolStats ? poolPct : undefined}
                  aria-valuetext={poolStats ? `${poolPct}% of the $${poolTarget} milestone` : "Loading pool progress"}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${poolPct}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="h-full bg-gradient-to-r from-primary to-cyan-400 rounded-full"
                  />
                </div>
                <div className={`text-[10px] mt-1.5 text-center ${poolReached ? "text-green-400 font-bold" : "text-muted-foreground"}`}>
                  {poolReached
                    ? "✓ $500 milestone reached — the Emergency Assistance Reserve is unlocked 🏦"
                    : "When we hit $500, we unlock the Emergency Assistance Reserve 🏦"}
                </div>
              </div>
            </motion.div>

            {/* Keep the funding action next to the balance hero. The same
                component serves authenticated contributions and anonymous
                Stripe donations; the parent keeps each provider flow intact. */}
            {currentUser ? (
              <PoolContributionPanel
                amount={contributeAmount}
                setAmount={setContributeAmount}
                pending={contributePending}
                onContinue={submitContribution}
              />
            ) : isStripeConfigured() ? (
              <PoolContributionPanel
                amount={anonAmount}
                setAmount={setAnonAmount}
                pending={anonPending}
                onContinue={submitAnonDonation}
                title="Support the Community"
                subtitle="No account needed — every dollar goes directly to helpers serving Tarrant County neighbors."
              />
            ) : null}
            {(contributeMsg || anonMsg) && (
              <div
                role="status"
                aria-live="polite"
                className={`rounded-xl px-3 py-2 text-xs ${
                  (contributeMsg ?? anonMsg ?? "").startsWith("Thank")
                    ? "bg-green-500/10 text-green-400"
                    : "bg-destructive/10 text-destructive/80"
                }`}
              >
                {contributeMsg ?? anonMsg}
              </div>
            )}

            {/* Helpers Earned This Week — "good people paid every day" promise */}
            {/* "Helpers Earned This Week" — weekly transparency card.
                helpers_earned_7d / helpers_paid_7d are typed directly on PoolStats. */}
            {(() => {
              const earned7d = poolStats?.helpers_earned_7d ?? 0;
              const paid7d   = poolStats?.helpers_paid_7d ?? 0;
              if (!earned7d) return null;
              return (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.05 }}
                  className="bg-gradient-to-br from-primary/10 to-cyan-500/10 border border-primary/30 rounded-2xl p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-primary mb-0.5">
                        Helpers Earned This Week
                      </div>
                      <div className="text-3xl font-black text-foreground">
                        ${formatPoolCurrency(earned7d)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        paid to{" "}
                        <span className="font-bold text-foreground">
                          {paid7d} neighbor{paid7d === 1 ? "" : "s"}
                        </span>{" "}
                        in the last 7 days
                      </div>
                    </div>
                    <div className="text-4xl">💙</div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                    Good people, paid for showing up. This is the promise — neighbors earning a livable wage for their time and care.
                  </p>
                </motion.div>
              );
            })()}

            {/* Pool flow — real numbers */}
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <h3 className="font-black text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" /> Where the Money Goes
              </h3>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { label: "Contributed", value: poolStats?.total_contributed ?? 0, color: "text-green-400", desc: "From sponsors & neighbors" },
                  { label: "Paid to Helpers", value: (poolStats?.total_fronted ?? 0) + (poolStats?.total_minimums ?? 0), color: "text-primary", desc: "Fronted instantly at completion" },
                  { label: "Repaid to Pool", value: poolStats?.total_repaid ?? 0, color: "text-cyan-400", desc: "Requesters paying it forward" },
                  { label: "Helpers Backed", value: poolStats?.helpers_fronted ?? 0, color: "text-yellow-400", desc: "Neighbors paid by the pool", isCount: true },
                ].map((item) => (
                  <div key={item.label} className="bg-background/60 rounded-xl px-3 py-2.5">
                    <div className={`text-lg font-black ${item.color}`}>
                      {item.isCount ? item.value.toLocaleString("en-US") : `$${formatPoolCurrency(Number(item.value))}`}
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-wider">{item.label}</div>
                    <div className="text-[9px] text-muted-foreground mt-0.5">{item.desc}</div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                When a pay-it-forward request completes, the pool pays the helper immediately — no waiting on the requester. When the requester later pays it forward, the money flows back into the pool for the next neighbor.
              </p>
            </div>

            {/* ── Pool Runway Dashboard ───────────────────────────────────── */}
            {(() => {
              const inflow   = poolStats?.inflow_30d   ?? 0;
              const outflow  = poolStats?.outflow_30d  ?? 0;
              const runway   = poolStats?.runway_days  ?? null;
              const outstanding = poolStats?.outstanding_pif_total ?? 0;

              const runwayColor =
                runway === null            ? "text-green-400"
                : runway > 30             ? "text-green-400"
                : runway > 7              ? "text-yellow-400"
                : "text-red-400";

              const runwayLabel =
                runway === null ? "∞ days"
                : `${runway} day${runway === 1 ? "" : "s"}`;

              const runwayBg =
                runway === null            ? "border-green-500/30 bg-green-500/5"
                : runway > 30             ? "border-green-500/30 bg-green-500/5"
                : runway > 7              ? "border-yellow-500/30 bg-yellow-500/10"
                : "border-red-500/30 bg-red-500/10";

              return (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className={`border rounded-2xl p-4 space-y-3 ${runwayBg}`}
                >
                  <h3 className="font-black text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" /> Pool Runway
                  </h3>

                  {/* Main runway stat */}
                  <div className="flex items-end justify-between">
                    <div>
                      <div className={`text-3xl font-black ${runwayColor}`}>{runwayLabel}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {runway === null
                          ? "No spending recorded yet — pool is fully sustained"
                          : "estimated at current 30-day burn rate"}
                      </div>
                    </div>
                    {runway !== null && runway <= 30 && (
                      <div className="text-[10px] text-yellow-400 font-bold text-right max-w-[120px] leading-tight">
                        {runway <= 7
                          ? "⚠️ Pool needs contributions soon"
                          : "📈 More contributions welcome"}
                      </div>
                    )}
                  </div>

                  {/* 30-day inflow vs outflow */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-background/50 rounded-xl px-3 py-2">
                        <div className="text-sm font-black text-green-400">${formatPoolCurrency(inflow)}</div>
                      <div className="text-[10px] font-bold uppercase tracking-wider">30-Day Inflow</div>
                      <div className="text-[9px] text-muted-foreground">contributions + repayments</div>
                    </div>
                    <div className="bg-background/50 rounded-xl px-3 py-2">
                        <div className="text-sm font-black text-primary">${formatPoolCurrency(outflow)}</div>
                      <div className="text-[10px] font-bold uppercase tracking-wider">30-Day Outflow</div>
                      <div className="text-[9px] text-muted-foreground">helpers paid + minimums</div>
                    </div>
                  </div>

                  {/* Burn bar — visual ratio */}
                  {outflow > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] text-muted-foreground">
                        <span>Inflow coverage</span>
                        <span className={inflow >= outflow ? "text-green-400 font-bold" : "text-yellow-400 font-bold"}>
                          {Math.min(Math.round((inflow / outflow) * 100), 100)}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min((inflow / outflow) * 100, 100)}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                          className={`h-full rounded-full ${inflow >= outflow ? "bg-green-500" : "bg-yellow-500"}`}
                        />
                      </div>
                    </div>
                  )}

                  {/* Outstanding PIF pledges — expected future inflow */}
                  {outstanding > 0 && (
                    <div className="border-t border-border/40 pt-2.5 flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                          Expected Repayments
                        </div>
                        <div className="text-[9px] text-muted-foreground leading-relaxed">
                          Neighbors who received help and pledged to pay it forward — this money flows back when they're ready.
                        </div>
                      </div>
                      <div className="text-sm font-black text-cyan-400 shrink-0">${formatPoolCurrency(outstanding)}</div>
                    </div>
                  )}
                </motion.div>
              );
            })()}

            {/* Pending minimums — pool ran dry, helpers waiting on backfill */}
            {(poolStats?.pending_minimums_count ?? 0) > 0 && (
              <div className="bg-yellow-500/10 border border-yellow-500/40 rounded-2xl p-4 space-y-1.5">
                <h3 className="font-black text-sm flex items-center gap-2 text-yellow-400">
                  <AlertTriangle className="w-4 h-4" /> Helpers Waiting on the Pool
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The pool ran low, so <span className="font-bold text-foreground">{poolStats?.pending_minimums_count}</span> guaranteed
                  thank-you payment{(poolStats?.pending_minimums_count ?? 0) === 1 ? "" : "s"} totaling{" "}
                  <span className="font-bold text-yellow-400">${formatPoolCurrency(poolStats?.pending_minimums_total ?? 0)}</span> are queued.
                  They're paid automatically — oldest first — as soon as the pool is replenished. Every contribution helps.
                </p>
              </div>
            )}

            {/* Transparency ledger */}
            {poolLedger && Array.isArray(poolLedger.entries) && (
              <div className="bg-card border border-border rounded-2xl p-4 space-y-2.5">
                <h3 className="font-black text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" /> Pool Activity
                </h3>
                {poolLedger.entries.length === 0 ? (
                  <div className="rounded-xl bg-background/60 px-3 py-4 text-center">
                    <Activity className="mx-auto mb-1.5 h-7 w-7 text-primary/30" aria-hidden="true" />
                    <p className="text-xs text-muted-foreground">No pool activity yet</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground/60">Contributions and helper payments will appear here.</p>
                  </div>
                ) : effectivePoolLedger?.map((entry: {
                  id: number;
                  entry_type: string;
                  amount: number;
                  display_name?: string | null;
                  created_at: string;
                  gross_amount_cents?: number | null;
                  stripe_fee_cents?: number | null;
                  climate_contribution_cents?: number | null;
                  net_amount_cents?: number | null;
                  settlement_status?: string | null;
                  available_on?: string | Date | null;
                  stripe_balance_transaction_id?: string | null;
                   stripe_climate_transaction_id?: string | null;
                }) => {
                  const meta: Record<string, { icon: string; label: string }> = {
                    sponsor_contribution: { icon: "💛", label: entry.display_name ? `${entry.display_name} funded the pool` : "Pool contribution" },
                    helper_front: { icon: "⚡", label: "Helper paid instantly at completion" },
                    pledge_repayment: { icon: "🔄", label: "Pledge repaid — pool replenished" },
                    guaranteed_minimum: { icon: "💙", label: "Guaranteed minimum paid to a helper" },
                    adjustment: { icon: "🛠️", label: "Pool adjustment" },
                  };
                  const m = meta[entry.entry_type] ?? { icon: "💙", label: "Pool activity" };
                  const positive = entry.amount >= 0;
                  return (
                    <div key={entry.id} className="bg-background/60 rounded-xl px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <div className="text-base shrink-0">{m.icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold truncate">{m.label}</div>
                          <div className="text-[9px] text-muted-foreground">
                            {new Date(entry.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </div>
                        </div>
                        <div className={`text-xs font-black shrink-0 ${positive ? "text-green-400" : "text-primary"}`}>
                           {positive ? "+" : "−"}${formatPoolCurrency(Math.abs(entry.amount))}
                        </div>
                      </div>
                      {entry.gross_amount_cents != null && entry.net_amount_cents != null && (
                        <CommunityPoolFinancialBreakdown
                          grossAmountCents={entry.gross_amount_cents}
                          stripeFeeCents={entry.stripe_fee_cents ?? 0}
                          climateContributionCents={entry.climate_contribution_cents ?? 0}
                          netAmountCents={entry.net_amount_cents}
                          settlementStatus={entry.settlement_status}
                          availableOn={entry.available_on}
                          stripeBalanceTransactionId={entry.stripe_balance_transaction_id}
                          stripeClimateTransactionId={entry.stripe_climate_transaction_id}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* How it works */}
            <div className="bg-card/50 border border-border/50 rounded-2xl p-4">
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                <Heart className="w-4 h-4 text-primary" /> How Niakofa Works
              </h3>
              <div className="space-y-3">
                {[
                  { step: "1", title: "Get help now", desc: "When you need help, a neighbor shows up — no payment required upfront." },
                  { step: "2", title: "Pay when you're able", desc: "When life gets better, contribute back any amount — even a dollar keeps the cycle going for the next neighbor who needs help. No deadline, no pressure." },
                  { step: "3", title: "Strengthen the pool", desc: "Every dollar flows into the community reserve, funding future helpers." },
                ].map(item => (
                  <div key={item.step} className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[10px] font-black text-primary">{item.step}</span>
                    </div>
                    <div>
                      <div className="text-sm font-bold">{item.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sponsor Portal — contribution history */}
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-yellow-400 shrink-0" />
                  <div className="font-bold text-sm text-yellow-400">Your Contribution History</div>
                </div>
                {sponsorHistory.loading && <RefreshCw className="w-3 h-3 text-yellow-400/60 animate-spin" />}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Businesses and individuals can sponsor the community pool directly. Your contributions go directly to helpers serving Fort Worth neighbors.
                Use the <span className="font-bold text-foreground">Fund the Community Pool</span> panel above to contribute — your history shows up below.
              </p>

              {/* Contribution history */}
              {currentUser ? (
                <>
                  {sponsorHistory.error && (
                    <div className="text-xs text-destructive/80 bg-destructive/10 rounded-xl px-3 py-2">
                      Could not load history: {sponsorHistory.error}
                    </div>
                  )}
                  {!sponsorHistory.loading && sponsorHistory.data.length === 0 && !sponsorHistory.error && (
                    <div className="text-center py-4">
                      <DollarSign className="w-7 h-7 mx-auto mb-1.5 text-yellow-400/30" />
                      <p className="text-xs text-muted-foreground">No contributions yet</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">Pay-it-forward requests appear here</p>
                    </div>
                  )}
                  {sponsorHistory.data.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Your Contributions</div>
                      {sponsorHistory.data.slice(0, 5).map(entry => (
                        <div key={entry.id} className="flex items-center gap-2.5 bg-background/60 rounded-xl px-3 py-2">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            entry.state === "completed" ? "bg-green-500/10" : "bg-yellow-500/10"
                          }`}>
                            {entry.state === "completed"
                              ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                              : <Clock className="w-3.5 h-3.5 text-yellow-400" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold truncate">
                              {entry.request_title ?? "Community contribution"}
                            </div>
                            <div className="text-[10px] text-muted-foreground capitalize">
                              {entry.request_category?.replace(/_/g, " ") ?? entry.payment_type?.replace(/_/g, " ")}
                              {entry.sponsored_by && ` · via ${entry.sponsored_by}`}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                             <div className="text-xs font-black text-yellow-400">${formatPoolCurrency(entry.amount)}</div>
                            <div className="text-[9px] text-muted-foreground">
                              {new Date(entry.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </div>
                          </div>
                        </div>
                      ))}
                      {sponsorHistory.data.length > 5 && (
                        <div className="text-center text-[10px] text-muted-foreground pt-1">
                          +{sponsorHistory.data.length - 5} more contributions
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-muted-foreground text-center py-2">
                  Sign in to view your contribution history
                </div>
              )}
            </div>

            {/* Stripe payment sheet for pool contributions */}
            {contributeSecret && (
              <StripePaymentModal
                clientSecret={contributeSecret}
                amount={parseFloat(contributeAmount) || 0}
                description="Community Pool contribution"
                returnUrl={createPoolPaymentReturnUrl("contribution")}
                onSuccess={() => {
                  setContributeSecret(null);
                  setContributeMsg("Thank you! Your contribution is on its way to the pool. 💙");
                  setContributeAmount("");
                  setTimeout(() => { refetchPoolStats(); refetchPoolLedger(); }, 2500);
                }}
                onSkip={() => setContributeSecret(null)}
                onClose={() => setContributeSecret(null)}
              />
            )}

            {/* Stripe payment sheet for anonymous donations */}
            {anonSecret && (
              <StripePaymentModal
                clientSecret={anonSecret}
                amount={parseFloat(anonAmount) || 0}
                description="Anonymous Community Pool donation — your gift goes directly to helpers serving Tarrant County neighbors."
                returnUrl={createPoolPaymentReturnUrl("donation")}
                onSuccess={() => {
                  setAnonSecret(null);
                  setAnonMsg("Thank you for supporting the community! Your donation is on its way to the pool. 💙");
                  setAnonAmount("");
                  setTimeout(() => { refetchPoolStats(); refetchPoolLedger(); }, 2500);
                }}
                onSkip={() => setAnonSecret(null)}
                onClose={() => setAnonSecret(null)}
              />
            )}
          </div>
        )}

        {/* IMPACT TAB — real stats from /api/requests/stats */}
        {tab === "resources" && (
          <CivicResourcesTab />
        )}

        {tab === "impact" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-border rounded-2xl p-5 flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Heart className="w-5 h-5 text-primary" />
                </div>
                <div className="text-3xl font-black text-primary">
                  {stats ? stats.total_completed.toLocaleString() : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Requests Fulfilled</div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-5 flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Users className="w-5 h-5 text-green-400" />
                </div>
                <div className="text-3xl font-black text-green-400">
                  {stats ? stats.total_helpers_online : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Active Helpers</div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-5 flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Activity className="w-5 h-5 text-yellow-400" />
                </div>
                <div className="text-3xl font-black text-yellow-400">
                  {stats ? stats.total_open : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Open Requests</div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-5 flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
                  <DollarSign className="w-5 h-5 text-primary" />
                </div>
                  <div className="text-3xl font-black text-primary">
                  ${formatPoolCurrency(stats?.total_pledge_volume)}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Paid Forward</div>
              </div>
            </div>

            {stats && stats.requests_by_category.length > 0 && (
              <div className="bg-card border border-border rounded-2xl p-4">
                <h3 className="font-black text-sm mb-3 flex items-center gap-2">
                  <Star className="w-4 h-4 text-yellow-400" /> By Category
                </h3>
                <div className="space-y-2">
                  {[...stats.requests_by_category]
                    .sort((a, b) => b.count - a.count)
                    .map(({ category, count }) => {
                      const total = stats.requests_by_category.reduce((s: number, c: { count: number }) => s + c.count, 0);
                      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                      return (
                        <div key={category}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-medium">{CATEGORY_LABELS[category] ?? category}</span>
                            <span className="text-muted-foreground">{count} ({pct}%)</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            <div className="bg-gradient-to-br from-primary/20 to-background border border-primary/30 rounded-2xl p-5">
              <h3 className="font-black text-base mb-2">About Niakofa</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                This isn't charity — it's neighbors helping neighbors. Every act of help strengthens our community network. When you're able, give back. When you need help, ask. That's how communities thrive.
              </p>
              <div className="mt-4 space-y-2">
                {[
                  ["Immediate Pay", "Compensate your helper right away"],
                  ["Niakofa", "Contribute back when you're ready"],
                  ["Goodwill", "Pure community — no payment needed"],
                ].map(([title, desc]) => (
                  <div key={title} className="flex items-center gap-2 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    <span className="font-semibold">{title}</span>
                    <span className="text-muted-foreground">— {desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "county" && (
          <div className="space-y-4">
            {countyLoading && !countyData && (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading county portal…
              </div>
            )}

            {countyLoaded && !countyData && (
              <div className="text-center py-16 text-muted-foreground text-sm">
                No county pool has been set up yet. Check back soon.
              </div>
            )}

            {countyData && (() => {
              const hRatio = Math.max(0, Math.min(Number(countyData.pool_health_ratio) || 0, 1));
              const countyPoolPct = Math.max(
                0,
                Math.min(Number(countyData.pool_pct) || 0, 100),
              );
              const healthColor =
                hRatio >= 0.9 ? "text-green-400"
                : hRatio >= 0.7 ? "text-yellow-400"
                : "text-orange-400";
              const healthLabel =
                hRatio >= 0.9 ? "Fully Funded"
                : hRatio >= 0.7 ? "Healthy"
                : "Building Up";
              const healthBg =
                hRatio >= 0.9 ? "from-green-500/15 via-green-500/5 border-green-500/30"
                : hRatio >= 0.7 ? "from-yellow-500/15 via-yellow-500/5 border-yellow-500/30"
                : "from-orange-500/15 via-orange-500/5 border-orange-500/30";

              return (
                <>
                  {/* County hero card */}
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`bg-gradient-to-br ${healthBg} border rounded-3xl p-6 shadow-lg`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">County Fund</div>
                        <h2 className="text-2xl font-black mt-0.5">{countyData.name}</h2>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          Open community fund · {countyData.member_count.toLocaleString()} neighbors
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-[10px] font-bold uppercase tracking-widest ${healthColor}`}>{healthLabel}</div>
                        <div className={`text-3xl font-black ${healthColor} mt-0.5`}>
                          {Math.round(hRatio * 100)}%
                        </div>
                        <div className="text-[10px] text-muted-foreground">of target</div>
                      </div>
                    </div>

                    {/* Balance vs target */}
                    <div className="mb-3">
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="font-black text-lg">${formatPoolCurrency(countyData.pool_balance)}</span>
                        <span className="text-muted-foreground text-[11px] self-end">target ${formatPoolCurrency(countyData.target_reserve_amount)}</span>
                      </div>
                      <div className="h-3 bg-black/20 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${countyPoolPct}%` }}
                          transition={{ duration: 1.2, ease: "easeOut" }}
                          className={`h-full rounded-full ${
                            hRatio >= 0.9 ? "bg-gradient-to-r from-green-400 to-emerald-500"
                            : hRatio >= 0.7 ? "bg-gradient-to-r from-yellow-400 to-amber-500"
                            : "bg-gradient-to-r from-orange-400 to-orange-500"
                          }`}
                        />
                      </div>
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Every dollar in this fund goes directly to helpers — no platform cut, no waiting. When you complete a task, the county fund pays you right away at a livable wage floor.
                    </p>
                  </motion.div>

                  {/* Livable wage framing */}
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-gradient-to-br from-primary/20 via-primary/5 to-background border border-primary/40 rounded-2xl p-5"
                  >
                    <h3 className="font-black text-sm flex items-center gap-2 mb-3">
                      <DollarSign className="w-4 h-4 text-primary" /> Wake Up. Help Neighbors. Earn a Living.
                    </h3>
                    <p className="text-[12px] text-muted-foreground leading-relaxed mb-3">
                      Helping your community pays real money — not tips, not points. The {countyData.name} fund guarantees every completed task earns a livable-wage floor, paid immediately when you finish. No invoices, no chasing payment, no waiting.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { icon: "⚡", label: "Paid Instantly", desc: "Pool pays helpers the moment a task completes" },
                        { icon: "📈", label: "Wage Scales with You", desc: "Higher trust tier = bigger minimum guarantee" },
                        { icon: "🔄", label: "Self-Replenishing", desc: "Requesters pay it forward, refilling the pool" },
                        { icon: "🏛️", label: "County-Backed", desc: "Local sponsors keep the fund healthy" },
                      ].map(item => (
                        <div key={item.label} className="bg-background/60 rounded-xl p-3">
                          <div className="text-lg mb-0.5">{item.icon}</div>
                          <div className="text-[11px] font-black">{item.label}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{item.desc}</div>
                        </div>
                      ))}
                    </div>
                  </motion.div>

                  {/* Impact stats */}
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="bg-card border border-border rounded-2xl p-4"
                  >
                    <h3 className="font-black text-sm flex items-center gap-2 mb-3">
                      <Activity className="w-4 h-4 text-primary" /> What This Fund Has Done
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Contributed", value: `$${formatPoolCurrency(countyData.total_contributed)}`, desc: "From sponsors & neighbors", color: "text-green-400" },
                        { label: "Paid to Helpers", value: `$${formatPoolCurrency(countyData.total_paid_to_helpers)}`, desc: "Instantly on task completion", color: "text-primary" },
                        { label: "Helpers Paid", value: countyData.helpers_paid.toString(), desc: "Unique neighbors compensated", color: "text-yellow-400" },
                        { label: "30-Day Inflow", value: `$${formatPoolCurrency(countyData.inflow_30d)}`, desc: "Repayments + contributions", color: "text-cyan-400" },
                      ].map(item => (
                        <div key={item.label} className="bg-background/60 rounded-xl px-3 py-2.5">
                          <div className={`text-xl font-black ${item.color}`}>{item.value}</div>
                          <div className="text-[10px] font-bold uppercase tracking-wider">{item.label}</div>
                          <div className="text-[9px] text-muted-foreground mt-0.5">{item.desc}</div>
                        </div>
                      ))}
                    </div>
                  </motion.div>

                  {/* Recent ledger */}
                  {countyLedger.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="bg-card border border-border rounded-2xl p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-black text-sm flex items-center gap-2">
                          <Shield className="w-4 h-4 text-primary" /> Public Ledger
                        </h3>
                        <button
                          onClick={loadCountyData}
                          className="text-[11px] text-primary flex items-center gap-1 active:opacity-60"
                        >
                          <RefreshCw className="w-3 h-3" /> Refresh
                        </button>
                      </div>
                      <div className="space-y-2">
                        {countyLedger.slice(0, 10).map((entry) => {
                          const isCredit = entry.amount > 0;
                          const typeLabel: Record<string, string> = {
                            sponsor_contribution: "🏛️ Sponsor contributed",
                            helper_front: "⚡ Helper paid",
                            guaranteed_minimum: "💙 Min guarantee paid",
                            pledge_repayment: "🔄 Pledge repaid",
                          };
                          return (
                            <div key={entry.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0">
                              <div>
                                <div className="font-medium">{typeLabel[entry.entry_type] ?? entry.entry_type}</div>
                                {entry.description && (
                                  <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[200px]">{entry.description}</div>
                                )}
                              </div>
                              <div className={`font-black tabular-nums ${isCredit ? "text-green-400" : "text-primary"}`}>
                                {isCredit ? "+" : "−"}${formatPoolCurrency(Math.abs(entry.amount))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}

                  {countyLedger.length === 0 && countyLoaded && (
                    <div className="bg-card border border-border rounded-2xl p-6 text-center">
                      <div className="text-3xl mb-2">🌱</div>
                      <div className="font-black text-sm">Fund is getting started</div>
                      <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                        The {countyData.name} community fund is new. Be one of the first contributors — your donation goes directly to compensating helpers in your county.
                      </p>
                    </div>
                  )}

                  <button
                    onClick={() => setLocation("/civic-needs")}
                    className="w-full flex items-center gap-3 bg-gradient-to-br from-primary/15 to-background border border-primary/30 rounded-2xl p-4 text-left hover:border-primary/50 transition-colors active:scale-[0.99]"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                      <ClipboardList className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-sm">Civic Needs Marketplace</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Browse county-posted needs to claim, or post one if you're a sponsor
                      </div>
                    </div>
                    <ChevronDown className="w-4 h-4 -rotate-90 text-muted-foreground shrink-0" />
                  </button>
                </>
              );
            })()}
          </div>
        )}

        {tab === "circles" && <NeighborhoodCirclesTab />}
        {tab === "skills" && <SkillsMarketplaceTab />}
      </div>
    </div>
  );
}
