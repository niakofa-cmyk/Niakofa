import { useState } from "react";
import { useLocation } from "wouter";
import { useAppContext } from "@/lib/AppContext";
import {
  useGetNearbyRequests, useGetRequests, useClaimRequest,
  getGetNearbyRequestsQueryKey, getGetRequestsQueryKey,
} from "@workspace/api-client-react";
import type { HelpRequest } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Activity, Star, MapPin, Clock, Heart, Award, Wrench, Zap, Filter, DollarSign, Coins } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";

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

  const { data: nearbyRaw = [] } = useGetNearbyRequests(
    { lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: 10 },
    { query: { enabled: !!myLocation, queryKey: getGetNearbyRequestsQueryKey({ lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: 10 }) } }
  );

  const { data: myActiveRaw = [] } = useGetRequests(
    { status: "claimed" },
    { query: { enabled: !!currentUser?.id, queryKey: getGetRequestsQueryKey({ status: "claimed" }) } }
  );

  const claimMutation = useClaimRequest();

  if (!currentUser) return null;

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
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl border-b border-border p-4 pt-safe">
        <div className="flex items-center gap-3">
          <button onClick={() => setLocation("/")} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-black flex items-center gap-2">
              Helper Dashboard
              {helperModeActive && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
            </h1>
            <p className="text-xs text-muted-foreground">{openNearby.length} open requests nearby</p>
          </div>
          {isAnchor && (
            <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-full">
              <span className="text-sm">⚓</span>
              <span className="text-xs font-black text-amber-400">Anchor</span>
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
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Completed</div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center text-center">
            <Star className="w-4 h-4 text-yellow-400 mb-1" />
            <div className="text-2xl font-black text-yellow-400">{trustScore.toFixed(0)}%</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Trust Score</div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center text-center">
            <Activity className="w-4 h-4 text-green-400 mb-1" />
            <div className="text-2xl font-black text-green-400">${(currentUser.benevolence_wallet ?? 0).toFixed(0)}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Earned</div>
          </div>
        </div>

        {/* Skills */}
        {(currentUser.specialties?.length ?? 0) > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-primary" /> Your Skills
            </h3>
            <div className="flex flex-wrap gap-2">
              {currentUser.specialties!.map(skill => {
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
              <Zap className="w-3.5 h-3.5" /> Active Claims
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
                    {req.distance_miles != null && <span>· {req.distance_miles.toFixed(1)} mi</span>}
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
              <MapPin className="w-3.5 h-3.5 text-primary" /> Nearby Queue ({filtered.length})
            </h3>
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          </div>

          <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4">
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
              <p className="text-sm">No requests match this filter</p>
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
                        {req.distance_miles != null && <span>· {req.distance_miles.toFixed(1)} mi</span>}
                        {req.requester_name && <span>· {req.requester_name}</span>}
                      </div>
                      {req.created_at && (
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {Math.round((Date.now() - new Date(req.created_at).getTime()) / 60000)} min ago
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                      {/* Payment type — shown before claiming so helpers know what they're signing up for */}
                      {(req as HelpRequest & { payment_type?: string; pay_it_forward_amount?: number }).payment_type === "immediate" &&
                        (req as HelpRequest & { pay_it_forward_amount?: number }).pay_it_forward_amount ? (
                        <div className="flex items-center gap-0.5 text-[10px] font-black text-green-400 bg-green-400/10 border border-green-400/20 px-1.5 py-0.5 rounded-full">
                          <DollarSign className="w-2.5 h-2.5" />
                          {((req as HelpRequest & { pay_it_forward_amount?: number }).pay_it_forward_amount!).toFixed(0)}
                        </div>
                      ) : (req as HelpRequest & { payment_type?: string }).payment_type === "pay_it_forward" ? (
                        <div className="flex items-center gap-0.5 text-[10px] font-black text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-full"
                             title="Community pool guarantees your pay — minimum wage protected">
                          <Coins className="w-2.5 h-2.5" />
                          Pool pays
                        </div>
                      ) : null}
                      {helperModeActive && (
                        <button
                          onClick={() => handleClaim(req)}
                          disabled={claimMutation.isPending}
                          className="shrink-0 bg-primary text-primary-foreground text-xs font-black px-3 py-1.5 rounded-xl disabled:opacity-50 active:scale-95 transition-all"
                        >
                          Claim
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
                  <span className="font-bold">{helpCount} / 50</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min((helpCount / 50) * 100, 100)}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Trust score</span>
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
