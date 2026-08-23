/**
 * Civic Needs Marketplace
 *
 * The two-way half of the civic portal (migration 0057): approved
 * gov-sponsors post concrete needs here, any authenticated helper/business
 * can browse and claim them, mark them complete, and the sponsor gets a
 * NET30 invoice for the county to pay. This is what makes the civic-needs
 * backend actually reachable by end users.
 *
 * Route: /civic-needs
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  ClipboardList, ChevronLeft, Plus, Clock, CheckCircle2,
  AlertCircle, DollarSign, Send, RefreshCw, Receipt, X, Landmark,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { authHeaders } from "@/lib/auth";
import { useAppContext } from "@/lib/AppContext";
import { usePersistedState } from "@/hooks/usePersistedState";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

type NeedStatus = "open" | "claimed" | "completed" | "cancelled";

interface CivicNeed {
  id: number;
  title: string;
  description: string | null;
  category: string;
  estimated_cost: string | null;
  due_date: string | null;
  status: NeedStatus;
  claimed_by_user_id: number | null;
  claimed_at: string | null;
  completed_at: string | null;
  created_at: string;
  sponsor_entity_name?: string;
  sponsor_county?: string;
  sponsor_state?: string;
}

interface CivicInvoice {
  id: number;
  civic_need_id: number;
  amount: string;
  due_date: string;
  status: "pending" | "paid";
  paid_at: string | null;
  created_at: string;
}

interface GovSponsorApp {
  id: number;
  entity_name: string;
  approval_status: "pending" | "approved" | "rejected";
}

const CATEGORIES = [
  { value: "infrastructure",   label: "🛣️ Infrastructure" },
  { value: "cleanup",          label: "🧹 Cleanup" },
  { value: "elder_care",       label: "👵 Elder Care" },
  { value: "food_security",    label: "🍽️ Food Security" },
  { value: "disaster_relief",  label: "🌪️ Disaster Relief" },
  { value: "education",        label: "📚 Education" },
  { value: "public_safety",    label: "🚨 Public Safety" },
  { value: "other",            label: "📋 Other" },
];

function categoryLabel(cat: string) {
  return CATEGORIES.find(c => c.value === cat)?.label ?? cat;
}

const STATUS_STYLE: Record<NeedStatus, string> = {
  open: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  claimed: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  completed: "text-muted-foreground bg-muted/40 border-border",
  cancelled: "text-red-400 bg-red-500/10 border-red-500/30",
};

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const BLANK_FORM = {
  title: "",
  description: "",
  category: "other",
  estimated_cost: "",
  due_date: "",
};

type MainTab = "browse" | "mine" | "post";

export default function CivicNeedsPage() {
  const [, setLocation] = useLocation();
  const { currentUser } = useAppContext();

  const [mainTab, setMainTab] = useState<MainTab>("browse");
  const [sponsor, setSponsor] = useState<GovSponsorApp | null>(null);
  const [loadingSponsor, setLoadingSponsor] = useState(true);

  // Data-loss fix: these three lists used to be plain useState([]), which
  // meant leaving this screen (unmount) and coming back — or a hard
  // refresh — always started from an empty array and showed "No civic
  // needs" for a beat before the re-fetch resolved. usePersistedState
  // mirrors each list to sessionStorage so the last-known-good data paints
  // immediately on remount while the fresh fetch happens in the
  // background. Error handling below is unchanged — a failed fetch still
  // never clears these lists, it just skips the setter entirely.
  const [openNeeds, setOpenNeeds] = usePersistedState<CivicNeed[]>("niakofa_civic_open_needs", []);
  const [claimedNeeds, setClaimedNeeds] = usePersistedState<CivicNeed[]>("niakofa_civic_claimed_needs", []);
  const [myPosted, setMyPosted] = usePersistedState<CivicNeed[]>("niakofa_civic_my_posted_needs", []);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({ ...BLANK_FORM });
  const [submitting, setSubmitting] = useState(false);

  const [invoicesFor, setInvoicesFor] = useState<CivicNeed | null>(null);
  const [invoices, setInvoices] = useState<CivicInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  const [completing, setCompleting] = useState<CivicNeed | null>(null);
  const [finalCost, setFinalCost] = useState("");

  // Deep-link support: the community map's civic-need markers/rows link here
  // as /civic-needs?need=<id> rather than a dedicated detail route (there
  // isn't one — this page's Browse tab already renders each need in full).
  // We just highlight and scroll to it once the open-needs list has loaded.
  const [highlightNeedId] = useState<number | null>(() => {
    const v = new URLSearchParams(window.location.search).get("need");
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  });
  const needCardRefs = useState(() => new Map<number, HTMLDivElement>())[0];

  // Check for an approved gov-sponsor record so we know whether to show "Post"
  useEffect(() => {
    if (!currentUser) { setLoadingSponsor(false); return; }
    fetch(`${BASE}/api/gov-sponsors/mine`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() as Promise<GovSponsorApp[]> : [])
      .then((apps) => setSponsor(apps.find(a => a.approval_status === "approved") ?? null))
      .catch(() => {})
      .finally(() => setLoadingSponsor(false));
  }, [currentUser]);

  const hasOpenLoadedRef = useRef(false);
  const hasClaimedLoadedRef = useRef(false);
  const hasMineLoadedRef = useRef(false);

  const fetchOpen = useCallback(async () => {
    if (!hasOpenLoadedRef.current) setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/civic/needs?status=open`, { headers: authHeaders() });
      if (res.ok) { setOpenNeeds(await res.json()); hasOpenLoadedRef.current = true; }
    } finally {
      setLoading(false);
    }
  }, [setOpenNeeds]);

  const fetchClaimed = useCallback(async () => {
    if (!currentUser) return;
    if (!hasClaimedLoadedRef.current) setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/civic/needs?status=claimed`, { headers: authHeaders() });
      if (res.ok) {
        const all: CivicNeed[] = await res.json();
        setClaimedNeeds(all.filter(n => n.claimed_by_user_id === currentUser.id));
        hasClaimedLoadedRef.current = true;
      }
    } finally {
      setLoading(false);
    }
  }, [currentUser, setClaimedNeeds]);

  const fetchMine = useCallback(async () => {
    if (!sponsor) return;
    if (!hasMineLoadedRef.current) setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/civic/needs/mine`, { headers: authHeaders() });
      if (res.ok) { setMyPosted(await res.json()); hasMineLoadedRef.current = true; }
    } finally {
      setLoading(false);
    }
  }, [sponsor, setMyPosted]);

  useEffect(() => {
    if (mainTab === "browse") { fetchOpen(); fetchClaimed(); }
    if (mainTab === "mine") fetchMine();
  }, [mainTab, fetchOpen, fetchClaimed, fetchMine]);

  useEffect(() => {
    if (highlightNeedId == null || openNeeds.length === 0) return;
    const t = setTimeout(() => {
      needCardRefs.get(highlightNeedId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => clearTimeout(t);
  }, [highlightNeedId, openNeeds, needCardRefs]);

  const claimNeed = async (need: CivicNeed) => {
    try {
      const res = await fetch(`${BASE}/api/civic/needs/${need.id}/claim`, {
        method: "PATCH",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to claim");
      toast({ title: "Need claimed", description: `You've taken on "${need.title}". Complete it, then mark it done.` });
      fetchOpen();
      fetchClaimed();
    } catch (err) {
      toast({ title: "Couldn't claim need", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    }
  };

  const submitComplete = async () => {
    if (!completing) return;
    setSubmitting(true);
    try {
      const body: Record<string, number> = {};
      if (finalCost.trim()) {
        const v = Number(finalCost);
        if (!isNaN(v) && v >= 0) body.final_cost = v;
      }
      const res = await fetch(`${BASE}/api/civic/needs/${completing.id}/complete`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to complete");
      toast({ title: "Marked complete 🎉", description: "A NET30 invoice was generated for the sponsor." });
      setCompleting(null);
      setFinalCost("");
      fetchClaimed();
    } catch (err) {
      toast({ title: "Couldn't complete need", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const cancelNeed = async (need: CivicNeed) => {
    try {
      const res = await fetch(`${BASE}/api/civic/needs/${need.id}/cancel`, {
        method: "PATCH",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to cancel");
      toast({ title: "Need cancelled" });
      fetchMine();
    } catch (err) {
      toast({ title: "Couldn't cancel", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    }
  };

  const viewInvoices = async (need: CivicNeed) => {
    // Clear on switching to a *different* need — otherwise a failed fetch
    // below could leave the previous need's invoices showing under this
    // one's modal, which is worse than an empty list (wrong data, not just
    // missing data). Re-opening the *same* need (e.g. a manual retry) keeps
    // whatever's already showing instead of flashing empty first.
    // Don't wipe invoices immediately — keep previous rows visible during the
    // fetch so there's no flash-empty when switching between civic needs.
    // The new rows replace them once the fetch resolves.
    setInvoicesFor(need);
    setLoadingInvoices(true);
    try {
      const res = await fetch(`${BASE}/api/civic/needs/${need.id}/invoices`, { headers: authHeaders() });
      // Only replace the list on a genuine success — a transient network
      // blip used to wipe whatever was previously loaded (same
      // "setXxx([]) on any failure" anti-pattern already fixed for the
      // Audio Circles list and admin civic-requests loader). Leaving the
      // prior list in place on failure means a flaky retry doesn't look
      // like the invoices vanished.
      if (res.ok) setInvoices(await res.json());
    } finally {
      setLoadingInvoices(false);
    }
  };

  const handleSubmitPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        category: form.category,
      };
      if (form.estimated_cost.trim()) {
        const v = Number(form.estimated_cost);
        if (!isNaN(v) && v >= 0) payload.estimated_cost = v;
      }
      if (form.due_date) payload.due_date = form.due_date;

      const res = await fetch(`${BASE}/api/civic/needs`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to post need");
      toast({ title: "Need posted", description: "Helpers and businesses can now claim it." });
      setForm({ ...BLANK_FORM });
      setMyPosted(prev => [data, ...prev]);
      setMainTab("mine");
    } catch (err) {
      toast({ title: "Couldn't post need", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-4">
        <ClipboardList className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">Sign in to browse or post civic needs.</p>
        <Button onClick={() => setLocation("/")}>Go Home</Button>
      </div>
    );
  }

  const tabs: { key: MainTab; label: string }[] = [
    { key: "browse", label: "🔍 Browse" },
    { key: "mine", label: "📋 My Needs" },
    { key: "post", label: "➕ Post" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col pb-24">
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl border-b border-border p-4 pt-safe">
        <button
          onClick={() => setLocation("/community")}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back
        </button>
        <h1 className="text-xl font-black uppercase tracking-widest flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" /> Civic Needs
        </h1>
        <p className="text-[11px] text-muted-foreground mt-1">County-posted needs, claimed and fulfilled by the community</p>

        <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setMainTab(t.key)}
              style={{ touchAction: "manipulation", minHeight: "40px" }}
              className={`shrink-0 flex items-center justify-center py-2 px-4 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all active:scale-95 whitespace-nowrap ${
                mainTab === t.key
                  ? "bg-primary text-primary-foreground shadow-[0_0_14px_rgba(0,212,255,0.35)]"
                  : "bg-muted/80 text-muted-foreground border border-border/60 hover:text-foreground hover:bg-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-4 max-w-lg mx-auto w-full space-y-4">

        {/* BROWSE TAB */}
        {mainTab === "browse" && (
          <div className="space-y-4">
            {claimedNeeds.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Your claimed needs</p>
                {claimedNeeds.map(n => (
                  <div key={n.id} className="bg-card border border-border rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-[14px]">{n.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {categoryLabel(n.category)} · {n.sponsor_entity_name ?? "County"}
                        </p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold shrink-0 ${STATUS_STYLE[n.status]}`}>
                        {n.status}
                      </span>
                    </div>
                    {n.description && (
                      <p className="text-[12px] text-foreground/80 mt-2 leading-relaxed">{n.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                      {n.estimated_cost && (
                        <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> ${Number(n.estimated_cost).toFixed(2)} est.</span>
                      )}
                      {n.due_date && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Due {fmtDate(n.due_date)}</span>}
                    </div>
                    <Button
                      size="sm"
                      className="w-full mt-3"
                      onClick={() => { setCompleting(n); setFinalCost(n.estimated_cost ?? ""); }}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1.5" /> Mark complete
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Open needs</p>
              <button onClick={fetchOpen} className="text-[11px] text-primary flex items-center gap-1 active:opacity-60">
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>

            {loading && openNeeds.length === 0 && (
              <div className="text-center py-10 text-muted-foreground text-[13px]">Loading needs…</div>
            )}

            {!loading && openNeeds.length === 0 && (
              <div className="bg-card border border-border rounded-2xl p-6 text-center">
                <ClipboardList className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-[13px] text-muted-foreground">No open needs right now. Check back soon.</p>
              </div>
            )}

            {openNeeds.map(n => (
              <div
                key={n.id}
                ref={(el) => { if (el) needCardRefs.set(n.id, el); else needCardRefs.delete(n.id); }}
                className={`bg-card border rounded-2xl p-4 transition-colors ${
                  highlightNeedId === n.id ? "border-primary ring-2 ring-primary/40" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[14px]">{n.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Landmark className="w-3 h-3" /> {n.sponsor_entity_name ?? "County"}
                      {n.sponsor_county && <span>· {n.sponsor_county}, {n.sponsor_state}</span>}
                    </p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-bold shrink-0">
                    {categoryLabel(n.category)}
                  </span>
                </div>
                {n.description && (
                  <p className="text-[12px] text-foreground/80 mt-2 leading-relaxed">{n.description}</p>
                )}
                <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                  {n.estimated_cost && (
                    <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> ${Number(n.estimated_cost).toFixed(2)} est.</span>
                  )}
                  {n.due_date && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Due {fmtDate(n.due_date)}</span>}
                </div>
                <Button size="sm" className="w-full mt-3" onClick={() => claimNeed(n)}>
                  <Send className="w-4 h-4 mr-1.5" /> Claim this need
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* MY NEEDS TAB (sponsor's posted needs) */}
        {mainTab === "mine" && (
          <div className="space-y-3">
            {loadingSponsor ? (
              <div className="text-center py-10 text-muted-foreground text-[13px]">Loading…</div>
            ) : !sponsor ? (
              <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-3">
                <Landmark className="w-10 h-10 text-muted-foreground mx-auto" />
                <p className="text-[13px] text-muted-foreground">
                  Only approved government/county sponsors can post civic needs.
                </p>
                <Button variant="outline" onClick={() => setLocation("/gov-sponsor/apply")}>
                  Apply as a sponsor
                </Button>
              </div>
            ) : loading && myPosted.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-[13px]">Loading…</div>
            ) : myPosted.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-6 text-center">
                <p className="text-[13px] text-muted-foreground">You haven't posted any needs yet.</p>
                <Button size="sm" className="mt-3" onClick={() => setMainTab("post")}>
                  <Plus className="w-4 h-4 mr-1.5" /> Post a need
                </Button>
              </div>
            ) : (
              myPosted.map(n => (
                <div key={n.id} className="bg-card border border-border rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-[14px]">{n.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{categoryLabel(n.category)}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold shrink-0 ${STATUS_STYLE[n.status]}`}>
                      {n.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                    {n.estimated_cost && (
                      <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> ${Number(n.estimated_cost).toFixed(2)}</span>
                    )}
                    {n.due_date && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Due {fmtDate(n.due_date)}</span>}
                  </div>
                  <div className="flex gap-2 mt-3">
                    {n.status === "completed" && (
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => viewInvoices(n)}>
                        <Receipt className="w-3.5 h-3.5 mr-1.5" /> Invoice
                      </Button>
                    )}
                    {(n.status === "open" || n.status === "claimed") && (
                      <Button size="sm" variant="outline" className="flex-1 text-red-400" onClick={() => cancelNeed(n)}>
                        <X className="w-3.5 h-3.5 mr-1.5" /> Cancel
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* POST TAB */}
        {mainTab === "post" && (
          <>
            {loadingSponsor ? (
              <div className="text-center py-10 text-muted-foreground text-[13px]">Loading…</div>
            ) : !sponsor ? (
              <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-3">
                <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
                <p className="text-[13px] text-muted-foreground">
                  You need an approved government/county sponsor account to post civic needs.
                </p>
                <Button variant="outline" onClick={() => setLocation("/gov-sponsor/apply")}>
                  Apply as a sponsor
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmitPost} className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Title</label>
                  <Input
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Clear storm debris from Elm St."
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Description</label>
                  <textarea
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    rows={3}
                    className="w-full mt-1 p-2.5 rounded-lg bg-muted/40 border border-border text-[13px] resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                    style={{ fontSize: "16px" }}
                    placeholder="Details helpers should know before claiming this…"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Category</label>
                  <select
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full mt-1 p-2.5 rounded-lg bg-muted/40 border border-border text-[13px]"
                    style={{ fontSize: "16px" }}
                  >
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Est. cost ($)</label>
                    <Input
                      type="number"
                      min="0"
                      value={form.estimated_cost}
                      onChange={e => setForm(f => ({ ...f, estimated_cost: e.target.value }))}
                      placeholder="150"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Due date</label>
                    <Input
                      type="date"
                      value={form.due_date}
                      onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Once claimed and completed, {sponsor.entity_name} will receive a NET30 invoice for the final cost.
                </p>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Posting…" : <><Plus className="w-4 h-4 mr-1.5" /> Post need</>}
                </Button>
              </form>
            )}
          </>
        )}
      </div>

      {/* Complete modal */}
      {completing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setCompleting(null)}>
          <div className="bg-card border border-border rounded-2xl p-4 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="text-[15px] font-black mb-1">Mark "{completing.title}" complete</p>
            <p className="text-[12px] text-muted-foreground mb-3">
              This generates a NET30 invoice for the sponsor. Enter the final cost, or leave blank to use the estimate.
            </p>
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Final cost ($)</label>
            <Input
              type="number"
              min="0"
              value={finalCost}
              onChange={e => setFinalCost(e.target.value)}
              placeholder={completing.estimated_cost ?? "0.00"}
              className="mb-3"
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setCompleting(null)}>Cancel</Button>
              <Button className="flex-1" onClick={submitComplete} disabled={submitting}>
                {submitting ? "Saving…" : "Mark complete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Invoices modal */}
      {invoicesFor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setInvoicesFor(null)}>
          <div className="bg-card border border-border rounded-2xl p-4 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[15px] font-black">Invoices — {invoicesFor.title}</p>
              <button onClick={() => setInvoicesFor(null)} className="p-1 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            {loadingInvoices ? (
              <p className="text-[13px] text-muted-foreground text-center py-4">Loading…</p>
            ) : invoices.length === 0 ? (
              <p className="text-[13px] text-muted-foreground text-center py-4">No invoices yet.</p>
            ) : (
              <div className="space-y-2">
                {invoices.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between p-3 bg-muted/40 rounded-xl">
                    <div>
                      <p className="text-[13px] font-bold">${Number(inv.amount).toFixed(2)}</p>
                      <p className="text-[11px] text-muted-foreground">Due {fmtDate(inv.due_date)}</p>
                    </div>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${inv.status === "paid" ? "text-green-400 bg-green-500/10" : "text-amber-400 bg-amber-500/10"}`}>
                      {inv.status === "paid" ? "Paid" : "Pending (NET30)"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
