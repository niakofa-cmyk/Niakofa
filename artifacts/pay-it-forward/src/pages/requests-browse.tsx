import { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { Search, X, Filter, Clock, MapPin, AlertTriangle, Heart, DollarSign, Users, RefreshCw } from "lucide-react";
import { useGetRequests, getGetRequestsQueryKey } from "@workspace/api-client-react";
import { keepPreviousData } from "@tanstack/react-query";
import { useAppContext } from "@/lib/AppContext";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";

const CATEGORY_LABELS: Record<string, string> = {
  groceries: "🛒 Groceries", transportation: "🚗 Rides", errands: "📦 Errands",
  home_repair: "🔧 Home Repair", medical: "🏥 Medical", emergency: "🚨 Emergency",
  moving_labor: "📦 Moving", pet_care: "🐾 Pet Care", childcare: "🧸 Childcare",
  senior_care: "🧓 Senior Care", yard_work: "🌿 Yard Work", tutoring: "📚 Tutoring",
  cleaning: "🧹 Cleaning", meal_prep: "🍲 Meal Prep", paperwork: "📄 Paperwork",
  tech_support: "💻 Tech Support", mental_health_peer: "💜 Peer Support",
  language_help: "🌐 Translation", job_assistance: "👔 Job Search",
  business_services: "💼 Business", legal_aid: "⚖️ Legal Aid", other: "💙 Other",
};

const URGENCY_STYLES: Record<string, { badge: string; border: string }> = {
  emergency: { badge: "bg-red-500/20 text-red-400 border-red-500/30", border: "border-l-red-500" },
  high:      { badge: "bg-orange-500/20 text-orange-400 border-orange-500/30", border: "border-l-orange-500" },
  medium:    { badge: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", border: "border-l-yellow-400" },
  low:       { badge: "bg-muted text-muted-foreground border-border", border: "border-l-border" },
};

const PAYMENT_LABELS: Record<string, { label: string; color: string }> = {
  immediate:      { label: "Paid", color: "text-green-400 bg-green-400/10 border-green-400/20" },
  pay_it_forward: { label: "Pool pays", color: "text-primary bg-primary/10 border-primary/20" },
  goodwill:       { label: "Goodwill", color: "text-purple-400 bg-purple-400/10 border-purple-400/20" },
  in_kind:        { label: "In-Kind", color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" },
};

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type SortKey = "newest" | "urgency" | "nearest";
type UrgencyFilter = "all" | "emergency" | "high" | "medium" | "low";
type PaymentFilter = "all" | "immediate" | "pay_it_forward" | "goodwill";

const URGENCY_ORDER: Record<string, number> = { emergency: 0, high: 1, medium: 2, low: 3 };

export default function RequestsBrowsePage() {
  const [, setLocation] = useLocation();
  const { myLocation } = useAppContext();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data: rawRequests, isLoading, refetch, isFetching } = useGetRequests(
    { status: "open" },
    { query: { queryKey: getGetRequestsQueryKey({ status: "open" }), staleTime: 20000, placeholderData: keepPreviousData } }
  );

  const requests = Array.isArray(rawRequests) ? rawRequests : [];

  const filtered = useMemo(() => {
    let list = [...requests];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        (r.title ?? "").toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q) ||
        (r.requester_name ?? "").toLowerCase().includes(q) ||
        (CATEGORY_LABELS[r.category ?? ""] ?? r.category ?? "").toLowerCase().includes(q)
      );
    }

    if (categoryFilter !== "all") list = list.filter(r => r.category === categoryFilter);
    if (urgencyFilter !== "all")  list = list.filter(r => r.urgency === urgencyFilter);
    if (paymentFilter !== "all")  list = list.filter(r => (r as unknown).payment_type === paymentFilter);

    list.sort((a, b) => {
      if (sort === "urgency") {
        const ua = URGENCY_ORDER[a.urgency ?? "low"] ?? 3;
        const ub = URGENCY_ORDER[b.urgency ?? "low"] ?? 3;
        return ua - ub;
      }
      if (sort === "nearest" && myLocation) {
        const da = Math.hypot((a.lat ?? 0) - myLocation.lat, (a.lng ?? 0) - myLocation.lng);
        const db = Math.hypot((b.lat ?? 0) - myLocation.lat, (b.lng ?? 0) - myLocation.lng);
        return da - db;
      }
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    });

    return list;
  }, [requests, search, categoryFilter, urgencyFilter, paymentFilter, sort, myLocation]);

  const handleRefresh = useCallback(async () => {
    await refetch();
    qc.invalidateQueries({ queryKey: getGetRequestsQueryKey({ status: "open" }) });
  }, [refetch, qc]);

  const hasActiveFilters = categoryFilter !== "all" || urgencyFilter !== "all" || paymentFilter !== "all";
  const clearFilters = () => { setCategoryFilter("all"); setUrgencyFilter("all"); setPaymentFilter("all"); };

  const emergencyCount = requests.filter(r => r.urgency === "emergency").length;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col pb-24">

      {/* Header */}
      <div className="sticky top-0 z-20 bg-card/95 backdrop-blur-xl border-b border-border">
        <div className="px-4 pt-safe pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-black uppercase tracking-widest text-foreground">Browse Requests</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isLoading ? "Loading…" : `${filtered.length} open${emergencyCount > 0 ? ` · ${emergencyCount} 🚨` : ""}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                aria-label="Refresh requests"
                onClick={handleRefresh}
                disabled={isFetching}
                className="w-9 h-9 rounded-full bg-muted flex items-center justify-center active:scale-95 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 text-muted-foreground ${isFetching ? "animate-spin" : ""}`} />
              </button>
              <button
                aria-label="Toggle filters"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen(p => !p)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition-all active:scale-95 ${
                  hasActiveFilters
                    ? "bg-primary text-primary-foreground shadow-[0_0_10px_rgba(0,212,255,0.3)]"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                {hasActiveFilters ? "Filtered" : "Filter"}
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              aria-label="Search requests"
              type="search"
              placeholder="Search by title, category, or person…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ fontSize: "16px" }}
              className="w-full bg-muted border border-border rounded-2xl pl-9 pr-9 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {search && (
              <button
                aria-label="Clear search"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Filter panel */}
        <AnimatePresence>
          {filtersOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-border"
            >
              <div className="p-4 space-y-3">
                {/* Sort */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Sort by</p>
                  <div className="flex gap-2 flex-wrap">
                    {(["newest", "urgency", "nearest"] as SortKey[]).map(s => (
                      <button
                        key={s}
                        aria-pressed={sort === s}
                        onClick={() => setSort(s)}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all active:scale-95 ${
                          sort === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground border border-border"
                        }`}
                      >
                        {s === "newest" ? "🕐 Newest" : s === "urgency" ? "🚨 Urgency" : "📍 Nearest"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Urgency */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Urgency</p>
                  <div className="flex gap-2 flex-wrap">
                    {(["all", "emergency", "high", "medium", "low"] as UrgencyFilter[]).map(u => (
                      <button
                        key={u}
                        aria-pressed={urgencyFilter === u}
                        onClick={() => setUrgencyFilter(u)}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all active:scale-95 ${
                          urgencyFilter === u ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground border border-border"
                        }`}
                      >
                        {u === "all" ? "All" : u === "emergency" ? "🚨 Emergency" : u === "high" ? "⚠️ High" : u === "medium" ? "📋 Medium" : "🟢 Low"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Payment */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Payment type</p>
                  <div className="flex gap-2 flex-wrap">
                    {(["all", "immediate", "pay_it_forward", "goodwill"] as PaymentFilter[]).map(p => (
                      <button
                        key={p}
                        aria-pressed={paymentFilter === p}
                        onClick={() => setPaymentFilter(p)}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all active:scale-95 ${
                          paymentFilter === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground border border-border"
                        }`}
                      >
                        {p === "all" ? "All" : PAYMENT_LABELS[p]?.label ?? p}
                      </button>
                    ))}
                  </div>
                </div>

                {hasActiveFilters && (
                  <button onClick={clearFilters} className="text-xs text-destructive font-bold underline">
                    Clear all filters
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Category scroll bar */}
        <div className="flex gap-2 overflow-x-auto pb-3 px-4 scrollbar-none">
          {["all", ...Object.keys(CATEGORY_LABELS)].map(cat => (
            <button
              key={cat}
              aria-pressed={categoryFilter === cat}
              onClick={() => setCategoryFilter(cat)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all active:scale-95 whitespace-nowrap ${
                categoryFilter === cat
                  ? "bg-primary text-primary-foreground shadow-[0_0_8px_rgba(0,212,255,0.25)]"
                  : "bg-muted text-muted-foreground border border-border"
              }`}
            >
              {cat === "all" ? "🌐 All" : CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 px-4 pt-3 space-y-2.5">
        {isLoading && requests.length === 0 ? (
          // Flash-empty fix: only show the full skeleton on the very first load
          // (no prior data at all). Once we have data, keep it visible during
          // background refetches — isFetching drives the subtle spinner in the
          // header instead of blanking the entire list.
          <div className="space-y-3 pt-2" aria-busy="true" aria-label="Loading requests">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-2xl p-4 animate-pulse">
                <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-4 pt-16 text-center px-6" role="status">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
              <Search className="w-7 h-7 text-muted-foreground/40" />
            </div>
            <div>
              <p className="font-bold text-foreground mb-1">
                {search || hasActiveFilters ? "No matching requests" : "No open requests right now"}
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {search || hasActiveFilters
                  ? "Try adjusting your filters or search term."
                  : "Check back soon — new requests appear in real time."}
              </p>
            </div>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-sm text-primary font-bold">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filtered.map((req, i) => {
              const urgStyle = URGENCY_STYLES[req.urgency ?? "low"] ?? URGENCY_STYLES.low;
              const payStyle = PAYMENT_LABELS[(req as unknown).payment_type ?? ""] ?? null;
              const catLabel = CATEGORY_LABELS[req.category ?? ""] ?? req.category ?? "";
              const isEmergency = req.urgency === "emergency";

              return (
                <motion.button
                  key={req.id}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.2) }}
                  onClick={() => setLocation(`/request/${req.id}`)}
                  aria-label={`${req.title} — ${req.urgency} urgency, ${catLabel}`}
                  className={`w-full text-left bg-card border border-border border-l-4 ${urgStyle.border} rounded-2xl p-4 transition-all active:scale-[0.98] active:bg-muted/60 ${
                    isEmergency ? "shadow-[0_0_12px_rgba(239,68,68,0.15)]" : ""
                  }`}
                >
                  {isEmergency && (
                    <div className="flex items-center gap-1.5 text-red-400 text-[11px] font-black mb-2 animate-pulse">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      EMERGENCY — Needs immediate help
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-foreground leading-snug truncate">{req.title}</p>
                      {req.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                          {req.description}
                        </p>
                      )}

                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${urgStyle.badge}`}>
                          {req.urgency}
                        </span>
                        {catLabel && (
                          <span className="text-[11px] text-muted-foreground font-medium">{catLabel}</span>
                        )}
                        {payStyle && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${payStyle.color}`}>
                            {payStyle.label}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                        {req.requester_name && (
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {req.requester_name}
                          </span>
                        )}
                        {req.created_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {timeAgo(req.created_at)}
                          </span>
                        )}
                        {req.distance_miles != null && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {req.distance_miles.toFixed(1)} mi
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                      {(req as unknown).pay_it_forward_amount && (req as any).payment_type === "immediate" && (
                        <div className="flex items-center gap-0.5 text-green-400 bg-green-400/10 border border-green-400/20 px-2 py-1 rounded-full">
                          <DollarSign className="w-3 h-3" />
                          <span className="text-[11px] font-black">{parseFloat((req as unknown).pay_it_forward_amount).toFixed(0)}</span>
                        </div>
                      )}
                      {req.urgency === "high" || req.urgency === "emergency" ? (
                        <Heart className="w-4 h-4 text-red-400/60" />
                      ) : null}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>
        )}

        {/* Bottom padding */}
        <div className="h-4" />
      </div>
    </div>
  );
}
