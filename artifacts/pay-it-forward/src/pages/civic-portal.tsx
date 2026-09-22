/**
 * Civic Portal — County / Government Sponsor Request Board
 *
 * Allows an approved government/county sponsor to post community needs that
 * are dispatched to nearby helpers via the standard claim/complete pipeline.
 *
 * Gate logic:
 *   - Not logged in → prompt to sign in
 *   - No gov-sponsor application → prompt to apply
 *   - Application pending/rejected → show status
 *   - Application approved → show request form + list of existing civic requests
 *
 * Route: /civic-portal
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  Landmark, ChevronLeft, Plus, Clock, CheckCircle2,
  AlertCircle, MapPin, ClipboardList, Send, RefreshCw,
  Layers, BarChart2, ExternalLink, Trash2, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import { useAppContext } from "@/lib/AppContext";
import { usePersistedState } from "@/hooks/usePersistedState";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

interface GovSponsorApp {
  id: number;
  entity_name: string;
  county: string;
  state: string;
  city: string | null;
  approval_status: "pending" | "approved" | "rejected";
  created_at: string;
}

interface CivicRequest {
  id: number;
  title: string;
  description: string | null;
  category: string;
  urgency: string;
  status: string;
  neighborhood: string | null;
  created_at: string;
  claimed_at: string | null;
  completed_at: string | null;
}

const CATEGORIES = [
  "Food & Groceries", "Transportation", "Home Repair", "Medical",
  "Childcare", "Tech Help", "Errands", "Emergency", "Other",
];

const URGENCY_OPTS = [
  { value: "low", label: "Low — within a week" },
  { value: "medium", label: "Medium — within a few days" },
  { value: "high", label: "High — today" },
  { value: "emergency", label: "Emergency — right now" },
];

const STATUS_COLOR: Record<string, string> = {
  open: "text-emerald-400",
  claimed: "text-blue-400",
  completed: "text-muted-foreground",
  cancelled: "text-red-400",
};

function statusLabel(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const BLANK_FORM = {
  title: "",
  description: "",
  category: "Other",
  urgency: "medium",
  neighborhood: "",
  estimated_hours: "",
};

export default function CivicPortalPage() {
  const [, setLocation] = useLocation();
  const { currentUser } = useAppContext();

  const [sponsor, setSponsor] = useState<GovSponsorApp | null>(null);
  const [loadingSponsor, setLoadingSponsor] = useState(true);
  // Data-loss fix: was plain useState([]) — unmounting this screen (nav
  // away) and coming back, or a hard refresh, always restarted from an
  // empty list and flashed "no requests" before the re-fetch resolved.
  // usePersistedState mirrors this list to sessionStorage so the
  // last-known-good data paints immediately; the existing "never clear on
  // fetch error" handling in loadRequests below is unchanged.
  const [requests, setRequests] = usePersistedState<CivicRequest[]>("niakofa_civic_portal_requests", []);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkForms, setBulkForms] = useState([{ ...BLANK_FORM }, { ...BLANK_FORM }]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsNote, setSettingsNote] = useState("");
  const [settingsSubmitting, setSettingsSubmitting] = useState(false);

  // County Kindness Index — public metrics from /api/impact/:county
  const [kindnessIndex, setKindnessIndex] = useState<{
    completed: number; active_helpers: number; pool_health: number; completions_30d: number;
  } | null>(null);

  const [form, setForm] = useState({ ...BLANK_FORM });

  // Load the user's approved gov-sponsor record
  useEffect(() => {
    if (!currentUser) { setLoadingSponsor(false); return; }
    fetch(`${BASE}/api/gov-sponsors/mine`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() as Promise<GovSponsorApp[]> : [])
      .then((apps: GovSponsorApp[]) => {
        const approved = apps.find(a => a.approval_status === "approved");
        setSponsor(approved ?? (apps[0] ?? null));
      })
      .catch(() => {})
      .finally(() => setLoadingSponsor(false));
  }, [currentUser]);

  // Load civic requests for this sponsor.
  // hasLoadedRef: only show the loading skeleton on the very first fetch so
  // that a background refresh (after posting a new request) never flashes
  // empty while the new list arrives.
  const requestsLoadedRef = useRef(false);
  const loadRequests = useCallback(() => {
    if (!sponsor || sponsor.approval_status !== "approved") return;
    if (!requestsLoadedRef.current) setLoadingRequests(true);
    fetch(`${BASE}/api/civic/portal/requests`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() as Promise<CivicRequest[]> : Promise.reject(r.status))
      .then(data => { setRequests(data); requestsLoadedRef.current = true; })
      .catch(() => { /* network error — keep last-known-good list on screen */ })
      .finally(() => setLoadingRequests(false));
  }, [sponsor, setRequests]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  // Load County Kindness Index from public impact endpoint
  useEffect(() => {
    if (!sponsor || sponsor.approval_status !== "approved") return;
    const county = sponsor.county.toLowerCase().replace(/\s+/g, "-");
    fetch(`${BASE}/api/impact/${encodeURIComponent(county)}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { requests?: { completed?: number }; helpers?: { active_now?: number }; pool?: { health_pct?: number }; activity?: { completions_30d?: number } } | null) => {
        if (!d) return;
        setKindnessIndex({
          completed: d.requests?.completed ?? 0,
          active_helpers: d.helpers?.active_now ?? 0,
          pool_health: d.pool?.health_pct ?? 0,
          completions_30d: d.activity?.completions_30d ?? 0,
        });
      })
      .catch(() => {});
  }, [sponsor]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const postSingleRequest = async (body: Record<string, unknown>) => {
    const res = await fetch(`${BASE}/api/civic/portal/requests`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(err.error ?? "Failed to post request");
    }
    return res.json();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category,
        urgency: form.urgency,
        neighborhood: form.neighborhood.trim() || null,
      };
      if (form.estimated_hours) {
        const h = parseFloat(form.estimated_hours);
        if (!isNaN(h) && h > 0) body.estimated_hours = h;
      }
      await postSingleRequest(body);
      toast({ title: "Community need posted", description: "Nearby helpers will be notified." });
      setForm({ ...BLANK_FORM });
      setShowForm(false);
      loadRequests();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not post request.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const valid = bulkForms.filter(f => f.title.trim());
    if (valid.length === 0) {
      toast({ title: "Add at least one request title", variant: "destructive" });
      return;
    }
    setBulkSubmitting(true);
    let succeeded = 0;
    let failed = 0;
    for (const f of valid) {
      try {
        const body: Record<string, unknown> = {
          title: f.title.trim(),
          description: f.description.trim() || null,
          category: f.category,
          urgency: f.urgency,
          neighborhood: f.neighborhood.trim() || null,
        };
        if (f.estimated_hours) {
          const h = parseFloat(f.estimated_hours);
          if (!isNaN(h) && h > 0) body.estimated_hours = h;
        }
        await postSingleRequest(body);
        succeeded++;
      } catch {
        failed++;
      }
    }
    toast({
      title: `${succeeded} request${succeeded !== 1 ? "s" : ""} posted${failed > 0 ? `, ${failed} failed` : ""}`,
      description: "Nearby helpers have been notified.",
      variant: failed > 0 ? "destructive" : "default",
    });
    setBulkForms([{ ...BLANK_FORM }, { ...BLANK_FORM }]);
    setBulkMode(false);
    loadRequests();
    setBulkSubmitting(false);
  };

  // ── Not signed in ──────────────────────────────────────────────────────────
  if (!currentUser) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center gap-4 px-4">
        <Landmark className="w-12 h-12 text-muted-foreground" />
        <p className="text-sm text-muted-foreground text-center">
          Sign in to access the Civic Partner Portal.
        </p>
        <Button onClick={() => setLocation("/")}>Sign In</Button>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loadingSponsor) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── No application ─────────────────────────────────────────────────────────
  if (!sponsor) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center gap-6 px-6 text-center">
        <Landmark className="w-14 h-14 text-primary" />
        <div>
          <h2 className="text-xl font-bold mb-2">Civic Partner Portal</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            County agencies, housing authorities, and government-affiliated nonprofits can
            post community needs that get dispatched directly to nearby Niakofa helpers.
          </p>
        </div>
        <Button onClick={() => setLocation("/gov-sponsor/apply")}>
          Apply as a Government Sponsor
        </Button>
        <button
          className="text-xs text-muted-foreground underline underline-offset-2"
          onClick={() => setLocation("/")}
        >
          Back to map
        </button>
      </div>
    );
  }

  // ── Application pending / rejected ─────────────────────────────────────────
  if (sponsor.approval_status !== "approved") {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
        <button
          className="absolute top-4 left-4 p-2 rounded-full hover:bg-white/10"
          onClick={() => setLocation("/")}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        {sponsor.approval_status === "pending" ? (
          <>
            <Clock className="w-14 h-14 text-yellow-400" />
            <h2 className="text-xl font-bold">Application Under Review</h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              Your application for <strong>{sponsor.entity_name}</strong> is being reviewed.
              You'll be notified once approved.
            </p>
          </>
        ) : (
          <>
            <AlertCircle className="w-14 h-14 text-red-400" />
            <h2 className="text-xl font-bold">Application Not Approved</h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              Your application for <strong>{sponsor.entity_name}</strong> was not approved.
              Contact the Niakofa team for more information.
            </p>
            <Button variant="outline" onClick={() => setLocation("/gov-sponsor/apply")}>
              Submit a New Application
            </Button>
          </>
        )}
      </div>
    );
  }

  // ── Approved sponsor — main portal ─────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          className="p-2 rounded-full hover:bg-white/10"
          onClick={() => setLocation("/")}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-base leading-tight truncate">Civic Portal</h1>
          <p className="text-xs text-muted-foreground truncate">{sponsor.entity_name}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setBulkMode(v => !v); setShowForm(false); }}
          >
            <Layers className="w-3.5 h-3.5 mr-1" />
            Bulk
          </Button>
          <Button size="sm" onClick={() => { setShowForm(v => !v); setBulkMode(false); }}>
            <Plus className="w-4 h-4 mr-1" />
            New Need
          </Button>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Sponsor badge */}
        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-emerald-300">Verified Civic Partner</p>
            <p className="text-xs text-muted-foreground truncate">
              {sponsor.county} County{sponsor.city ? `, ${sponsor.city}` : ""}, {sponsor.state}
            </p>
          </div>
          <a
            href={`/impact/${sponsor.county.toLowerCase().replace(/\s+/g, "-")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Public View
          </a>
        </div>

        {/* County Kindness Index */}
        {kindnessIndex !== null && (
          <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-background border border-primary/25 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary" />
              <span className="text-xs font-black uppercase tracking-widest text-primary">County Kindness Index</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-background/40 rounded-xl p-3 text-center">
                <div className="text-2xl font-black text-primary">{kindnessIndex.completed.toLocaleString()}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Helpers Helped</div>
              </div>
              <div className="bg-background/40 rounded-xl p-3 text-center">
                <div className={`text-2xl font-black ${kindnessIndex.pool_health >= 75 ? "text-green-400" : kindnessIndex.pool_health >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                  {kindnessIndex.pool_health}%
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Pool Health</div>
              </div>
              <div className="bg-background/40 rounded-xl p-3 text-center">
                <div className="text-2xl font-black text-green-400">{kindnessIndex.active_helpers}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Active Helpers</div>
              </div>
              <div className="bg-background/40 rounded-xl p-3 text-center">
                <div className="text-2xl font-black text-purple-400">{kindnessIndex.completions_30d}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">This Month</div>
              </div>
            </div>
          </div>
        )}

        {/* Self-Onboarding: Sponsor Settings & Configuration */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowSettings(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-bold">County Configuration</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showSettings ? "rotate-180" : ""}`} />
          </button>
          {showSettings && (
            <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/60 rounded-xl p-3">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">County</div>
                  <div className="text-sm font-black">{sponsor.county}</div>
                </div>
                <div className="bg-muted/60 rounded-xl p-3">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">State</div>
                  <div className="text-sm font-black">{sponsor.state}</div>
                </div>
                {sponsor.city && (
                  <div className="bg-muted/60 rounded-xl p-3 col-span-2">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">City</div>
                    <div className="text-sm font-black">{sponsor.city}</div>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Request a Settings Change</div>
                <div className="space-y-2">
                  <Input
                    placeholder="Desired hourly rate minimum (e.g. $17.50)"
                    value={settingsNote}
                    onChange={e => setSettingsNote(e.target.value)}
                    maxLength={200}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    disabled={!settingsNote.trim() || settingsSubmitting}
                    onClick={async () => {
                      if (!settingsNote.trim()) return;
                      setSettingsSubmitting(true);
                      try {
                        await fetch(`${BASE}/api/civic/suggestions`, {
                          method: "POST",
                          headers: authHeaders(),
                          body: JSON.stringify({
                            name: `[Settings Change] ${sponsor.entity_name}`,
                            category: "other",
                            description: `County: ${sponsor.county}, ${sponsor.state}. Requested change: ${settingsNote}`,
                          }),
                        });
                        toast({ title: "Request submitted", description: "An admin will review your settings change." });
                        setSettingsNote("");
                        setShowSettings(false);
                      } catch {
                        toast({ title: "Error", description: "Could not submit request.", variant: "destructive" });
                      } finally {
                        setSettingsSubmitting(false);
                      }
                    }}
                  >
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    {settingsSubmitting ? "Submitting…" : "Submit Change Request"}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Wage minimums, pool targets, and community IDs are configured by Niakofa admins. Submit a change request and we'll update your settings within 24 hours.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Bulk tool — submits multiple requests in one batch */}
        {bulkMode && (
          <form onSubmit={handleBulkSubmit} className="bg-card border border-primary/30 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" /> Bulk Community Needs
              </h2>
              <span className="text-xs text-muted-foreground">{bulkForms.filter(f => f.title.trim()).length} ready</span>
            </div>
            {bulkForms.map((bf, idx) => (
              <div key={idx} className="border border-border rounded-xl p-3 space-y-2 relative">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-muted-foreground">Request #{idx + 1}</span>
                  {bulkForms.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setBulkForms(fs => fs.filter((_, i) => i !== idx))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <Input
                  placeholder="Title *"
                  value={bf.title}
                  onChange={e => setBulkForms(fs => fs.map((f, i) => i === idx ? { ...f, title: e.target.value } : f))}
                  maxLength={120}
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={bf.category}
                    onChange={e => setBulkForms(fs => fs.map((f, i) => i === idx ? { ...f, category: e.target.value } : f))}
                    className="rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select
                    value={bf.urgency}
                    onChange={e => setBulkForms(fs => fs.map((f, i) => i === idx ? { ...f, urgency: e.target.value } : f))}
                    className="rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {URGENCY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <Input
                  placeholder="Neighborhood (optional)"
                  value={bf.neighborhood}
                  onChange={e => setBulkForms(fs => fs.map((f, i) => i === idx ? { ...f, neighborhood: e.target.value } : f))}
                  maxLength={80}
                />
              </div>
            ))}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setBulkForms(fs => [...fs, { ...BLANK_FORM }])}
              >
                + Add Another
              </Button>
              <Button type="submit" disabled={bulkSubmitting} className="flex-1">
                {bulkSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Layers className="w-4 h-4 mr-2" />
                )}
                {bulkSubmitting ? "Posting…" : `Post ${bulkForms.filter(f => f.title.trim()).length || ""} Requests`}
              </Button>
              <Button type="button" variant="outline" onClick={() => setBulkMode(false)}>Cancel</Button>
            </div>
          </form>
        )}

        {/* Post form */}
        {showForm && !bulkMode && (
          <form
            onSubmit={handleSubmit}
            className="bg-card border border-border rounded-2xl p-4 space-y-3"
          >
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" />
              Post a Community Need
            </h2>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Title *</label>
              <Input
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="e.g. Grocery delivery for elderly residents"
                maxLength={120}
                required
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Description</label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Details about who needs help, where, and any special notes…"
                rows={3}
                maxLength={1000}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                <select
                  name="category"
                  value={form.category}
                  onChange={handleChange}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Urgency</label>
                <select
                  name="urgency"
                  value={form.urgency}
                  onChange={handleChange}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {URGENCY_OPTS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  <MapPin className="inline w-3 h-3 mr-1" />
                  Neighborhood
                </label>
                <Input
                  name="neighborhood"
                  value={form.neighborhood}
                  onChange={handleChange}
                  placeholder="e.g. Stop Six"
                  maxLength={80}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Est. hours</label>
                <Input
                  name="estimated_hours"
                  type="number"
                  min="0.25"
                  max="40"
                  step="0.25"
                  value={form.estimated_hours}
                  onChange={handleChange}
                  placeholder="e.g. 2"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={submitting} className="flex-1">
                {submitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                {submitting ? "Posting…" : "Post Need"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {/* Request list */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">Your Civic Requests</h2>
            <button
              className="p-1.5 rounded-full hover:bg-white/10"
              onClick={loadRequests}
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loadingRequests ? "animate-spin" : ""}`} />
            </button>
          </div>

          {loadingRequests ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No community needs posted yet.</p>
              <p className="text-xs mt-1">Tap "New Need" to dispatch your first request.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {requests.map(r => (
                <div
                  key={r.id}
                  className="bg-card border border-border rounded-xl px-4 py-3 space-y-1"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-snug flex-1">{r.title}</p>
                    <span className={`text-xs font-medium shrink-0 ${STATUS_COLOR[r.status] ?? "text-muted-foreground"}`}>
                      {statusLabel(r.status)}
                    </span>
                  </div>
                  {r.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{r.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span>{r.category}</span>
                    <span className="capitalize">{r.urgency} urgency</span>
                    {r.neighborhood && (
                      <span className="flex items-center gap-0.5">
                        <MapPin className="w-3 h-3" />{r.neighborhood}
                      </span>
                    )}
                    <span>{new Date(r.created_at).toLocaleDateString()}</span>
                    {r.completed_at && (
                      <span className="flex items-center gap-0.5 text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" />
                        Completed {new Date(r.completed_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
