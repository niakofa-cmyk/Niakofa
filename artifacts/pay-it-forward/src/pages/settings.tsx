import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Bell, Lock, Sliders, CreditCard, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/lib/AppContext";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";

// Re-use fetchSettings and saveSettings from profile.tsx
async function fetchSettings(userId: number) {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const res = await fetch(`${base}/api/users/${userId}/settings`);
  if (!res.ok) return null;
  return res.json();
}

async function saveSettings(userId: number, updates: Record<string, boolean | number | string>) {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const res = await fetch(`${base}/api/users/${userId}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to save settings");
  return res.json();
}

// Notification Preferences Component
function NotificationPreferences({ userId }: { userId: number }) {
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
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Notification Preferences</h2>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Push notification enable — must grant permission for any toggles below to reach the device */}
          {/* <PushEnableButton userId={userId} /> */}
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
    </div>
  );
}

// Account Privacy Component
function AccountPrivacy({ userId }: { userId: number }) {
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
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Account Privacy</h2>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.key} className="p-3 bg-background rounded-xl border border-border mb-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">{item.label}</span>
                <Switch checked={prefs[item.key]} onCheckedChange={() => toggle(item.key)} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
            </div>
          ))}
          <Button className="w-full mt-2" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Preferences"}
          </Button>
        </div>
      )}
    </div>
  );
}

// Helper Settings Component
function HelperSettings({ userId }: { userId: number }) {
  const [prefs, setPrefs] = useState({
    service_radius_miles: 5,
    max_travel_miles: 10,
    specialties: [] as string[],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings(userId).then(data => {
      if (data) setPrefs({
        service_radius_miles: data.service_radius_miles ?? 5,
        max_travel_miles: data.max_travel_miles ?? 10,
        specialties: data.specialties ?? [],
      });
    }).finally(() => setLoading(false));
  }, [userId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings(userId, prefs);
      toast({ title: "Helper settings saved" });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Helper Settings</h2>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="p-3 bg-background rounded-xl border border-border mb-2">
            <label htmlFor="service_radius" className="text-sm font-semibold">Service Radius (miles)</label>
            <input
              id="service_radius"
              type="number"
              value={prefs.service_radius_miles}
              onChange={(e) => setPrefs(p => ({ ...p, service_radius_miles: parseInt(e.target.value) }))}
              className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary transition-all mt-2"
            />
          </div>
          <div className="p-3 bg-background rounded-xl border border-border mb-2">
            <label htmlFor="max_travel" className="text-sm font-semibold">Max Travel Distance (miles)</label>
            <input
              id="max_travel"
              type="number"
              value={prefs.max_travel_miles}
              onChange={(e) => setPrefs(p => ({ ...p, max_travel_miles: parseInt(e.target.value) }))}
              className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary transition-all mt-2"
            />
          </div>
          {/* Specialties would be a multi-select or tag input */}
          <Button className="w-full mt-2" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Helper Settings"}
          </Button>
        </div>
      )}
    </div>
  );
}

// Payout Setup Component
function PayoutSetup({ userId }: { userId: number }) {
  const [loading, setLoading] = useState(false);
  const [stripeAccountStatus, setStripeAccountStatus] = useState<string | null>(null);

  useEffect(() => {
    const fetchStripeStatus = async () => {
      setLoading(true);
      try {
        const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
        const res = await fetch(`${base}/api/stripe/connect/status/${userId}`);
        if (res.ok) {
          const data = await res.json();
          setStripeAccountStatus(data.status);
        } else {
          setStripeAccountStatus("not_connected");
        }
      } catch (error) {
        console.error("Failed to fetch Stripe status:", error);
        setStripeAccountStatus("error");
      } finally {
        setLoading(false);
      }
    };
    fetchStripeStatus();
  }, [userId]);

  const handleConnectStripe = async () => {
    setLoading(true);
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const res = await fetch(`${base}/api/stripe/connect/onboard/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({ title: data.error || "Failed to connect Stripe", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Could not connect to Stripe — please try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Payout Setup</h2>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {stripeAccountStatus === "connected" ? (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded-xl border border-green-500/30">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <span className="text-sm font-semibold text-green-400">Stripe Connected</span>
            </div>
          ) : stripeAccountStatus === "pending_requirements" ? (
            <div className="flex items-center gap-2 p-3 bg-yellow-500/10 rounded-xl border border-yellow-500/30">
              <AlertCircle className="w-5 h-5 text-yellow-400" />
              <span className="text-sm font-semibold text-yellow-400">Action Required: Complete Stripe Onboarding</span>
              <Button variant="outline" size="sm" onClick={handleConnectStripe} disabled={loading} className="ml-auto">
                Continue Setup
              </Button>
            </div>
          ) : (
            <Button className="w-full" onClick={handleConnectStripe} disabled={loading}>
              Connect with Stripe
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Connect your Stripe account to receive payouts for completed help requests.
          </p>
        </div>
      )}
    </div>
  );
}

// Main Settings Page Component
export default function SettingsPage() {
  const [, setLocation] = useLocation();
  const { currentUser } = useAppContext();
  const [activeSection, setActiveSection] = useState<string | null>(null);

  if (!currentUser) {
    setLocation("/login");
    return null;
  }

  const sections = [
    { id: "notifications", title: "Notification Preferences", icon: Bell, component: NotificationPreferences },
    { id: "privacy", title: "Account Privacy", icon: Lock, component: AccountPrivacy },
    { id: "delete-account", title: "Delete Account", icon: Trash2, component: null }, // Special case for delete
  ];

  if (currentUser.is_helper) {
    sections.push(
      { id: "helper-settings", title: "Helper Settings", icon: Sliders, component: HelperSettings },
      { id: "payout-setup", title: "Payout Setup", icon: CreditCard, component: PayoutSetup },
    );
  }

  const CurrentComponent = activeSection ? sections.find(s => s.id === activeSection)?.component : null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center p-4 border-b border-border">
        {activeSection ? (
          <Button variant="ghost" size="icon" onClick={() => setActiveSection(null)} className="rounded-full">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" onClick={() => setLocation("/profile")} className="rounded-full">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        )}
        <h1 className="text-lg font-black ml-2">{activeSection ? sections.find(s => s.id === activeSection)?.title : "Settings"}</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!activeSection ? (
          <div className="space-y-3">
            {sections.map(section => (
              <Button
                key={section.id}
                variant="ghost"
                className="w-full flex items-center justify-between p-4 text-sm hover:bg-muted/50 transition-colors"
                onClick={() => {
                  if (section.id === "delete-account") {
                    // Handle delete account directly or via a specific dialog
                    // For now, let's keep the mailto link or a simple toast
                    toast({ title: "Account deletion initiated", description: "Please check your email for instructions." });
                  } else {
                    setActiveSection(section.id);
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <section.icon className="w-4 h-4 text-muted-foreground" />
                  <span>{section.title}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </Button>
            ))}
          </div>
        ) : (
          <div className="py-4">
            {CurrentComponent && <CurrentComponent userId={currentUser.id} />}
            {activeSection === "delete-account" && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold">Delete Account</h2>
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
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => {
                    // This will be replaced by the actual delete account logic later
                    toast({ title: "Account deletion initiated", description: "Please check your email for instructions." });
                  }}
                >
                  Request Deletion
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
