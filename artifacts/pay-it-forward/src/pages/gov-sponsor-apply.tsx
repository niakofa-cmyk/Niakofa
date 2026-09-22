/**
 * Government / County Sponsor Application Page
 *
 * Allows a county or government entity representative to apply as a named
 * community pool sponsor. Applications go into admin approval queue.
 * Distinct from individual/business pool sponsorship — this is for
 * government/county entities (county health departments, housing authorities,
 * nonprofits with government affiliation, etc.).
 *
 * Route: /gov-sponsor-apply
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Landmark, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import { useAppContext } from "@/lib/AppContext";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

interface GovSponsorApp {
  id: number;
  entity_name: string;
  county: string;
  state: string;
  approval_status: "pending" | "approved" | "rejected";
  created_at: string;
}

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
  "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
  "TX","UT","VT","VA","WA","WV","WI","WY",
];

export default function GovSponsorApplyPage() {
  const [, setLocation] = useLocation();
  const { currentUser } = useAppContext();

  const [myApps, setMyApps] = useState<GovSponsorApp[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    entity_name: "",
    county: "",
    state: "TX",
    city: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    description: "",
    website_url: "",
  });

  useEffect(() => {
    if (!currentUser) return;
    fetch(`${BASE}/api/gov-sponsors/mine`, {
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    })
      .then(r => r.ok ? r.json() as Promise<GovSponsorApp[]> : [])
      .then(setMyApps)
      .catch(() => {})
      .finally(() => setLoadingApps(false));
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-4">
        <Landmark className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">Please sign in to apply as a government sponsor.</p>
        <Button onClick={() => setLocation("/")}>Go Home</Button>
      </div>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.entity_name.trim() || !form.county.trim() || !form.contact_name.trim() || !form.contact_email.trim()) {
      toast({ title: "Missing fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${BASE}/api/gov-sponsors`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
        body: JSON.stringify(form),
      });
      const data = await res.json() as { error?: string; id?: number };
      if (!res.ok) throw new Error(data.error ?? "Submission failed");

      toast({
        title: "Application submitted",
        description: "Our team will review your application and contact you within 3-5 business days.",
      });

      setMyApps(prev => [{ ...data, ...form, approval_status: "pending", created_at: new Date().toISOString() } as GovSponsorApp, ...prev]);
      setForm({ entity_name: "", county: "", state: "TX", city: "", contact_name: "", contact_email: "", contact_phone: "", description: "", website_url: "" });
    } catch (err) {
      toast({ title: "Submission failed", description: String(err), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (status: string) => {
    if (status === "approved") return <span className="flex items-center gap-1 text-xs text-green-500 font-bold"><CheckCircle2 className="w-3 h-3" /> Approved</span>;
    if (status === "rejected") return <span className="flex items-center gap-1 text-xs text-destructive font-bold"><AlertCircle className="w-3 h-3" /> Not approved</span>;
    return <span className="flex items-center gap-1 text-xs text-yellow-500 font-bold"><Clock className="w-3 h-3" /> Pending review</span>;
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => setLocation("/")}
          className="p-2 rounded-full hover:bg-muted transition-colors -ml-1"
          aria-label="Back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-base font-black uppercase tracking-wider flex items-center gap-2">
            <Landmark className="w-4 h-4 text-primary" />
            Government Sponsor
          </h1>
          <p className="text-[11px] text-muted-foreground">Apply as a county/government pool sponsor</p>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 pt-6 space-y-6">

        {/* Explainer */}
        <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4 space-y-2">
          <p className="text-sm font-bold text-foreground">What is a Government Sponsor?</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            County health departments, housing authorities, and government-affiliated nonprofits can
            sponsor the Niakofa Community Pool — a fund that fronts payment to helpers so vulnerable
            residents never have to wait for help due to payment timing. Approved sponsors are listed
            publicly in the pool transparency ledger.
          </p>
        </div>

        {/* Existing applications */}
        {!loadingApps && myApps.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Your Applications</p>
            {myApps.map(app => (
              <div key={app.id} className="rounded-xl border border-border bg-card p-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold">{app.entity_name}</p>
                  <p className="text-xs text-muted-foreground">{app.county}, {app.state}</p>
                </div>
                {statusBadge(app.approval_status)}
              </div>
            ))}
          </div>
        )}

        {/* Application form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">New Application</p>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Entity Name <span className="text-destructive">*</span>
            </label>
            <Input
              name="entity_name"
              value={form.entity_name}
              onChange={handleChange}
              placeholder="Tarrant County Health Department"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                County <span className="text-destructive">*</span>
              </label>
              <Input
                name="county"
                value={form.county}
                onChange={handleChange}
                placeholder="Tarrant"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                State <span className="text-destructive">*</span>
              </label>
              <select
                name="state"
                value={form.state}
                onChange={handleChange}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                required
              >
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">City</label>
            <Input
              name="city"
              value={form.city}
              onChange={handleChange}
              placeholder="Fort Worth (optional)"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Contact Name <span className="text-destructive">*</span>
            </label>
            <Input
              name="contact_name"
              value={form.contact_name}
              onChange={handleChange}
              placeholder="Jane Smith"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Contact Email <span className="text-destructive">*</span>
            </label>
            <Input
              name="contact_email"
              type="email"
              value={form.contact_email}
              onChange={handleChange}
              placeholder="jsmith@tarrantcounty.gov"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Contact Phone</label>
            <Input
              name="contact_phone"
              type="tel"
              value={form.contact_phone}
              onChange={handleChange}
              placeholder="(817) 555-0100"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Website</label>
            <Input
              name="website_url"
              type="url"
              value={form.website_url}
              onChange={handleChange}
              placeholder="https://www.tarrantcounty.gov"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Entity Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none"
              placeholder="Brief description of your entity and how you'd like to support the community pool..."
            />
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit Application"}
          </Button>

          <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
            All applications are reviewed by the Niakofa team. Approved sponsors are named
            publicly in the pool transparency ledger. Your contact info is used for coordination only.
          </p>
        </form>
      </div>
    </div>
  );
}
