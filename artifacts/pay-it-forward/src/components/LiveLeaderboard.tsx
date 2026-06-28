import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWebSocket } from "@/lib/useWebSocket";
import type { WsEvent } from "@/lib/useWebSocket";
import { TrustTierBadge } from "@/components/TrustTierBadge";
import { MapPin, Trophy, Flame, Star, TrendingUp, ChevronDown } from "lucide-react";
import { useLocation } from "wouter";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  id: number;
  name: string;
  neighborhood: string | null;
  city: string | null;
  help_count: number;
  trust_score: number;
  goodwill_score: number;
  avatar_url: string | null;
  tier: string;
  rank: number;
  monthly_contributions: number;
  is_neighborhood_top: boolean;
}

interface TierChangeEvent {
  user_id: number;
  name: string;
  from_tier: string;
  to_tier: string;
}

interface LeaderboardPayload {
  entries: LeaderboardEntry[];
  changed_user_id: number | null;
  tier_change: TierChangeEvent | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

const TIER_DISPLAY: Record<string, string> = {
  anchor: "Community Anchor",
  elite: "Elite Helper",
  trusted: "Trusted",
  verified: "Verified",
  member: "Member",
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function LeaderboardSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-32 bg-card border border-border rounded-2xl animate-pulse" />
        ))}
      </div>
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className="h-16 bg-card border border-border rounded-2xl animate-pulse" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LiveLeaderboard() {
  const [, setLocation] = useLocation();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [changedId, setChangedId] = useState<number | null>(null);
  const [tierChange, setTierChange] = useState<TierChangeEvent | null>(null);
  const [cities, setCities] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState<string>("");
  const [cityOpen, setCityOpen] = useState(false);

  // Initial HTTP fetch
  useEffect(() => {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    const cityParam = selectedCity ? `?city=${encodeURIComponent(selectedCity)}` : "";
    setLoading(true);
    fetch(`${base}/api/leaderboard${cityParam}`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: LeaderboardEntry[] | null) => {
        if (data) setEntries(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedCity]);

  // Fetch cities list once
  useEffect(() => {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    fetch(`${base}/api/leaderboard/cities`)
      .then(r => r.ok ? r.json() : [])
      .then((data: string[]) => setCities(data))
      .catch(() => {});
  }, []);

  // Live WebSocket updates
  useWebSocket((event: WsEvent) => {
    if (event.type !== "leaderboard_update") return;
    const payload = event.payload as LeaderboardPayload;

    // Filter by city if one is selected (payload entries are global)
    const filtered = selectedCity
      ? payload.entries.filter(
          e =>
            e.neighborhood?.toLowerCase().includes(selectedCity.toLowerCase()) ||
            e.city?.toLowerCase().includes(selectedCity.toLowerCase())
        )
      : payload.entries;

    setEntries(filtered.length > 0 ? filtered : payload.entries);
    setLastUpdate(
      new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    );

    if (payload.changed_user_id != null) {
      setChangedId(payload.changed_user_id);
      setTimeout(() => setChangedId(null), 4000);
    }
    if (payload.tier_change) {
      setTierChange(payload.tier_change);
      setTimeout(() => setTierChange(null), 7000);
    }
  });

  const topThree = entries.slice(0, 3);
  const rest = entries.slice(3);

  // Monthly totals for the selected city view
  const totalMonthlyHelps = entries.reduce((s, e) => s + e.monthly_contributions, 0);

  if (loading) return <LeaderboardSkeleton />;

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-primary" />
          <span className="font-black text-sm uppercase tracking-widest">
            {selectedCity ? `Top Helpers — ${selectedCity}` : "Top Helpers"}
          </span>
          <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] font-black text-red-400 uppercase tracking-wider">Live</span>
          </div>
        </div>
        {lastUpdate && (
          <span className="text-[10px] text-muted-foreground tabular-nums">{lastUpdate}</span>
        )}
      </div>

      {/* City filter */}
      {cities.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setCityOpen(!cityOpen)}
            className="flex items-center gap-2 text-xs bg-card border border-border rounded-xl px-3 py-2 font-semibold w-full max-w-[200px]"
          >
            <MapPin className="w-3 h-3 text-primary shrink-0" />
            <span className="truncate flex-1 text-left">{selectedCity || "All Neighborhoods"}</span>
            <ChevronDown className={`w-3 h-3 text-muted-foreground shrink-0 transition-transform ${cityOpen ? "rotate-180" : ""}`} />
          </button>
          <AnimatePresence>
            {cityOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="absolute top-full left-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-20 w-56 overflow-hidden"
              >
                <button
                  onClick={() => { setSelectedCity(""); setCityOpen(false); }}
                  className={`w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-muted transition-colors ${!selectedCity ? "text-primary bg-primary/10" : ""}`}
                >
                  All Neighborhoods
                </button>
                {cities.map(c => (
                  <button
                    key={c}
                    onClick={() => { setSelectedCity(c); setCityOpen(false); }}
                    className={`w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-muted transition-colors ${selectedCity === c ? "text-primary bg-primary/10" : ""}`}
                  >
                    {c}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Monthly summary pill */}
      {totalMonthlyHelps > 0 && (
        <div className="flex items-center gap-2 bg-primary/10 border border-primary/25 rounded-full px-4 py-2">
          <TrendingUp className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-xs font-bold text-primary">
            {totalMonthlyHelps} helps this month
            {selectedCity ? ` in ${selectedCity}` : " in your community"}
          </span>
        </div>
      )}

      {/* Tier-up banner */}
      <AnimatePresence>
        {tierChange && (
          <motion.div
            key="tier-banner"
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.96 }}
            transition={{ type: "spring", damping: 22, stiffness: 280 }}
            className="bg-gradient-to-r from-primary/20 via-primary/10 to-transparent border border-primary/40 rounded-2xl p-3.5 flex items-center gap-3"
          >
            <motion.div
              animate={{ rotate: [0, -15, 15, -10, 10, 0] }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-2xl shrink-0"
            >
              🎉
            </motion.div>
            <div>
              <div className="font-black text-sm text-primary">
                {tierChange.name} reached {TIER_DISPLAY[tierChange.to_tier] ?? tierChange.to_tier}!
              </div>
              <div className="text-[10px] text-muted-foreground">
                Upgraded from {TIER_DISPLAY[tierChange.from_tier] ?? tierChange.from_tier}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Podium — Top 3 */}
      {topThree.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {topThree.map((entry, i) => {
            const isChanged = changedId === entry.id;
            return (
              <motion.div
                key={entry.id}
                layout
                layoutId={`lb-${entry.id}`}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                onClick={() => setLocation(`/helper/${entry.id}`)}
                className={`relative flex flex-col items-center p-3 rounded-2xl border transition-colors cursor-pointer active:scale-95 ${
                  isChanged
                    ? "bg-primary/15 border-primary/60 shadow-[0_0_20px_rgba(0,212,255,0.18)]"
                    : i === 0
                    ? "bg-yellow-500/5 border-yellow-500/20"
                    : "bg-card border-border"
                }`}
              >
                <div className="text-xl mb-1">{RANK_MEDALS[i]}</div>

                {/* Avatar */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-1 overflow-hidden border-2 ${
                  i === 0 ? "border-yellow-500/40" : "border-border"
                } bg-muted`}>
                  {entry.avatar_url ? (
                    <img src={entry.avatar_url} alt={entry.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-black text-muted-foreground">{entry.name[0]}</span>
                  )}
                </div>

                <div className="text-[11px] font-black text-center truncate w-full leading-tight">
                  {entry.name.split(" ")[0]}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                  {entry.help_count} helped
                </div>

                {/* Monthly contributions */}
                {entry.monthly_contributions > 0 && (
                  <div className="text-[10px] text-primary font-bold mt-0.5 tabular-nums">
                    +{entry.monthly_contributions} this month
                  </div>
                )}

                <div className="mt-1.5 scale-[0.88] origin-center">
                  <TrustTierBadge trustScore={entry.trust_score} helpCount={entry.help_count} size="sm" />
                </div>

                {/* #1 in neighborhood badge */}
                {entry.is_neighborhood_top && entry.neighborhood && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="mt-1.5 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-[10px] font-black px-1.5 py-0.5 rounded-full text-center leading-tight"
                  >
                    #1 in {entry.neighborhood.length > 10 ? entry.neighborhood.slice(0, 10) + "…" : entry.neighborhood}
                  </motion.div>
                )}

                <AnimatePresence>
                  {isChanged && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      className="mt-1.5 bg-primary/20 text-primary text-[10px] font-black px-1.5 py-0.5 rounded-full"
                    >
                      ⚡ Just helped!
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Ranks 4–25 */}
      {rest.length > 0 && (
        <div className="space-y-1.5">
          <AnimatePresence initial={false}>
            {rest.map(entry => {
              const isChanged = changedId === entry.id;
              return (
                <motion.div
                  key={entry.id}
                  layout
                  layoutId={`lb-${entry.id}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ type: "spring", damping: 28, stiffness: 260 }}
                  onClick={() => setLocation(`/helper/${entry.id}`)}
                  className={`flex items-center gap-3 p-3 rounded-2xl border transition-colors cursor-pointer active:scale-95 ${
                    isChanged
                      ? "bg-primary/12 border-primary/50"
                      : "bg-card border-border hover:border-primary/30"
                  }`}
                >
                  {/* Rank number */}
                  <div className="w-7 shrink-0 text-center font-black text-sm text-muted-foreground tabular-nums">
                    #{entry.rank}
                  </div>

                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-muted border border-border flex items-center justify-center shrink-0 overflow-hidden">
                    {entry.avatar_url ? (
                      <img src={entry.avatar_url} alt={entry.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-black text-muted-foreground">{entry.name[0]}</span>
                    )}
                  </div>

                  {/* Name + location + monthly */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <div className="font-black text-sm truncate leading-tight">{entry.name}</div>
                      {entry.is_neighborhood_top && entry.neighborhood && (
                        <div className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-[10px] font-black px-1 py-px rounded-full shrink-0">
                          #1
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
                      <MapPin className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">{entry.neighborhood ?? entry.city ?? "Community"}</span>
                      <span className="text-muted-foreground/40 mx-0.5">·</span>
                      <span className="tabular-nums">{entry.help_count} helped</span>
                      {entry.monthly_contributions > 0 && (
                        <>
                          <span className="text-muted-foreground/40 mx-0.5">·</span>
                          <Star className="w-2.5 h-2.5 text-primary shrink-0" />
                          <span className="text-primary font-semibold tabular-nums">{entry.monthly_contributions}/mo</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Tier + live indicator */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <TrustTierBadge trustScore={entry.trust_score} helpCount={entry.help_count} size="sm" />
                    <AnimatePresence>
                      {isChanged && (
                        <motion.span
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          className="text-[10px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded-full"
                        >
                          ⚡ Just helped!
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Empty state */}
      {entries.length === 0 && (
        <div className="text-center py-12">
          <Trophy className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
          <div className="font-bold text-sm text-muted-foreground">
            {selectedCity ? `No helpers found in ${selectedCity} yet` : "No helpers yet"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {selectedCity
              ? "Try a different neighborhood or view all."
              : "Enable Helper Mode on the map to appear here."}
          </div>
          {selectedCity && (
            <button
              onClick={() => setSelectedCity("")}
              className="mt-3 text-xs text-primary font-bold underline"
            >
              Show all neighborhoods
            </button>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
        Live updates · Rankings by jobs + trust score · Monthly totals reset on the 1st
      </div>
    </div>
  );
}
