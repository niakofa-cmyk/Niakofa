import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAppContext } from "@/lib/AppContext";
import {
  useGetNearbyRequests, useGetRequests, useClaimRequest,
  getGetNearbyRequestsQueryKey, getGetRequestsQueryKey,
} from "@workspace/api-client-react";
import type { HelpRequest } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Activity, Star, MapPin, Clock, Heart, Award, Wrench, Zap, Filter } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

const CATEGORY_LABELS: Record<string, string> = {
  groceries: "🛒 Groceries", transportation: "🚗 Transportation", errands: "📦 Errands",
  home_repair: "🔧 Home Repair", medical: "💊 Medical", emergency: "🚨 Emergency",
  stock_shelves: "📦 Stock", event_setup: "🎪 Event", delivery_run: "🚚 Delivery",
  tech_support: "💻 Tech", other: "💙 Other",
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
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { currentUser, helperModeActive, myLocation, setLastViewedMatchReasons } = useAppContext();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterKey>("all");

  const { data: nearbyRaw = [] } = useGetNearbyRequests(
    { lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: 10 },
    { query: { enabled: !!myLocation, queryKey: getGetNearbyRequestsQueryKey({ lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: 10 }) } }
  );

  const { data: myActiveRaw = [] } = useGetRequests(
    { status: "claimed" },
    { query: { enabled: !!currentUser?.id, queryKey: getGetRequestsQueryKey({ status: "claimed" }) } }
  );

  const claimMutation = useClaimRequest();

  // Phase 4: surface the real, already-displayed match_reasons for whatever
  // open requests this helper currently sees, attributed by request title, so
  // if they ask Nia "why was I matched with this" she answers from real data
  // instead of guessing. Split into two effects: one that updates the value
  // reactively without a cleanup (so periodic react-query refetches of
  // nearbyRaw don't flicker the value to null and back), and one that clears
  // it only on true component unmount.
  useEffect(() => {
    const openWithReasons = (nearbyRaw as unknown as { title: string; status: string; match_reasons?: string[] }[])
      .filter(r => r.status === "open" && r.match_reasons?.length);
    if (openWithReasons.length === 0) {
      setLastViewedMatchReasons(null);
      return;
    }
    const attributed = openWithReasons.flatMap(r =>
      r.match_reasons!.map(reason => `"${r.title}": ${reason}`)
    );
    setLastViewedMatchReasons(attributed);
  }, [nearbyRaw, setLastViewedMatchReasons]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally
  // empty deps: this is the unmount-only cleanup, must not re-run per render.
  useEffect(() => {
    return () => setLastViewedMatchReasons(null);
  }, []);

  if (!currentUser) return null;

  // Gate: only approved helpers can access the dashboard
  const helperStatus = currentUser.helper_status;
  if (helperStatus !== "approved") {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl border-b border-border p-4 pt-safe">
          <div className="flex items-center gap-3">
            <button onClick={() => setLocation("/")} className="p-2 rounded-xl hover:bg-muted transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-black">{t("helper_dashboard.helper_dashboard")}</h1>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-5 text-center max-w-sm mx-auto">
          {helperStatus === "pending" ? (
            <>
              <div className="w-20 h-20 rounded-full bg-yellow-500/10 border-2 border-yellow-500/30 flex items-center justify-center">
                <Clock className="w-10 h-10 text-yellow-400" />
              </div>
              <div>
                <h2 className="text-xl font-black mb-2">{t("helper_dashboard.application_under_review")}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t("helper_dashboard.your_helper_application_is_pending_admin")}
                </p>
              </div>
              <div className="w-full bg-card border border-yellow-500/20 rounded-2xl p-4 text-left">
                <div className="text-[10px] font-black uppercase tracking-wider text-yellow-400 mb-1">{t("helper_dashboard.status")}</div>
                <div className="text-sm font-bold text-yellow-300">{t("helper_dashboard.pending_admin_review")}</div>
                <div className="text-xs text-muted-foreground mt-1">{t("helper_dashboard.applications_are_typically_reviewed_within_12")}</div>
              </div>
            </>
          ) : helperStatus === "denied" ? (
            <>
              <div className="w-20 h-20 rounded-full bg-destructive/10 border-2 border-destructive/30 flex items-center justify-center">
                <Award className="w-10 h-10 text-destructive" />
              </div>
              <div>
                <h2 className="text-xl font-black mb-2">{t("helper_dashboard.application_not_approved")}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t("helper_dashboard.your_helper_application_was_not_approved")}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center">
                <Heart className="w-10 h-10 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-black mb-2">{t("helper_dashboard.become_a_helper")}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t("helper_dashboard.apply_to_become_a_verified_niakofa")}
                </p>
              </div>
              <button
                onClick={() => setLocation("/login")}
                className="w-full bg-primary text-primary-foreground font-black py-3 rounded-2xl transition-all active:scale-[0.98]"
              >
                {t("helper_dashboard.apply_as_helper")}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const nearbyRequests = nearbyRaw as HelpRequest[];
  const myActiveRequests = (myActiveRaw as HelpRequest[]).filter(r => r.helper_id === currentUser.id);
  const openNearby = nearbyRequests.filter(r => r.status === "open");

  const filtered = filter === "emergency"
    ? openNearby.filter(r => r.urgency === "emergency" || r.urgency === "high")
    : filter === "near"
    ? openNearby.filter(r => (r.distance_miles ?? 99) < 2)
    : openNearby;

  const isAnchor = (currentUser.help_count ?? 0) >= 50 && (currentUser.trust_score ?? 0) >= 97;
  const helpCount = currentUser.help_count ?? 0;
  const trustScore = currentUser.trust_score ?? 0;

  const handleClaim = (req: HelpRequest) => {
    claimMutation.mutate(
      { id: req.id, data: { helper_id: currentUser.id } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetRequestsQueryKey() });
          toast({ title: t("helper_dashboard.request_claimed"), description: `Heading to "${req.title}"` });
          setLocation(`/request/${req.id}`);
        },
        onError: () => toast({ title: t("helper_dashboard.failed_to_claim"), variant: "destructive" }),
      }
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-28">
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl border-b border-border p-4 pt-safe">
        <div className="flex items-center gap-3">
          <button onClick={() => setLocation("/")} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-black flex items-center gap-2">
              {t("helper_dashboard.helper_dashboard_2")}
              {helperModeActive && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
            </h1>
            <p className="text-xs text-muted-foreground">{openNearby.length} {t("helper_dashboard.open_requests_nearby")}</p>
          </div>
          {isAnchor && (
            <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-full">
              <span className="text-sm">⚓</span>
              <span className="text-xs font-black text-amber-400">{t("helper_dashboard.anchor")}</span>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center text-center">
            <Heart className="w-4 h-4 text-primary mb-1" />
            <div className="text-2xl font-black text-primary">{helpCount}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("helper_dashboard.completed")}</div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center text-center">
            <Star className="w-4 h-4 text-yellow-400 mb-1" />
            <div className="text-2xl font-black text-yellow-400">{trustScore.toFixed(0)}%</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("helper_dashboard.trust_score")}</div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center text-center">
            <Activity className="w-4 h-4 text-green-400 mb-1" />
            {/* BUG-024: benevolence_wallet is the goodwill/donation pot — NOT real withdrawable earnings.
                Real earnings from Stripe transfers are tracked separately in transactions (type: "earned").
                Labeling this as "Earned" is misleading — renamed to "Goodwill Fund". */}
            <div className="text-2xl font-black text-green-400">${(currentUser.benevolence_wallet ?? 0).toFixed(0)}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("helper_dashboard.goodwill_fund")}</div>
          </div>
        </div>

        {/* Skills */}
        {(((currentUser as unknown as { specialties?: string[] }).specialties)?.length ?? 0) > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-primary" /> {t("helper_dashboard.your_skills")}
            </h3>
            <div className="flex flex-wrap gap-2">
              {((currentUser as unknown as { specialties?: string[] }).specialties ?? []).map(skill => {
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
              <Zap className="w-3.5 h-3.5" /> {t("helper_dashboard.active_claims")}
            </h3>
            <div className="space-y-2">
              {myActiveRequests.map(req => (
                <button
                  key={req.id}
                  onClick={() => setLocation(`/request/${req.id}`)}
                  className="w-full text-left bg-muted/40 rounded-xl p-3 border border-border hover:border-primary/40 transition-colors"
                >
                  <div className="font-bold text-sm truncate">{req.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${URGENCY_COLORS[req.urgency ?? "low"]}`}>
                      {req.urgency}
                    </span>
                    <span>{CATEGORY_LABELS[req.category ?? "other"] ?? req.category}</span>
                    {req.distance_miles != null && <span>· {req.distance_miles.toFixed(1)} {t("helper_dashboard.mi")}</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Available requests queue */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-primary" /> {t("helper_dashboard.nearby_queue")}{filtered.length})
            </h3>
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          </div>

          <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none">
            {([
              { key: "all" as FilterKey,       label: "All" },
              { key: "emergency" as FilterKey, label: "🚨 Urgent" },
              { key: "near" as FilterKey,      label: "📍 < 2 mi" },
            ]).map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border transition-all ${
                  filter === f.key ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border text-muted-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MapPin className="w-6 h-6 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t("helper_dashboard.no_requests_match_this_filter")}</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {filtered.slice(0, 10).map(req => (
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
                        {req.distance_miles != null && <span>· {req.distance_miles.toFixed(1)} {t("helper_dashboard.mi_2")}</span>}
                        {req.requester_name && <span>· {req.requester_name}</span>}
                      </div>
                      {/* match_reasons isn't in the generated OpenAPI types yet (added server-side
                          without a spec/codegen cycle) — accessed via a narrow cast rather than
                          widening HelpRequest's type for one optional field. */}
                      {(req as unknown as { match_reasons?: string[] }).match_reasons?.length ? (
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {(req as unknown as { match_reasons?: string[] }).match_reasons!.map((reason) => (
                            <span key={reason} className="text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
                              ✨ {reason}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {req.created_at && (
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {Math.round((Date.now() - new Date(req.created_at).getTime()) / 60000)} {t("helper_dashboard.min_ago")}
                        </div>
                      )}
                    </div>
                    {helperModeActive && (
                      <button
                        onClick={() => handleClaim(req)}
                        disabled={claimMutation.isPending}
                        className="shrink-0 bg-primary text-primary-foreground text-xs font-black px-3 py-1.5 rounded-xl disabled:opacity-50 active:scale-95 transition-all"
                      >
                        {t("helper_dashboard.claim")}
                      </button>
                    )}
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
                <div className="font-black text-sm text-amber-400">{t("helper_dashboard.youre_an_anchor_helper")}</div>
                <div className="text-xs text-muted-foreground">{t("helper_dashboard.top_pillar_of_the_niakofa_community")}</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("helper_dashboard.anchor_helpers_are_the_backbone_of")}
            </p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Award className="w-4 h-4 text-primary" />
              <div className="font-bold text-sm">{t("helper_dashboard.path_to_anchor_helper")}</div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{t("helper_dashboard.helps_completed")}</span>
                  <span className="font-bold">{helpCount} / 50</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min((helpCount / 50) * 100, 100)}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{t("helper_dashboard.trust_score_2")}</span>
                  <span className="font-bold">{trustScore.toFixed(0)}% / 97%</span>
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
