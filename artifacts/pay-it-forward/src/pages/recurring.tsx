import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, Plus, ChevronLeft, Trash2, Pause, Play,
  RefreshCw, Clock, MapPin, Tag, RotateCcw, AlertCircle
} from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { useAppContext } from "@/lib/AppContext";
import { useTranslation } from "react-i18next";
import { Star, CheckCircle2, MapPin as MapPinIcon } from "lucide-react";
import { TrustTierBadge } from "@/components/TrustTierBadge";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecurringRequest {
  id: number;
  title: string;
  description: string | null;
  category: string;
  payment_type: string;
  pay_it_forward_amount: number | null;
  lat: number;
  lng: number;
  neighborhood: string | null;
  recurrence: "daily" | "weekly" | "monthly";
  day_of_week: number | null;
  time_of_day: string;
  next_fire_at: string;
  last_fired_at: string | null;
  active: boolean;
  created_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CATEGORIES = [
  { value: "groceries", label: "🛒 Groceries" },
  { value: "ride",      label: "🚗 Ride" },
  { value: "errand",    label: "📦 Errand" },
  { value: "tech",      label: "💻 Tech Help" },
  { value: "meal",      label: "🍽️ Meal" },
  { value: "moving",    label: "📦 Moving" },
  { value: "childcare", label: "👶 Childcare" },
  { value: "other",     label: "💙 Other" },
];
const PAYMENT_TYPES = [
  { value: "goodwill",       label: "💙 Goodwill" },
  { value: "pay_it_forward", label: "🔄 Pay It Forward" },
  { value: "immediate",      label: "💳 Immediate Payment" },
];
const RECURRENCES = [
  { value: "daily",   label: "Every Day" },
  { value: "weekly",  label: "Every Week" },
  { value: "monthly", label: "Every Month" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function scheduleLabel(r: RecurringRequest): string {
  if (r.recurrence === "daily") return `Daily at ${fmt12(r.time_of_day)}`;
  if (r.recurrence === "weekly") {
    const day = r.day_of_week != null ? DAYS[r.day_of_week] : "Weekly";
    return `${day}s at ${fmt12(r.time_of_day)}`;
  }
  return `Monthly at ${fmt12(r.time_of_day)}`;
}

function fmt12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = (h ?? 0) >= 12 ? "PM" : "AM";
  const h12 = (h ?? 0) % 12 || 12;
  return `${h12}:${String(m ?? 0).padStart(2, "0")} ${ampm}`;
}

function fmtNext(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  if (diffMs < 0) return "Firing soon…";
  const diffH = diffMs / 3600000;
  if (diffH < 1) return `In ${Math.round(diffMs / 60000)} min`;
  if (diffH < 24) return `In ${Math.round(diffH)} hr`;
  const diffD = Math.ceil(diffH / 24);
  return `In ${diffD} day${diffD !== 1 ? "s" : ""}`;
}

function categoryLabel(cat: string) {
  return CATEGORIES.find(c => c.value === cat)?.label ?? cat;
}

// ── Main Component ────────────────────────────────────────────────────────────


// ── Matched Helper Types + Component (Phase 10F) ─────────────────────────────
interface MatchedHelper {
  id: number;
  name: string;
  avatar_url: string | null;
  trust_score: number | null;
  help_count: number | null;
  helper_bio: string | null;
  helper_skills: string[] | null;
  identity_verified: boolean | null;
  distance_miles: number | null;
  is_available_now: boolean;
  city: string | null;
}

function MatchedHelperCard({ helper }: { helper: MatchedHelper }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-3 flex items-start gap-3">
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-base font-black text-primary">
        {helper.avatar_url
          ? <img src={helper.avatar_url} alt={helper.name} className="w-10 h-10 rounded-full object-cover" />
          : helper.name[0]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-black text-sm text-foreground">{helper.name}</span>
          {helper.identity_verified && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded-full">
              <CheckCircle2 className="w-2.5 h-2.5" /> ID Verified
            </span>
          )}
          {helper.is_available_now && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-full">
              ● Available Now
            </span>
          )}
        </div>
        <TrustTierBadge trustScore={helper.trust_score ?? 0} helpCount={helper.help_count ?? 0} size="xs" />
        {helper.helper_bio && (
          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{helper.helper_bio}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {helper.distance_miles !== null && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <MapPinIcon className="w-2.5 h-2.5" />{helper.distance_miles} mi
            </span>
          )}
          {(helper.helper_skills ?? []).slice(0, 3).map((s: string) => (
            <span key={s} className="text-[9px] bg-muted text-muted-foreground rounded-full px-2 py-0.5 capitalize">
              {s.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function MatchedHelpersSection({ lat, lng }: { lat: number | null; lng: number | null }) {
  const [helpers, setHelpers] = useState<MatchedHelper[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ limit: "8" });
    if (lat !== null && lng !== null) {
      params.set("lat", String(lat));
      params.set("lng", String(lng));
    }
    fetch(`/api/recurring/matched-helpers?${params}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("nia_token") ?? ""}` },
    })
      .then(r => r.json())
      .then(data => {
        setHelpers(data.helpers ?? []);
        setMessage(data.message ?? null);
      })
      .catch(() => setMessage("Could not load matched helpers"))
      .finally(() => setLoading(false));
  }, [lat, lng]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (helpers.length === 0) {
    return (
      <div className="text-center py-6 px-4">
        <Star className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">{message ?? "No matched helpers found yet — check back as more helpers set their availability."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {message && helpers.length > 0 && (
        <p className="text-[11px] text-muted-foreground px-1">{message}</p>
      )}
      {helpers.map(h => <MatchedHelperCard key={h.id} helper={h} />)}
    </div>
  );
}

export default function RecurringScreen() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { currentUser } = useAppContext();
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const [subscriptions, setSubscriptions] = useState<RecurringRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const authHeader = useCallback((): Record<string, string> => {
    const token = localStorage.getItem("niakofa_token") ?? "";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${base}/api/recurring`, { headers: authHeader() });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as RecurringRequest[];
      setSubscriptions(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: t("recurring.couldnt_load_recurring_requests"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [base, authHeader]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (id: number, active: boolean) => {
    setActionLoading(id);
    try {
      const res = await fetch(`${base}/api/recurring/${id}`, {
        method: "PATCH",
        headers: authHeader(),
        body: JSON.stringify({ active }),
      });
      if (!res.ok) throw new Error("Failed");
      setSubscriptions(prev => prev.map(s => s.id === id ? { ...s, active } : s));
      toast({ title: active ? "▶ Recurring request resumed" : "⏸ Recurring request paused" });
    } catch {
      toast({ title: t("recurring.action_failed"), variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const remove = async (id: number) => {
    setActionLoading(id);
    try {
      const res = await fetch(`${base}/api/recurring/${id}`, {
        method: "DELETE",
        headers: authHeader(),
      });
      if (!res.ok) throw new Error("Failed");
      setSubscriptions(prev => prev.filter(s => s.id !== id));
      setDeleteConfirm(null);
      toast({ title: t("recurring.recurring_request_removed") });
    } catch {
      toast({ title: t("recurring.delete_failed"), variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const active = subscriptions.filter(s => s.active);
  const paused = subscriptions.filter(s => !s.active);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
          <Button variant="ghost" size="icon" onClick={() => setLocation("/wallet")} className="rounded-full shrink-0 -ml-1" aria-label={t("recurring.back_to_wallet")}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="font-black text-base">{t("recurring.recurring_requests")}</h1>
            <p className="text-[10px] text-muted-foreground">{t("recurring.autopost_help_requests_on_a_schedule")}</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95"
            aria-label={t("recurring.create_new_recurring_request")}
          >
            <Plus className="w-3.5 h-3.5" />
            {t("recurring.new")}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4 pb-24 space-y-6 max-w-lg mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-sm">{t("recurring.loading")}</span>
          </div>
        ) : subscriptions.length === 0 ? (
          <EmptyState onCreate={() => setShowCreate(true)} />
        ) : (
          <>
            {active.length > 0 && (
              <section className="space-y-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-primary">
                  {t("recurring.active")} {active.length}
                </div>
                {active.map(s => (
                  <SubscriptionCard
                    key={s.id}
                    sub={s}
                    loading={actionLoading === s.id}
                    onToggle={() => toggle(s.id, false)}
                    onDelete={() => setDeleteConfirm(s.id)}
                  />
                ))}
              </section>
            )}

            {paused.length > 0 && (
              <section className="space-y-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  {t("recurring.paused")} {paused.length}
                </div>
                {paused.map(s => (
                  <SubscriptionCard
                    key={s.id}
                    sub={s}
                    loading={actionLoading === s.id}
                    onToggle={() => toggle(s.id, true)}
                    onDelete={() => setDeleteConfirm(s.id)}
                  />
                ))}
              </section>
            )}
          </>
        )}

        {/* Explainer card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-primary/5 border border-primary/20 rounded-2xl p-4"
        >
          <div className="flex gap-3">
            <RotateCcw className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-sm text-primary mb-1">{t("recurring.how_recurring_requests_work")}</div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("recurring.set_a_schedule_daily_weekly_or")}
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Delete confirm sheet */}
      <AnimatePresence>
        {deleteConfirm !== null && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm"
              onClick={() => setDeleteConfirm(null)}
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 220 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-3xl p-6"
              style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-5" />
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-red-500/15 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <div className="font-black text-base">{t("recurring.delete_recurring_request")}</div>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("recurring.this_cant_be_undone_future_postings")}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="rounded-2xl h-12">
                  {t("recurring.keep_it")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => remove(deleteConfirm)}
                  disabled={actionLoading === deleteConfirm}
                  className="rounded-2xl h-12 font-black"
                >
                  {actionLoading === deleteConfirm ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Delete"}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Create sheet */}
      <AnimatePresence>
        {showCreate && (
          <CreateSheet
            base={base}
            authHeader={authHeader}
            lat={currentUser?.lat ?? 32.7555}
            lng={currentUser?.lng ?? -97.3308}
            onClose={() => setShowCreate(false)}
            onCreated={() => { setShowCreate(false); load(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Subscription Card ─────────────────────────────────────────────────────────

function SubscriptionCard({
  sub, loading, onToggle, onDelete,
}: {
  sub: RecurringRequest;
  loading: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`bg-card border rounded-2xl p-4 transition-all ${sub.active ? "border-primary/20" : "border-border opacity-60"}`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${sub.active ? "bg-primary/15" : "bg-muted"}`}>
          <Calendar className={`w-5 h-5 ${sub.active ? "text-primary" : "text-muted-foreground"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-black text-sm truncate">{sub.title}</div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Tag className="w-3 h-3" />{categoryLabel(sub.category)}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="w-3 h-3" />{scheduleLabel(sub)}
            </span>
            {sub.neighborhood && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <MapPin className="w-3 h-3" />{sub.neighborhood}
              </span>
            )}
          </div>
          {sub.active && (
            <div className="mt-1.5 text-[10px] text-primary font-bold">
              {t("recurring.next")} {fmtNext(sub.next_fire_at)}
            </div>
          )}
          {sub.last_fired_at && (
            <div className="text-[10px] text-muted-foreground/60 mt-0.5">
              {t("recurring.last_posted")} {new Date(sub.last_fired_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
          )}
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={onToggle}
            disabled={loading}
            className="p-2 rounded-xl border border-border hover:border-primary/40 transition-colors disabled:opacity-50"
            aria-label={sub.active ? "Pause recurring request" : "Resume recurring request"}
          >
            {loading ? (
              <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
            ) : sub.active ? (
              <Pause className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <Play className="w-3.5 h-3.5 text-primary" />
            )}
          </button>
          <button
            onClick={onDelete}
            disabled={loading}
            className="p-2 rounded-xl border border-border hover:border-red-500/40 transition-colors disabled:opacity-50"
            aria-label={t("recurring.delete_recurring_request_2")}
          >
            <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="text-center py-16 px-6"
    >
      <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-4">
        <Calendar className="w-10 h-10 text-primary/60" />
      </div>
      <div className="font-black text-lg mb-2">{t("recurring.no_recurring_requests_yet")}</div>
      <p className="text-sm text-muted-foreground leading-relaxed mb-6">
        {t("recurring.schedule_repeating_help_requests_that_autopost")}
      </p>
      <Button onClick={onCreate} className="rounded-2xl px-6 font-black gap-2">
        <Plus className="w-4 h-4" />
        {t("recurring.schedule_your_first_request")}
      </Button>
    </motion.div>
  );
}

// ── Create Sheet ──────────────────────────────────────────────────────────────

function CreateSheet({
  base, authHeader, lat, lng, onClose, onCreated,
}: {
  base: string;
  authHeader: () => Record<string, string>;
  lat: number;
  lng: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("groceries");
  const [paymentType, setPaymentType] = useState("goodwill");
  const [recurrence, setRecurrence] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [dayOfWeek, setDayOfWeek] = useState(2); // Tuesday default
  const [timeOfDay, setTimeOfDay] = useState("09:00");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"details" | "schedule">("details");

  const valid = title.trim().length >= 3;

  const submit = async () => {
    if (!valid) return;
    setLoading(true);
    try {
      const res = await fetch(`${base}/api/recurring`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          payment_type: paymentType,
          lat,
          lng,
          recurrence,
          day_of_week: recurrence === "weekly" ? dayOfWeek : undefined,
          time_of_day: timeOfDay,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Failed");
      }
      toast({ title: t("recurring.recurring_request_scheduled") });
      onCreated();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Failed to create", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 26, stiffness: 220 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-3xl"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-10 h-1 bg-muted rounded-full mx-auto mt-3 mb-4" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-4 border-b border-border">
          <div>
            <div className="font-black text-base">{t("recurring.schedule_recurring_request")}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {t("recurring.step")} {step === "details" ? "1" : "2"} {t("recurring.of_2")} {step === "details" ? "Request details" : "Schedule"}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition-colors" aria-label={t("recurring.close")}>
            <ChevronLeft className="w-4 h-4 rotate-180 text-muted-foreground" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          <AnimatePresence mode="wait">
            {step === "details" ? (
              <motion.div key="details" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-4">
                {/* Title */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block mb-1.5">
                    {t("recurring.what_do_you_need_help_with")}
                  </label>
                  <Input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder={t("recurring.eg_grocery_pickup_from_walmart")}
                    maxLength={120}
                    className="bg-muted border-border rounded-xl h-11"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block mb-1.5">
                    {t("recurring.details_optional")}
                  </label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder={t("recurring.any_helpful_details_for_your_helper")}
                    rows={2}
                    maxLength={500}
                    className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block mb-1.5">{t("recurring.category")}</label>
                  <div className="grid grid-cols-4 gap-2">
                    {CATEGORIES.map(c => (
                      <button
                        key={c.value}
                        onClick={() => setCategory(c.value)}
                        className={`p-2 rounded-xl border text-center transition-all text-[10px] font-bold leading-tight ${
                          category === c.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Payment type */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block mb-1.5">{t("recurring.payment")}</label>
                  <div className="grid grid-cols-3 gap-2">
                    {PAYMENT_TYPES.map(p => (
                      <button
                        key={p.value}
                        onClick={() => setPaymentType(p.value)}
                        className={`p-2.5 rounded-xl border text-center transition-all text-[10px] font-bold leading-tight ${
                          paymentType === p.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="schedule" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} className="space-y-4">
                {/* Recurrence */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block mb-1.5">{t("recurring.repeat")}</label>
                  <div className="grid grid-cols-3 gap-2">
                    {RECURRENCES.map(r => (
                      <button
                        key={r.value}
                        onClick={() => setRecurrence(r.value as "daily" | "weekly" | "monthly")}
                        className={`p-3 rounded-xl border text-center transition-all text-xs font-black ${
                          recurrence === r.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Day of week (weekly only) */}
                {recurrence === "weekly" && (
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block mb-1.5">{t("recurring.day_of_week")}</label>
                    <div className="grid grid-cols-7 gap-1">
                      {DAYS.map((d, i) => (
                        <button
                          key={d}
                          onClick={() => setDayOfWeek(i)}
                          className={`py-2 rounded-xl border text-center transition-all text-[10px] font-black ${
                            dayOfWeek === i ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"
                          }`}
                        >
                          {d.slice(0, 1)}
                        </button>
                      ))}
                    </div>
                    <div className="text-[10px] text-primary font-bold mt-1">{t("recurring.every")} {DAYS[dayOfWeek]}</div>
                  </div>
                )}

                {/* Time */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block mb-1.5">{t("recurring.time")}</label>
                  <input
                    type="time"
                    value={timeOfDay}
                    onChange={e => setTimeOfDay(e.target.value)}
                    className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {t("recurring.a_new_request_will_be_posted")}
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-primary/5 border border-primary/20 rounded-2xl p-3">
                  <div className="text-[10px] font-black uppercase tracking-wider text-primary mb-1">{t("recurring.summary")}</div>
                  <div className="text-sm font-bold truncate">{title}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {recurrence === "daily" && `Posts daily at ${fmt12(timeOfDay)}`}
                    {recurrence === "weekly" && `Posts every ${DAYS[dayOfWeek]} at ${fmt12(timeOfDay)}`}
                    {recurrence === "monthly" && `Posts monthly at ${fmt12(timeOfDay)}`}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer buttons */}
        <div className="px-5 pt-3 flex gap-3">
          {step === "details" ? (
            <>
              <Button variant="outline" onClick={onClose} className="flex-1 rounded-2xl h-12">{t("recurring.cancel")}</Button>
              <Button
                onClick={() => setStep("schedule")}
                disabled={!valid}
                className="flex-1 rounded-2xl h-12 font-black"
              >
                {t("recurring.next_schedule")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("details")} className="rounded-2xl h-12 w-24">{t("recurring.back")}</Button>
              <Button
                onClick={submit}
                disabled={loading || !valid}
                className="flex-1 rounded-2xl h-12 font-black gap-2"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Calendar className="w-4 h-4" /> {t("recurring.schedule")}</>}
              </Button>
            </>
          )}
        </div>
      </motion.div>
    </>
  );
}
