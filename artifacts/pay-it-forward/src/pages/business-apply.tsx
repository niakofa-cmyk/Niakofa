import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Building2, CheckCircle2, RefreshCw, UserPlus, X, Mail, DollarSign, ClipboardList, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import { useAppContext } from "@/lib/AppContext";
import { useGetBusinessRequests, useGetBusinessPendingRequests, useApproveBusinessRequest } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

interface Business {
  id: number;
  legal_name: string;
  display_name: string;
  address: string | null;
  phone: string | null;
  approval_status: "pending" | "approved" | "rejected";
  created_at: string;
  member_role?: string;
  member_status?: string;
}

interface Member {
  id: number;
  user_id: number;
  role: string;
  status: string;
  invited_at: string;
  spending_cap_cents?: number | null;
  name?: string;
  email?: string;
}

// ── Invite Modal ───────────────────────────────────────────────────────────────
function InviteModal({ businessId, onClose, onInvited }: { businessId: number; onClose: () => void; onInvited: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"staff" | "owner">("staff");
  const [saving, setSaving] = useState(false);

  const send = async () => {
    if (!email.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/businesses/${businessId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to invite");
      toast({ title: "Invitation sent ✅", description: `${email} has been invited as ${role}.` });
      onInvited();
      onClose();
    } catch (err) {
      toast({ title: "Invite failed", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" /> Invite Staff
          </div>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium block mb-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="email"
                placeholder="colleague@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="pl-9 bg-card border-border"
                onKeyDown={e => e.key === "Enter" && send()}
              />
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium block mb-1">Role</label>
            <div className="flex gap-2">
              {(["staff", "owner"] as const).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 py-2 rounded-xl text-xs font-black uppercase border-2 transition-all ${
                    role === r ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {r === "owner" ? "Co-owner" : "Staff"}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {role === "owner" ? "Can post requests and invite other members" : "Can post requests on behalf of this business"}
            </p>
          </div>
        </div>

        <Button onClick={send} disabled={saving || !email.trim()} className="w-full font-black uppercase tracking-wider">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
          Send Invitation
        </Button>
      </div>
    </div>
  );
}

// ── Spending Cap Editor ────────────────────────────────────────────────────────
function CapEditor({ businessId, member, onSaved }: { businessId: number; member: Member; onSaved: () => void }) {
  const [cap, setCap] = useState(member.spending_cap_cents === undefined || member.spending_cap_cents === null ? "" : String(member.spending_cap_cents / 100));
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const save = async () => {
    const dollars = cap.trim() === "" ? 0 : parseFloat(cap);
    if (Number.isNaN(dollars) || dollars < 0) {
      toast({ title: "Invalid amount", description: "Enter a dollar amount ≥ 0", variant: "destructive" });
      return;
    }
    const cents = Math.round(dollars * 100);
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/businesses/${businessId}/members/${member.user_id}/cap`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
        body: JSON.stringify({ spending_cap_cents: cents }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      await queryClient.invalidateQueries({ queryKey: [`/api/businesses/${businessId}/members`] });
      onSaved();
      toast({ title: "Spending cap updated", description: `Cap set to ${dollars.toFixed(2)}` });
    } catch (err) {
      toast({ title: "Failed to update cap", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="relative flex-1">
        <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          type="number"
          min={0}
          step={0.01}
          value={cap}
          onChange={e => setCap(e.target.value)}
          placeholder="No cap"
          className="pl-7 h-8 text-xs bg-card border-border"
        />
      </div>
      <Button size="sm" disabled={saving} onClick={save} className="h-8 text-xs font-black uppercase">
        {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : "Set"}
      </Button>
    </div>
  );
}

// ── Member List ────────────────────────────────────────────────────────────────
function MemberList({ businessId, isOwner }: { businessId: number; isOwner: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${BASE}/api/businesses/${businessId}/members`, { headers: (getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) })
      .then(r => r.ok ? r.json() : [])
      .then((data: Member[]) => { if (Array.isArray(data)) setMembers(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  // NOTE: DELETE /businesses/:id/members/:memberId expects :memberId to be the
  // target member's USER id (not the membership row id). Always pass m.user_id here.
  const remove = async (userId: number) => {
    try {
      const res = await fetch(`${BASE}/api/businesses/${businessId}/members/${userId}`, {
        method: "DELETE",
        headers: (getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      });
      if (!res.ok) throw new Error("Failed");
      setMembers(prev => prev.filter(m => m.user_id !== userId));
      toast({ title: "Member removed" });
    } catch {
      toast({ title: "Failed to remove member", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">Team Members</div>
        {isOwner && (
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-1.5 text-xs font-black text-primary bg-primary/10 border border-primary/30 rounded-full px-3 py-1"
          >
            <UserPlus className="w-3 h-3" /> Invite
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-4 justify-center">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : members.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-4">No members yet</div>
      ) : (
        <div className="space-y-2">
          {members.map(m => (
            <div key={m.id} className="bg-card border border-border rounded-xl p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">{m.name ?? `User #${m.user_id}`}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{m.email ?? ""}</div>
                  <div className="flex gap-1.5 mt-0.5">
                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                      m.role === "owner" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                    }`}>{m.role}</span>
                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                      m.status === "active" ? "bg-green-500/20 text-green-600" : "bg-yellow-500/20 text-yellow-600"
                    }`}>{m.status}</span>
                  </div>
                </div>
                {isOwner && m.role !== "owner" && (
                  <button
                    onClick={() => remove(m.user_id)}
                    className="shrink-0 p-1.5 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {isOwner && m.role === "staff" && m.status === "active" && (
                <CapEditor businessId={businessId} member={m} onSaved={load} />
              )}
            </div>
          ))}
        </div>
      )}

      {showInvite && (
        <InviteModal
          businessId={businessId}
          onClose={() => setShowInvite(false)}
          onInvited={load}
        />
      )}
    </div>
  );
}

// ── Business Requests Dashboard ────────────────────────────────────────────────
function BusinessRequestsDashboard({ businessId, isOwner: _isOwner }: { businessId: number; isOwner: boolean }) {
  const { data: requests, isLoading } = useGetBusinessRequests(businessId);
  const total = (requests ?? []).reduce((sum, r) => sum + (r.pay_it_forward_amount ?? 0), 0);

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <ClipboardList className="w-3.5 h-3.5" /> Request Spend
        </div>
        <div className="text-xs font-black text-primary">${total.toFixed(2)}</div>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-4 justify-center">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (requests ?? []).length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-4">No business requests yet</div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {(requests ?? []).map(r => (
            <div key={r.id} className="border border-border rounded-xl p-2.5 text-sm">
              <div className="font-bold truncate">{r.title}</div>
              <div className="flex items-center justify-between mt-1">
                <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                  r.status === "completed" ? "bg-green-500/20 text-green-600" :
                  r.status === "cancelled" ? "bg-destructive/20 text-destructive" :
                  r.status === "pending_owner_approval" ? "bg-yellow-500/20 text-yellow-600" :
                  "bg-blue-500/20 text-blue-500"
                }`}>{r.status.replace(/_/g, " ")}</span>
                <span className="text-[10px] text-muted-foreground">${(r.pay_it_forward_amount ?? 0).toFixed(2)}</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Posted by {r.requester_name ?? `User #${r.requester_id}`}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Pending Approval Queue ─────────────────────────────────────────────────────
function PendingApprovalQueue({ businessId }: { businessId: number }) {
  const { data: pending, isLoading, refetch } = useGetBusinessPendingRequests(businessId);
  const { mutate: decide, isPending } = useApproveBusinessRequest();

  const act = (requestId: number, action: "approve" | "reject") => {
    decide({ id: businessId, requestId, data: { action } }, {
      onSuccess: () => {
        toast({ title: action === "approve" ? "Request approved" : "Request rejected" });
        refetch();
      },
      onError: (err) => toast({ title: "Action failed", description: String(err), variant: "destructive" }),
    });
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5" /> Pending Owner Approval
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-4 justify-center">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (pending ?? []).length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-4">No pending requests</div>
      ) : (
        <div className="space-y-2">
          {(pending ?? []).map(r => (
            <div key={r.id} className="border border-border rounded-xl p-3 space-y-2">
              <div className="text-sm font-bold">{r.title}</div>
              <div className="text-[10px] text-muted-foreground">Posted by {r.requester_name ?? `User #${r.requester_id}`} • ${(r.pay_it_forward_amount ?? 0).toFixed(2)}</div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={() => act(r.id, "approve")}
                  className="h-8 flex-1 text-xs font-black uppercase"
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => act(r.id, "reject")}
                  className="h-8 flex-1 text-xs font-black uppercase border-destructive text-destructive"
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function BusinessApplyScreen() {
  const [, setLocation] = useLocation();
  const { currentUser } = useAppContext();

  // Application form state
  const [legalName, setLegalName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  // After submit: my businesses
  const [myBusiness, setMyBusiness] = useState<Business | null>(null);
  const [loadingBusiness, setLoadingBusiness] = useState(true);

  // Fetch existing business on mount
  useEffect(() => {
    if (!currentUser) { setLoadingBusiness(false); return; }
    fetch(`${BASE}/api/businesses/mine`, { headers: (getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) })
      .then(r => r.ok ? r.json() : [])
      .then((data: Business[]) => {
        if (Array.isArray(data) && data.length > 0) {
          // Show the first (most recently created) business
          setMyBusiness(data[0]);
        }
        setLoadingBusiness(false);
      })
      .catch(() => setLoadingBusiness(false));
  }, [currentUser]);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!legalName.trim() || !displayName.trim()) {
      toast({ title: "Legal name and display name are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/businesses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
        body: JSON.stringify({
          legal_name: legalName.trim(),
          display_name: displayName.trim(),
          address: address.trim() || undefined,
          phone: phone.trim() || undefined,
        }),
      });
      const data = await res.json() as Business & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Application failed");
      setMyBusiness(data);
      toast({ title: "Application submitted! ✅", description: "An admin will review your business within 1–2 business days." });
    } catch (err) {
      toast({ title: "Application failed", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!currentUser && !loadingBusiness) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
        <Building2 className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">Please sign in to manage your business account.</p>
        <Button onClick={() => setLocation("/login")}>Sign In</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border p-4 pt-safe flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/profile")} className="rounded-full">
          <ChevronLeft className="w-6 h-6" />
        </Button>
        <div>
          <h1 className="text-xl font-bold uppercase tracking-widest">Business Account</h1>
          <p className="text-xs text-muted-foreground">Post requests on behalf of your organization</p>
        </div>
      </div>

      <div className="flex-1 p-5 max-w-md mx-auto w-full space-y-6">
        {loadingBusiness ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : myBusiness ? (
          /* ── Existing business dashboard ─────────────────────────────────── */
          <div className="space-y-5">
            {/* Status banner */}
            <div className={`rounded-2xl p-4 border ${
              myBusiness.approval_status === "approved"
                ? "bg-green-500/10 border-green-500/30"
                : myBusiness.approval_status === "rejected"
                ? "bg-destructive/10 border-destructive/30"
                : "bg-yellow-500/10 border-yellow-500/30"
            }`}>
              <div className="flex items-center gap-3">
                {myBusiness.approval_status === "approved" ? (
                  <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0" />
                ) : (
                  <Building2 className={`w-6 h-6 shrink-0 ${myBusiness.approval_status === "rejected" ? "text-destructive" : "text-yellow-500"}`} />
                )}
                <div>
                  <div className="font-black text-sm">{myBusiness.display_name}</div>
                  <div className="text-[10px] uppercase tracking-wider font-bold mt-0.5">
                    {myBusiness.approval_status === "approved"
                      ? "✅ Approved — you can post business requests"
                      : myBusiness.approval_status === "rejected"
                      ? "❌ Application rejected — contact support"
                      : "⏳ Pending admin review (1–2 business days)"}
                  </div>
                </div>
              </div>
            </div>

            {/* Business details */}
            <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
              <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">Business Details</div>
              <div className="space-y-1.5 text-sm">
                <div><span className="text-muted-foreground text-xs">Legal name:</span> {myBusiness.legal_name}</div>
                {myBusiness.address && <div><span className="text-muted-foreground text-xs">Address:</span> {myBusiness.address}</div>}
                {myBusiness.phone && <div><span className="text-muted-foreground text-xs">Phone:</span> {myBusiness.phone}</div>}
              </div>
            </div>

            {/* Owner dashboard: spend overview + pending approval queue */}
            {myBusiness.approval_status === "approved" && myBusiness.member_role === "owner" && (
              <>
                <BusinessRequestsDashboard businessId={myBusiness.id} isOwner={true} />
                <PendingApprovalQueue businessId={myBusiness.id} />
              </>
            )}

            {/* Member dashboard: read-only spend overview */}
            {myBusiness.approval_status === "approved" && myBusiness.member_role !== "owner" && (
              <BusinessRequestsDashboard businessId={myBusiness.id} isOwner={false} />
            )}

            {/* Staff invite + cap controls (only for owners of approved businesses) */}
            {myBusiness.approval_status === "approved" && myBusiness.member_role === "owner" && (
              <div className="bg-card border border-border rounded-2xl p-4">
                <MemberList businessId={myBusiness.id} isOwner={true} />
              </div>
            )}

            {/* Member list read-only for non-owners */}
            {myBusiness.approval_status === "approved" && myBusiness.member_role !== "owner" && (
              <div className="bg-card border border-border rounded-2xl p-4">
                <MemberList businessId={myBusiness.id} isOwner={false} />
              </div>
            )}
          </div>
        ) : (
          /* ── Application form ───────────────────────────────────────────── */
          <form onSubmit={handleApply} className="space-y-5">
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 flex items-start gap-3">
              <Building2 className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <div className="text-xs text-blue-600">
                <div className="font-black mb-0.5">How business accounts work</div>
                Submit your application below. An admin reviews it within 1–2 business days. Once approved, your team can post requests on behalf of your organization — pay-it-forward is disabled for business requests.
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium block mb-1.5">
                  Legal Business Name <span className="text-destructive">*</span>
                </label>
                <Input
                  value={legalName}
                  onChange={e => setLegalName(e.target.value)}
                  placeholder="e.g. Fort Worth Community Catering LLC"
                  className="bg-card border-border"
                  required
                />
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium block mb-1.5">
                  Display Name <span className="text-destructive">*</span>
                </label>
                <Input
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="e.g. FW Community Catering"
                  className="bg-card border-border"
                  required
                />
                <p className="text-[10px] text-muted-foreground mt-1">This is shown publicly when your business posts a request</p>
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium block mb-1.5">Business Address</label>
                <Input
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="123 Main St, Fort Worth, TX 76102"
                  className="bg-card border-border"
                />
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium block mb-1.5">Phone Number</label>
                <Input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="(817) 555-0100"
                  type="tel"
                  className="bg-card border-border"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={saving || !legalName.trim() || !displayName.trim()}
              className="w-full h-12 font-black uppercase tracking-wider"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Building2 className="w-4 h-4 mr-2" />}
              Submit Application
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
