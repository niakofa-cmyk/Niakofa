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
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Landmark, ChevronLeft, Plus, Clock, CheckCircle2,
  AlertCircle, MapPin, ClipboardList, Send, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import { useAppContext } from "@/lib/AppContext";

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

export default function CivicPortalPage() {
  const [, setLocation] = useLocation();
  const { currentUser } = useAppContext();

  const [sponsor, setSponsor] = useState<GovSponsorApp | null>(null);
  const [loadingSponsor, setLoadingSponsor] = useState(true);
  const [requests, setRequests] = useState<CivicRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "Other",
    urgency: "medium",
    neighborhood: "",
    estimated_hours: "",
  });

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

  // Load civic requests for this sponsor
  const loadRequests = useCallback(() => {
    if (!sponsor || sponsor.approval_status !== "approved") return;
    setLoadingRequests(true);
    fetch(`${BASE}/api/civic/portal/requests`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() as Promise<CivicRequest[]> : [])
      .then(setRequests)
      .catch(() => {})
      .finally(() => setLoadingRequests(false));
  }, [sponsor]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

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

      const res = await fetch(`${BASE}/api/civic/portal/requests`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to post request");
      }

      toast({ title: "Community need posted", description: "Nearby helpers will be notified." });
      setForm({ title: "", description: "", category: "Other", urgency: "medium", neighborhood: "", estimated_hours: "" });
      setShowForm(false);
      loadRequests();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not post request.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
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
        <Button size="sm" onClick={() => setShowForm(v => !v)}>
          <Plus className="w-4 h-4 mr-1" />
          New Need
        </Button>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Sponsor badge */}
        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-emerald-300">Verified Civic Partner</p>
            <p className="text-xs text-muted-foreground truncate">
              {sponsor.county} County{sponsor.city ? `, ${sponsor.city}` : ""}, {sponsor.state}
            </p>
          </div>
        </div>

        {/* Post form */}
        {showForm && (
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
