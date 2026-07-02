import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { usePushNotifications } from "@/lib/usePushNotifications";
import {
  User as UserIcon, Shield, MapPin, Settings, Wallet, Heart, Star,
  DollarSign, Gift, Clock, ChevronRight, AlertCircle, CheckCircle2,
  ExternalLink, BookOpen, Bell, Lock, Trash2, X, Phone, FileText,
  Eye, Users, Info, ChevronLeft, Flag,
  Camera, Sliders, CreditCard, Activity, Loader2, Building2, Award, Wrench
} from "lucide-react";
import { ReportModal } from "@/components/ReportModal";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import {
  useGetUserTransactions,
  getGetUserTransactionsQueryKey,
} from "@workspace/api-client-react";
import type { Transaction } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { TrustTierBadge, getTrustTier } from "@/components/TrustTierBadge";
import { IdentityVerificationCard } from "@/components/IdentityVerificationCard";
import { useQueryClient } from "@tanstack/react-query";

type ProfileTab = "overview" | "history" | "settings";

function fmtDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now.getTime() - d.getTime()) / 3600000;
  if (diffH < 1) return "Just now";
  if (diffH < 24) return `${Math.floor(diffH)} hr ago`;
  if (diffH < 48) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function txTypeLabel(type: Transaction["type"]): { label: string; action: string; color: string } {
  switch (type) {
    case "earned": return { label: "Immediate Pay", action: "Helped", color: "text-green-400" };
    case "pledge_received": return { label: "Niakofa", action: "Received", color: "text-primary" };
    case "pledge_sent": return { label: "Contributed", action: "Contributed", color: "text-yellow-400" };
    case "goodwill": return { label: "Goodwill", action: "Volunteered", color: "text-purple-400" };
    default: return { label: type, action: "Activity", color: "text-muted-foreground" };
  }
}

// ── Dialogs ──────────────────────────────────────────────────────────────────

function ModalShell({ title, icon: Icon, onClose, children }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 26, stiffness: 220 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-3xl max-h-[85dvh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-primary" />
            <h3 className="font-black text-lg">{title}</h3>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="w-5 h-5" />
          </Button>
        </div>
        <div className="p-5">{children}</div>
      </motion.div>
    </AnimatePresence>
  );
}

function DeleteAccountDialog({ onClose, userId }: { onClose: () => void; userId: number }) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <ModalShell title="Delete Account" icon={Trash2} onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4">
          <p className="text-sm text-destructive font-bold mb-1">This cannot be undone.</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Deleting your account will permanently remove your profile, transaction history, goodwill score,
            and benevolence wallet balance. Scheduled payments will be cancelled. This action is irreversible
            and cannot be recovered.
          </p>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Under GDPR/CCPA regulations, you have the right to request deletion of your personal data.
          Your data will be removed within 30 days of confirmation. To request deletion, contact:
        </p>
        <a
          href="mailto:privacy@niakofa.community?subject=Account%20Deletion%20Request"
          className="block bg-card border border-border rounded-xl p-3 text-sm text-primary hover:border-primary/50 transition-colors"
        >
          privacy@niakofa.community
        </a>
        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-xl">
          <input
            type="checkbox"
            id="confirm-delete"
            checked={confirmed}
            onChange={e => setConfirmed(e.target.checked)}
            className="accent-destructive w-4 h-4"
          />
          <label htmlFor="confirm-delete" className="text-xs text-muted-foreground">
            I understand this action is permanent and cannot be undone
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!confirmed}
            onClick={async () => {
              if (!userId) return;
              try {
                const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
                const res = await fetch(`${base}/api/users/${userId}`, {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json", ...authHeaders() },
                });
                if (!res.ok) {
                  const err = await res.json() as { error?: string };
                  toast({ title: err.error ?? "Failed to delete account", variant: "destructive" });
                  return;
                }
                toast({ title: "Account deleted successfully", description: "You will be logged out." });
                localStorage.removeItem("niakofa_token");
                localStorage.removeItem("niakofa_user");
                localStorage.removeItem("niakofa_last_location");
                localStorage.removeItem("niakofa_user_city");
                localStorage.removeItem("niakofa_last_place");
                localStorage.removeItem("niakofa_user_county");
                window.location.href = "/";
              } catch {
                toast({ title: "Could not delete account — please try again", variant: "destructive" });
              }
              onClose();
            }}
          >
            Request Deletion
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

async function fetchSettings(userId: number) {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const res = await fetch(`${base}/api/users/${userId}/settings`, { headers: authHeaders() });
  if (!res.ok) return null;
  return res.json();
}

async function saveSettings(userId: number, updates: Record<string, boolean | number | string>) {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const res = await fetch(`${base}/api/users/${userId}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to save settings");
  return res.json();
}

function PushEnableButton({ userId }: { userId: number }) {
  const { permission, isSubscribed, isLoading, requestPermissionAndSubscribe, unsubscribe } =
    usePushNotifications(userId);

  if (permission === "unsupported") return null;

  if (isSubscribed) {
    return (
      <div className="flex items-center justify-between p-3 bg-green-500/10 rounded-xl border border-green-500/30">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-green-400" />
          <span className="text-sm font-semibold text-green-400">Push Notifications Active</span>
        </div>
        <button
          onClick={unsubscribe}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors"
        >
          Disable
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() =>
        requestPermissionAndSubscribe().then(ok => {
          if (ok) toast({ title: "Push notifications enabled!" });
          else if (permission === "denied")
            toast({ title: "Notifications blocked — enable in browser settings", variant: "destructive" });
        })
      }
      disabled={isLoading}
      className="w-full flex items-center gap-3 p-3 bg-primary/10 border border-primary/30 hover:border-primary/60 rounded-xl transition-all text-left"
    >
      <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
        {isLoading ? (
          <Loader2 className="w-4 h-4 text-primary animate-spin" />
        ) : (
          <Bell className="w-4 h-4 text-primary" />
        )}
      </div>
      <div>
        <div className="text-sm font-bold">Enable Push Notifications</div>
        <div className="text-[10px] text-muted-foreground">
          Get alerted for nearby requests, pledges &amp; arrivals
        </div>
      </div>
    </button>
  );
}

function NotificationPrefsDialog({ onClose, userId }: { onClose: () => void; userId: number }) {
  const [prefs, setPrefs] = useState({
    notif_nearby_requests: true,
    notif_emergency: true,
    notif_task_accepted: true,
    notif_wallet_updates: true,
    notif_community_activity: false,
    notif_pledge_reminders: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings(userId).then(data => {
      if (data) setPrefs({
        notif_nearby_requests: data.notif_nearby_requests ?? true,
        notif_emergency: data.notif_emergency ?? true,
        notif_task_accepted: data.notif_task_accepted ?? true,
        notif_wallet_updates: data.notif_wallet_updates ?? true,
        notif_community_activity: data.notif_community_activity ?? false,
        notif_pledge_reminders: data.notif_pledge_reminders ?? true,
      });
    }).finally(() => setLoading(false));
  }, [userId]);

  const toggle = (key: keyof typeof prefs) => setPrefs(p => ({ ...p, [key]: !p[key] }));

  const labels: Record<keyof typeof prefs, string> = {
    notif_nearby_requests: "Nearby help requests",
    notif_emergency: "Emergency alerts",
    notif_task_accepted: "Task accepted / en route",
    notif_wallet_updates: "Wallet & pledge updates",
    notif_community_activity: "Community activity feed",
    notif_pledge_reminders: "Niakofa reminders",
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings(userId, prefs);
      toast({ title: "Notification preferences saved" });
      onClose();
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Notification Preferences" icon={Bell} onClose={onClose}>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Push notification enable — must grant permission for any toggles below to reach the device */}
          <PushEnableButton userId={userId} />
          <div className="pt-1 border-t border-border/60">
            <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wider font-bold">In-App Notification Types</p>
            {(Object.keys(prefs) as (keyof typeof prefs)[]).map(key => (
              <div key={key} className="flex items-center justify-between p-3 bg-background rounded-xl border border-border mb-2">
                <span className="text-sm">{labels[key]}</span>
                <Switch checked={prefs[key]} onCheckedChange={() => toggle(key)} />
              </div>
            ))}
          </div>
          <Button className="w-full mt-2" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Preferences"}
          </Button>
        </div>
      )}
    </ModalShell>
  );
}

function AccountPrivacyDialog({ onClose, userId }: { onClose: () => void; userId: number }) {
  const [prefs, setPrefs] = useState({
    privacy_profile_visible: true,
    privacy_live_location: false,
    privacy_activity_sharing: true,
    privacy_anonymous_giving: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings(userId).then(data => {
      if (data) setPrefs({
        privacy_profile_visible: data.privacy_profile_visible ?? true,
        privacy_live_location: data.privacy_live_location ?? false,
        privacy_activity_sharing: data.privacy_activity_sharing ?? true,
        privacy_anonymous_giving: data.privacy_anonymous_giving ?? false,
      });
    }).finally(() => setLoading(false));
  }, [userId]);

  const toggle = (key: keyof typeof prefs) => setPrefs(p => ({ ...p, [key]: !p[key] }));

  const items: { key: keyof typeof prefs; label: string; desc: string }[] = [
    { key: "privacy_profile_visible", label: "Profile discoverable", desc: "Others can find your profile when searching for helpers" },
    { key: "privacy_live_location", label: "Share live location", desc: "Show your real-time position to requesters when helping" },
    { key: "privacy_activity_sharing", label: "Activity sharing", desc: "Show recent help activity on your public profile" },
    { key: "privacy_anonymous_giving", label: "Anonymous giving", desc: "Niakofa contributions appear as anonymous" },
  ];

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings(userId, prefs);
      toast({ title: "Privacy settings saved" });
      onClose();
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Account Privacy" icon={Lock} onClose={onClose}>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.key} className="p-3 bg-background rounded-xl border border-border">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-sm font-semibold">{item.label}</span>
                <Switch checked={prefs[item.key]} onCheckedChange={() => toggle(item.key)} />
              </div>
              <p className="text-[11px] text-muted-foreground">{item.desc}</p>
            </div>
          ))}
          <Button className="w-full mt-2" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Settings"}
          </Button>
        </div>
      )}
    </ModalShell>
  );
}

function SafetyDialog({ item, onClose, setShowReportModal }: { item: string; onClose: () => void; setShowReportModal: (v: boolean) => void }) {
  const content: Record<string, { icon: React.ComponentType<{className?: string}>; body: React.ReactNode }> = {
    "Report unsafe behavior": {
      icon: AlertCircle,
      body: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            If you felt unsafe during a help exchange, we take that seriously. Our safety team reviews every report within 24 hours.
          </p>
          <button
            onClick={() => { onClose(); setTimeout(() => setShowReportModal(true), 150); }}
            className="w-full flex items-center justify-center gap-2 bg-destructive/10 border border-destructive/30 hover:border-destructive/60 text-destructive font-bold text-sm text-center py-3 rounded-xl transition-colors"
          >
            <Flag className="w-4 h-4" />
            File a Report
          </button>
          <p className="text-[11px] text-muted-foreground text-center">Or use the SOS button on the map screen for immediate assistance</p>
        </div>
      ),
    },
    "Emergency contacts": {
      icon: Phone,
      body: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Emergency contacts are trusted people who can be notified if you activate an SOS alert. This feature is being built — available soon.
          </p>
          <div className="bg-muted/50 border border-border rounded-xl p-4 text-center">
            <div className="text-2xl mb-2">🔒</div>
            <div className="font-bold text-sm">Coming Soon</div>
            <div className="text-xs text-muted-foreground mt-1">Emergency contact management will be available in the next update</div>
          </div>
        </div>
      ),
    },
    "Community guidelines": {
      icon: FileText,
      body: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          {[
            ["Be honest", "Only request help you genuinely need. Be transparent about your situation."],
            ["Respect boundaries", "Never pressure helpers. Help is given freely — not owed."],
            ["Pay it forward", "When you're able, contribute back — any amount, any time."],
            ["Stay safe", "Meet in public places when possible. Use the SOS button if anything feels wrong."],
            ["No discrimination", "Help is for everyone. We do not tolerate bias of any kind."],
          ].map(([title, desc]) => (
            <div key={title} className="flex gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
              <div>
                <div className="font-bold text-foreground">{title}</div>
                <div className="mt-0.5">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    "Privacy & data": {
      icon: Eye,
      body: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>Niakofa collects only what's necessary to connect neighbors safely.</p>
          <div className="space-y-2">
            {[
              ["Location data", "Used only when helper mode is active or a request is open. Never sold."],
              ["Transaction history", "Stored securely to support the Niakofa ledger."],
              ["Profile information", "Name and neighborhood visible to matched helpers or requesters only."],
              ["Data deletion", "You may request full deletion at any time — see Delete Account."],
            ].map(([title, desc]) => (
              <div key={title as string} className="p-3 bg-background border border-border rounded-xl">
                <div className="font-semibold text-foreground text-xs uppercase tracking-wider mb-1">{title}</div>
                <div className="text-xs">{desc}</div>
              </div>
            ))}
          </div>
          <a
            href="mailto:privacy@niakofa.community"
            className="block text-primary text-xs text-center hover:underline"
          >
            privacy@niakofa.community
          </a>
        </div>
      ),
    },
    "Help center": {
      icon: Info,
      body: (
        <div className="space-y-3 text-sm">
          {[
            ["How do I request help?", "Tap the + button on the map screen. Describe what you need and set your location. Nearby helpers will be notified."],
            ["How does Niakofa work?", "When you receive help, you commit to paying back when you're ready — any amount, any time. No pressure, no penalties."],
            ["How do I become a helper?", "Toggle Helper Mode on in the top bar of the map screen. You'll start seeing nearby requests."],
            ["Is my location always shared?", "No — only when helper mode is active or you have an open request. You control this in Account Privacy."],
            ["How do I contact support?", "Email help@niakofa.community — we respond within 24 hours."],
          ].map(([q, a]) => (
            <div key={q as string} className="border border-border rounded-xl overflow-hidden">
              <div className="bg-muted/50 p-3 font-bold text-sm">{q}</div>
              <div className="p-3 text-xs text-muted-foreground leading-relaxed">{a}</div>
            </div>
          ))}
        </div>
      ),
    },
  };

  const entry = content[item];
  if (!entry) return null;
  const { icon, body } = entry;
  return (
    <ModalShell title={item} icon={icon} onClose={onClose}>
      {body}
    </ModalShell>
  );
}

// ── Helper Profile Dialogs ──────────────────────────────────────────────────

const SPECIALTY_OPTIONS = [
  { id: "transportation", label: "🚗 Transportation" },
  { id: "errands", label: "🛒 Errands & Shopping" },
  { id: "medical", label: "🏥 Medical Support" },
  { id: "tech", label: "💻 Tech Help" },
  { id: "repairs", label: "🔧 Home Repairs" },
  { id: "childcare", label: "👶 Childcare" },
  { id: "meals", label: "🍲 Meals & Food" },
  { id: "emergency", label: "🚨 Emergency Response" },
  { id: "translation", label: "🌐 Translation" },
  { id: "financial", label: "💰 Financial Coaching" },
];

function HelperSettingsDialog({ onClose, userId }: { onClose: () => void; userId: number }) {
  const [radius, setRadius] = useState(5);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings(userId).then(data => {
      if (data) {
        setRadius(data.service_radius_miles ?? 5);
        try { setSpecialties(JSON.parse(data.specialties ?? "[]")); } catch { setSpecialties([]); }
      }
    }).finally(() => setLoading(false));
  }, [userId]);

  const toggleSpecialty = (id: string) =>
    setSpecialties(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings(userId, { service_radius_miles: radius, specialties: JSON.stringify(specialties) });
      toast({ title: "Helper settings saved" });
      onClose();
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <ModalShell title="Helper Settings" icon={Sliders} onClose={onClose}>
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-bold">Service Radius</span>
              <span className="text-primary font-black text-sm">{radius} mile{radius !== 1 ? "s" : ""}</span>
            </div>
            <input
              type="range" min={1} max={25} step={1} value={radius}
              onChange={e => setRadius(parseInt(e.target.value))}
              className="w-full accent-primary h-2"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>1 mile</span><span>25 miles</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
              You'll receive requests from within this radius of your current location.
            </p>
          </div>
          <div>
            <div className="text-sm font-bold mb-2">Specialties</div>
            <div className="flex flex-wrap gap-2">
              {SPECIALTY_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => toggleSpecialty(opt.id)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-all ${
                    specialties.includes(opt.id)
                      ? "bg-primary/20 border-primary/60 text-primary"
                      : "bg-muted/50 border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >{opt.label}</button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
              Requesters can filter helpers by specialty. Select all that apply.
            </p>
          </div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Helper Settings"}
          </Button>
        </div>
      )}
    </ModalShell>
  );
}

function PayoutSetupDialog({ onClose, userId, isHelper }: { onClose: () => void; userId: number; isHelper: boolean }) {
  const [status, setStatus] = useState<{
    connected: boolean; chargesEnabled?: boolean; payoutsEnabled?: boolean; detailsSubmitted?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState(false);

  useEffect(() => {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    fetch(`${base}/api/stripe/connect/status/${userId}`, { headers: authHeaders() })
      .then(r => r.json()).then(setStatus).finally(() => setLoading(false));
  }, [userId]);

  const handleSetupPayouts = async () => {
    setOnboarding(true);
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const res = await fetch(`${base}/api/stripe/connect/onboard`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const err = await res.json() as { setup?: string };
        toast({ title: err.setup ?? "Stripe not configured by admin", variant: "destructive" });
        return;
      }
      const data = await res.json() as { url: string };
      window.open(data.url, "_blank", "noopener noreferrer");
    } catch {
      toast({ title: "Could not start Stripe setup — please try again", variant: "destructive" });
    } finally { setOnboarding(false); }
  };

  return (
    <ModalShell title="Payout Setup" icon={CreditCard} onClose={onClose}>
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !isHelper ? (
        <div className="bg-muted/50 border border-border rounded-xl p-4 text-center">
          <div className="text-2xl mb-2">💡</div>
          <div className="font-bold text-sm">Enable Helper Mode First</div>
          <div className="text-xs text-muted-foreground mt-1">Toggle Helper Mode on to start receiving jobs and set up payouts.</div>
        </div>
      ) : status?.payoutsEnabled ? (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div>
            <div className="font-black text-green-400">Payouts Active</div>
            <div className="text-xs text-muted-foreground mt-0.5">Earnings transfer directly to your bank account via Stripe.</div>
          </div>
        </div>
      ) : status?.connected ? (
        <div className="space-y-3">
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
            <div className="font-black text-yellow-400 mb-1">Almost there</div>
            <div className="text-xs text-muted-foreground mb-2">Your Stripe account needs more information before payouts can be enabled.</div>
            {[
              { label: "Account connected", done: true },
              { label: "Details submitted", done: status.detailsSubmitted },
              { label: "Payouts enabled", done: status.payoutsEnabled },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2 text-xs mt-1">
                <span>{item.done ? "✅" : "⏳"}</span>
                <span className={item.done ? "text-green-400" : "text-muted-foreground"}>{item.label}</span>
              </div>
            ))}
          </div>
          <Button className="w-full" onClick={handleSetupPayouts} disabled={onboarding}>
            {onboarding ? "Opening Stripe…" : "Complete Setup on Stripe"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-primary/10 border border-primary/30 rounded-xl p-4">
            <div className="font-black text-primary mb-1">Set Up Real Payments</div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Connect your bank account via Stripe to receive real payments from immediate-pay jobs and Niakofa contributions.
            </p>
          </div>
          <div className="space-y-2">
            {["Takes ~5 minutes to complete", "Powered by Stripe — bank-level security",
              "Payouts directly to your bank account", "No upfront fees from Niakofa"].map(item => (
              <div key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="text-primary">✓</span><span>{item}</span>
              </div>
            ))}
          </div>
          <Button className="w-full h-12 font-black" onClick={handleSetupPayouts} disabled={onboarding}>
            {onboarding
              ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Opening Stripe…</span>
              : "Set Up Payouts via Stripe"
            }
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">Requires STRIPE_SECRET_KEY to be configured by the app administrator.</p>
        </div>
      )}
    </ModalShell>
  );
}

// ── Civic Resources Types ────────────────────────────────────────────────────

interface CivicResource {
  id: number;
  org_name: string;
  description: string | null;
  url: string;
  phone: string | null;
  category: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
}

interface CivicResourcesResponse {
  resources: CivicResource[];
  place_name: string;
  city: string | null;
  county: string | null;
  state: string | null;
  match_level: "city" | "county" | "state" | "fallback";
}

function useCivicResources(lat: number | null | undefined, lng: number | null | undefined) {
  const [data, setData] = useState<CivicResourcesResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (lat == null || lng == null) return;
    setLoading(true);
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    fetch(`${base}/api/civic/resources?lat=${lat}&lng=${lng}`)
      .then(r => r.ok ? r.json() as Promise<CivicResourcesResponse> : Promise.reject())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [lat, lng]);

  return { data, loading };
}

const CATEGORY_LABELS: Record<string, string> = {
  social_services: "Social Services",
  shelter: "Shelter",
  food: "Food",
  medical: "Medical",
  housing: "Housing",
};

// ── Recent Helpers Section ─────────────────────────────────────────────────

interface CompletedRequest {
  id: number;
  title: string;
  helper_id: number | null;
  helper_name: string | null;
  helper_avatar?: string | null;
  completed_at: string | null;
  category: string;
}

function RecentHelpersSection({
  transactions,
  onNavigate,
}: {
  transactions: Transaction[];
  onNavigate: (path: string) => void;
}) {
  const [helpers, setHelpers] = useState<CompletedRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const { currentUser } = useAppContext();
  const userId = currentUser?.id;

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    fetch(`${base}/api/requests?requester_id=${userId}&status=completed&limit=6`)
      .then(r => (r.ok ? r.json() : []))
      .then((rows: CompletedRequest[]) => {
        // Deduplicate by helper_id, only include rows where a helper completed the job
        const seen = new Set<number>();
        const unique: CompletedRequest[] = [];
        for (const r of rows) {
          if (r.helper_id && !seen.has(r.helper_id)) {
            seen.add(r.helper_id);
            unique.push(r);
          }
        }
        setHelpers(unique.slice(0, 5));
      })
      .catch(() => setHelpers([]))
      .finally(() => setLoading(false));
  }, [userId]);

  // Count of "helped me" transactions (pledge_received = pay-it-forward chain coming back)
  const helpReceived = transactions.filter(t => t.type === "pledge_received").length;

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5" /> Helpers Who've Helped You
      </h3>

      {loading && (
        <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">Loading…</span>
        </div>
      )}

      {!loading && helpers.length === 0 && (
        <div className="bg-muted/40 border border-border/60 rounded-xl p-4 text-center">
          <div className="text-2xl mb-2">💙</div>
          <div className="font-bold text-sm">No completed requests yet</div>
          <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Helpers who complete your requests will appear here.
          </div>
        </div>
      )}

      {!loading && helpers.length > 0 && (
        <div className="space-y-2">
          {helpers.map(r => (
            <button
              key={r.id}
              onClick={() => r.helper_id && onNavigate(`/helper/${r.helper_id}`)}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-muted/30 hover:bg-muted/60 border border-border/50 hover:border-primary/30 transition-all text-left group"
            >
              <div className="w-9 h-9 rounded-full bg-muted border border-border flex items-center justify-center shrink-0 overflow-hidden">
                {r.helper_avatar ? (
                  <img src={r.helper_avatar} alt={r.helper_name ?? "Helper"} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs font-black text-muted-foreground">
                    {r.helper_name?.[0] ?? "?"}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate group-hover:text-primary transition-colors">
                  {r.helper_name ?? "Anonymous Helper"}
                </div>
                <div className="text-[10px] text-muted-foreground truncate capitalize">
                  {r.category.replace(/_/g, " ")} · {r.completed_at ? fmtDate(r.completed_at) : "Completed"}
                </div>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            </button>
          ))}
          {helpReceived > 0 && (
            <div className="text-[10px] text-muted-foreground text-center pt-1">
              You've received help {helpReceived} time{helpReceived !== 1 ? "s" : ""} through Niakofa
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const [, setLocation] = useLocation();
  const { currentUser, helperModeActive, setHelperModeActive, myLocation, logout, userPlace } = useAppContext();
  const [tab, setTab] = useState<ProfileTab>("overview");

  // Settings dialog state
  const [openDialog, setOpenDialog] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isVerifyingIdentity, setIsVerifyingIdentity] = useState(false);
  const queryClient = useQueryClient();

  const userId = currentUser?.id;

  const startIdentityVerification = useCallback(async () => {
    if (!userId) return;
    setIsVerifyingIdentity(true);
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const res = await fetch(`${base}/api/verification/identity/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({ title: data.error ?? "Verification unavailable", variant: "destructive" });
      }
    } catch {
      toast({ title: "Verification failed — please try again", variant: "destructive" });
    } finally {
      setIsVerifyingIdentity(false);
    }
  }, [userId]);

  const { data: transactions = [], isLoading: txLoading } = useGetUserTransactions(userId ?? 0, {
    query: { enabled: !!userId, queryKey: getGetUserTransactionsQueryKey(userId ?? 0), staleTime: 30000 }
  });

  const { data: civicData, loading: civicLoading } = useCivicResources(myLocation?.lat, myLocation?.lng);

  // Avatar upload
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const handleAvatarClick = () => avatarInputRef.current?.click();

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result as string;
      setAvatarPreview(dataUrl);
      setAvatarUploading(true);
      try {
        const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
        const res = await fetch(`${base}/api/users/${currentUser.id}/avatar`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ dataUrl }),
        });
        if (res.ok) {
          toast({ title: "Profile photo updated" });
        } else {
          setAvatarPreview(null);
          toast({ title: "Photo upload failed", variant: "destructive" });
        }
      } catch {
        setAvatarPreview(null);
        toast({ title: "Photo upload failed", variant: "destructive" });
      } finally {
        setAvatarUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  if (!currentUser) return null;

  const wallet = currentUser.benevolence_wallet ?? 0;
  const goodwill = currentUser.goodwill_score ?? 0;

  const closeDialog = () => setOpenDialog(null);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl border-b border-border p-4 pt-safe">
        <h1 className="text-xl font-black uppercase tracking-widest flex items-center gap-2">
          <UserIcon className="w-5 h-5 text-primary" /> Profile
        </h1>
        <div className="flex gap-1 mt-3">
          {(["overview", "history", "settings"] as ProfileTab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "overview" ? "Overview" : t === "history" ? "History" : "Settings"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 max-w-lg mx-auto w-full p-4 space-y-4">

        {/* ── OVERVIEW TAB ── */}
        {tab === "overview" && (
          <>
            <div className="flex items-center gap-4 pt-2">
              <div className="relative">
                <button onClick={handleAvatarClick} className="relative group" title="Change profile photo">
                  <div className="w-20 h-20 rounded-full border-4 border-card bg-muted flex items-center justify-center shadow-xl overflow-hidden">
                    {avatarPreview || currentUser.avatar_url
                      ? <img src={avatarPreview ?? currentUser.avatar_url!} alt={currentUser.name} className="w-full h-full object-cover" />
                      : <UserIcon className="w-10 h-10 text-muted-foreground" />
                    }
                  </div>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 rounded-full transition-all flex items-center justify-center">
                    {avatarUploading
                      ? <Loader2 className="w-5 h-5 text-white animate-spin opacity-0 group-hover:opacity-100" />
                      : <Camera className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-all drop-shadow-lg" />
                    }
                  </div>
                </button>
                {helperModeActive && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-background flex items-center justify-center pointer-events-none">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  </div>
                )}
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden sr-only"
                  onChange={handleAvatarChange}
                />
              </div>
              <div>
                <h2 className="text-xl font-black">{currentUser.name}</h2>
                <p className="text-muted-foreground flex items-center gap-1 text-sm">
                  <MapPin className="w-3.5 h-3.5" /> {currentUser.neighborhood || currentUser.city || userPlace?.label || "My Community"}
                </p>
                <div className="flex items-center flex-wrap gap-1.5 mt-1">
                  <TrustTierBadge
                    trustScore={currentUser.trust_score ?? 0}
                    helpCount={currentUser.help_count ?? 0}
                    size="sm"
                  />
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center text-center">
                <Shield className="w-4 h-4 text-blue-400 mb-1.5" />
                <div className="text-xl font-black">{currentUser.trust_score?.toFixed(0) ?? 0}%</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Trust</div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center text-center">
                <Heart className="w-4 h-4 text-primary mb-1.5" />
                <div className="text-xl font-black">{currentUser.help_count ?? 0}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Helped</div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center text-center">
                <Star className="w-4 h-4 text-yellow-400 mb-1.5" />
                <div className="text-xl font-black">{goodwill}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Goodwill</div>
              </div>
            </div>

            {/* Achievement Badges — §3.3.1 Gamification */}
            {(() => {
              const hc = currentUser.help_count ?? 0;
              const ts = currentUser.trust_score ?? 0;
              const gs = currentUser.goodwill_score ?? 0;
              const earned = [
                hc >= 1   && { id: "first",    icon: "🌱", label: "First Help",       desc: "Completed your first request" },
                hc >= 5   && { id: "five",     icon: "💙", label: "5 Helped",         desc: "Helped 5 neighbors" },
                hc >= 25  && { id: "pillar",   icon: "🏛️", label: "Community Pillar", desc: "25 completed requests" },
                hc >= 100 && { id: "legend",   icon: "🌟", label: "Legend",           desc: "100 requests fulfilled" },
                ts >= 80  && { id: "trusted",  icon: "🛡️", label: "Trusted",          desc: "Trust score above 80%" },
                ts >= 95  && { id: "guardian", icon: "⭐", label: "Guardian",         desc: "Trust score above 95%" },
                gs >= 10  && { id: "goodwill", icon: "🙏", label: "Goodwill Hero",    desc: "10+ goodwill points earned" },
                currentUser.is_helper && { id: "helper", icon: "🤝", label: "Helper",  desc: "Registered community helper" },
              ].filter(Boolean) as { id: string; icon: string; label: string; desc: string }[];
              if (earned.length === 0) return null;
              return (
                <div className="bg-card border border-border rounded-2xl p-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 text-yellow-400" /> Achievements
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {earned.map(b => (
                      <div
                        key={b.id}
                        title={b.desc}
                        className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-full px-3 py-1.5 cursor-default"
                      >
                        <span className="text-sm">{b.icon}</span>
                        <span className="text-xs font-bold">{b.label}</span>
                      </div>
                    ))}
                  </div>
                  {earned.length < 4 && (
                    <p className="text-[10px] text-muted-foreground mt-3">Keep helping to unlock more achievements</p>
                  )}
                </div>
              );
            })()}

            {/* Wallet Summary */}
            <button
              onClick={() => setLocation("/wallet")}
              className="w-full bg-gradient-to-r from-primary/20 to-primary/5 border border-primary/30 rounded-2xl p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <Wallet className="w-5 h-5 text-primary" />
                <div className="text-left">
                  <div className="font-black">Benevolence Wallet</div>
                  <div className="text-2xl font-black text-primary">${wallet.toFixed(2)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-sm">View</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </button>

            {/* Helper Performance Dashboard — §3.1.3, §4.7 */}
            {currentUser.is_helper && (
              <div className="bg-card border border-border rounded-2xl p-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-primary" /> Helper Performance
                </h3>

                {/* Anchor Helper badge — 50+ helps, 97%+ trust score */}
                {(currentUser.help_count ?? 0) >= 50 && (currentUser.trust_score ?? 0) >= 97 && (
                  <div className="mb-3 flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                    <span className="text-lg">⚓</span>
                    <div className="flex-1">
                      <div className="text-xs font-black text-amber-400">Anchor Helper</div>
                      <div className="text-[10px] text-muted-foreground">Elite community pillar · Mentor status</div>
                    </div>
                    <Award className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-muted/40 rounded-xl p-3 text-center">
                    <div className="text-xl font-black">{currentUser.help_count ?? 0}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Completed</div>
                  </div>
                  <div className="bg-muted/40 rounded-xl p-3 text-center">
                    <div className="text-xl font-black text-primary">{(currentUser.trust_score ?? 0).toFixed(0)}%</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Trust Score</div>
                  </div>
                  <div className="bg-muted/40 rounded-xl p-3 text-center">
                    <div className="text-xl font-black text-yellow-400">{currentUser.goodwill_score ?? 0}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Goodwill Pts</div>
                  </div>
                  <div className="bg-muted/40 rounded-xl p-3 text-center">
                    <div className="text-xl font-black text-green-400">${(currentUser.benevolence_wallet ?? 0).toFixed(0)}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Earned</div>
                  </div>
                </div>
                {/* Trust tier progress */}
                {(() => {
                  const hc = currentUser.help_count ?? 0;
                  const milestones = [5, 25, 100, 250];
                  const next = milestones.find(m => m > hc);
                  const prev = milestones.filter(m => m <= hc).at(-1) ?? 0;
                  if (!next) return <p className="text-[10px] text-primary font-bold mt-3 text-center">🌟 Max tier achieved!</p>;
                  const pct = Math.round(((hc - prev) / (next - prev)) * 100);
                  return (
                    <div className="mt-3">
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                        <span>{hc} helps completed</span>
                        <span>{next - hc} more to next milestone</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Helper Mode */}
            <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between">
              <div>
                <div className="font-bold flex items-center gap-2">
                  Helper Mode
                  {helperModeActive && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
                </div>
                <p className="text-sm text-muted-foreground">Receive nearby help requests</p>
              </div>
              <Switch
                checked={helperModeActive}
                onCheckedChange={setHelperModeActive}
                className="data-[state=checked]:bg-green-500 scale-125"
              />
            </div>

            {/* Recent Helpers — derived from transaction history */}
            <RecentHelpersSection transactions={transactions} onNavigate={setLocation} />

            <div className="bg-card/50 border border-border/50 rounded-2xl p-4">
              <p className="text-xs text-muted-foreground leading-relaxed text-center">
                This isn't charity — it's neighbors helping neighbors. Help when you can. Ask when you need. Pay forward when you're able.
              </p>
            </div>
          </>
        )}

        {/* ── HISTORY TAB — real transactions ── */}
        {tab === "history" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-bold uppercase tracking-widest">
              <Clock className="w-3.5 h-3.5" /> Your Timeline
            </div>

            {txLoading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Loading history…</span>
              </div>
            )}

            {!txLoading && transactions.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Heart className="w-8 h-8 mx-auto mb-3 text-primary/30" />
                <div className="font-bold text-sm">No activity yet</div>
                <div className="text-xs mt-1">Complete a job or make a pledge to see it here</div>
              </div>
            )}

            {transactions.map(tx => {
              const { label, action, color } = txTypeLabel(tx.type);
              return (
                <div key={tx.id} className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                    tx.type === "earned" ? "bg-green-500/10" :
                    tx.type === "pledge_received" ? "bg-primary/10" :
                    tx.type === "pledge_sent" ? "bg-yellow-500/10" :
                    "bg-purple-500/10"
                  }`}>
                    {tx.type === "earned" ? <Heart className="w-4 h-4 text-green-400" /> :
                     tx.type === "pledge_received" ? <Heart className="w-4 h-4 text-primary" /> :
                     tx.type === "pledge_sent" ? <DollarSign className="w-4 h-4 text-yellow-400" /> :
                     <Gift className="w-4 h-4 text-purple-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{action}</span>
                      <span className="text-[10px] text-muted-foreground/60">{fmtDate(tx.created_at)}</span>
                    </div>
                    <div className="font-semibold text-sm truncate">{tx.description ?? label}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-bold flex items-center gap-0.5 ${color}`}>
                        {tx.type === "goodwill"
                          ? <><Gift className="w-2.5 h-2.5" /> Goodwill</>
                          : tx.type === "pledge_received"
                          ? <><Heart className="w-2.5 h-2.5" /> Niakofa</>
                          : <><DollarSign className="w-2.5 h-2.5" />{tx.amount > 0 ? `+$${tx.amount.toFixed(2)}` : `-$${Math.abs(tx.amount).toFixed(2)}`}</>
                        }
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {tab === "settings" && (
          <div className="space-y-3">

            {/* Identity Verification */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-border">
                <div className="font-black text-sm uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" /> Identity Verification
                </div>
                <p className="text-xs text-muted-foreground mt-1">Verified profiles build trust with the community</p>
              </div>
              <div className="p-4 space-y-3">
                {[
                  { label: "Phone number", done: true, desc: "Verified" },
                  { label: "Email address", done: true, desc: "Verified" },
                  { label: "Government ID", done: (currentUser as any).identity_verified, desc: (currentUser as any).identity_verified ? "Verified" : "Required for emergency helper status" },
                  { label: "Background check", done: (currentUser as any).background_check_status === "completed", desc: (currentUser as any).background_check_status === "completed" ? "Completed" : "Required for Trusted Helper badge" },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">{item.label}</div>
                      <div className="text-[10px] text-muted-foreground">{item.desc}</div>
                    </div>
                    {item.done
                      ? <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                      : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 shrink-0"
                          onClick={startIdentityVerification}
                          disabled={isVerifyingIdentity}
                        >
                          {isVerifyingIdentity ? "Starting…" : "Verify"}
                        </Button>
                      )
                    }
                  </div>
                ))}
              </div>
            </div>

            {/* County / Civic Connection — live, location-aware */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-border">
                <div className="font-black text-sm uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" /> County / Civic Connection
                </div>
                {civicData && !civicLoading ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <MapPin className="w-3 h-3 text-primary shrink-0" />
                    <p className="text-xs text-primary font-semibold truncate">
                      {civicData.city && civicData.county
                        ? `${civicData.city}, ${civicData.county}, ${civicData.state}`
                        : civicData.county
                        ? `${civicData.county}, ${civicData.state}`
                        : civicData.place_name}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    {civicLoading ? "Detecting your location…" : "Local assistance programs and resources"}
                  </p>
                )}
              </div>
              <div className="p-4 space-y-2">
                {civicLoading && (
                  <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Finding resources near you…</span>
                  </div>
                )}
                {!civicLoading && (!civicData || civicData.resources.length === 0) && (
                  <div className="text-center py-4">
                    <BookOpen className="w-6 h-6 mx-auto mb-2 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground font-semibold">No local resources yet</p>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                      We don't have resources for your area yet. Email{" "}
                      <a href="mailto:resources@niakofa.community" className="text-primary hover:underline">
                        resources@niakofa.community
                      </a>{" "}
                      to add your county.
                    </p>
                  </div>
                )}
                {!civicLoading && civicData && civicData.resources.length > 0 && (
                  <>
                    {civicData.match_level === "fallback" && (
                      <p className="text-[10px] text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 mb-2">
                        Showing general resources — enable location for local results
                      </p>
                    )}
                    {civicData.resources.map(org => (
                      <a
                        key={org.id}
                        href={org.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-start justify-between p-3 rounded-xl bg-background hover:bg-muted transition-colors text-sm gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold truncate">{org.org_name}</div>
                          {org.description && (
                            <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{org.description}</div>
                          )}
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {org.category && (
                              <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">
                                {CATEGORY_LABELS[org.category] ?? org.category}
                              </span>
                            )}
                            {org.phone && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <Phone className="w-2.5 h-2.5" /> {org.phone}
                              </span>
                            )}
                          </div>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      </a>
                    ))}
                    <p className="text-[10px] text-muted-foreground pt-1">
                      Resources matched to your detected location. Links open in your browser.
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Support & Safety */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-border">
                <div className="font-black text-sm uppercase tracking-wider flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-yellow-400" /> Support & Safety
                </div>
              </div>
              <div className="divide-y divide-border">
                {[
                  "Report unsafe behavior",
                  "Emergency contacts",
                  "Community guidelines",
                  "Privacy & data",
                  "Help center",
                ].map(item => (
                  <button
                    key={item}
                    onClick={() => setOpenDialog(item)}
                    className="w-full flex items-center justify-between p-4 text-sm hover:bg-muted/50 transition-colors"
                  >
                    <span>{item}</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>

            {/* Account */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-border">
                <div className="font-black text-sm uppercase tracking-wider flex items-center gap-2">
                  <Settings className="w-4 h-4 text-muted-foreground" /> Account
                </div>
              </div>
              <div className="divide-y divide-border">
                <button
                  onClick={() => setLocation("/settings?section=notifications")}
                  className="w-full flex items-center justify-between p-4 text-sm hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-muted-foreground" />
                    <span>Notification preferences</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
                <button
                  onClick={() => setLocation("/settings?section=privacy")}
                  className="w-full flex items-center justify-between p-4 text-sm hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-muted-foreground" />
                    <span>Account privacy</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
                <button
                  onClick={() => setLocation("/settings?section=delete-account")}
                  className="w-full flex items-center justify-between p-4 text-sm hover:bg-muted/50 transition-colors text-destructive"
                >
                  <div className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4" />
                    <span>Delete account</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Admin — trust & safety review queue */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-border">
                <div className="font-black text-sm uppercase tracking-wider flex items-center gap-2">
                  <Shield className="w-4 h-4 text-destructive" /> Admin
                </div>
                <p className="text-xs text-muted-foreground mt-1">Trust &amp; safety review queue</p>
              </div>
              <div className="divide-y divide-border">
                <button
                  onClick={() => setLocation("/admin")}
                  className="w-full flex items-center justify-between p-4 text-sm hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Flag className="w-4 h-4 text-muted-foreground" />
                    <span>Reports &amp; disputes queue</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Business Account */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-border">
                <div className="font-black text-sm uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-500" /> Business Account
                </div>
                <p className="text-xs text-muted-foreground mt-1">Post requests on behalf of your organization</p>
              </div>
              <div className="divide-y divide-border">
                <button
                  onClick={() => setLocation("/business/apply")}
                  className="w-full flex items-center justify-between p-4 text-sm hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <span>Apply / Manage Business</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Sign Out */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <button
                onClick={() => {
                  toast({ title: "Signed out" });
                  logout();
                }}
                className="w-full flex items-center gap-3 p-4 text-sm text-destructive hover:bg-destructive/5 transition-colors"
              >
                <Lock className="w-4 h-4" />
                <span className="font-semibold">Sign Out</span>
              </button>
            </div>

            {/* Helper Profile — service radius, specialties, payout setup */}
            {currentUser.is_helper && (
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-border">
                  <div className="font-black text-sm uppercase tracking-wider flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" /> Helper Profile
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Service radius, specialties, and payout setup</p>
                </div>
                <div className="divide-y divide-border">
                  <button
                    onClick={() => setLocation("/settings?section=helper-settings")}
                    className="w-full flex items-center justify-between p-4 text-sm hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-muted-foreground" />
                      <span>Service radius &amp; specialties</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => setLocation("/settings?section=payout-setup")}
                    className="w-full flex items-center justify-between p-4 text-sm hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-muted-foreground" />
                      <span>Payout setup (Stripe Connect)</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Dialogs ── */}
      {openDialog === "delete_account" && <DeleteAccountDialog onClose={closeDialog} userId={userId ?? 0} />}
      {openDialog === "notification_prefs" && <NotificationPrefsDialog onClose={closeDialog} userId={currentUser.id} />}
      {openDialog === "account_privacy" && <AccountPrivacyDialog onClose={closeDialog} userId={currentUser.id} />}
      {openDialog === "helper_settings" && currentUser.is_helper && (
        <HelperSettingsDialog onClose={closeDialog} userId={currentUser.id} />
      )}
      {openDialog === "payout_setup" && (
        <PayoutSetupDialog onClose={closeDialog} userId={currentUser.id} isHelper={currentUser.is_helper} />
      )}
      {openDialog && !["delete_account", "notification_prefs", "account_privacy", "helper_settings", "payout_setup"].includes(openDialog) && (
        <SafetyDialog item={openDialog} onClose={closeDialog} setShowReportModal={setShowReportModal} />
      )}
      {showReportModal && currentUser && (
        <ReportModal
          reportedUserId={undefined}
          reportedName={undefined}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>
  );
}
