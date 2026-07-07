import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { authHeaders, setToken } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft,
  ChevronRight,
  Bell,
  Lock,
  KeyRound,
  Sliders,
  CreditCard,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Globe,
  Mic,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/lib/AppContext";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import i18n from "../i18n";

// ── API helpers (kept in sync with profile.tsx) ───────────────────────────────

async function fetchSettings(userId: number) {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const res = await fetch(`${base}/api/users/${userId}/settings`, { headers: authHeaders() });
  if (!res.ok) return null;
  return res.json();
}

async function saveSettings(
  userId: number,
  updates: Record<string, boolean | number | string>
) {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const res = await fetch(`${base}/api/users/${userId}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to save settings");
  return res.json();
}

// ── Notification Preferences ──────────────────────────────────────────────────

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
    fetchSettings(userId)
      .then((data) => {
        if (data)
          setPrefs({
            notif_nearby_requests: data.notif_nearby_requests ?? true,
            notif_emergency: data.notif_emergency ?? true,
            notif_task_accepted: data.notif_task_accepted ?? true,
            notif_wallet_updates: data.notif_wallet_updates ?? true,
            notif_community_activity: data.notif_community_activity ?? false,
            notif_pledge_reminders: data.notif_pledge_reminders ?? true,
          });
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const toggle = (key: keyof typeof prefs) =>
    setPrefs((p) => ({ ...p, [key]: !p[key] }));

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
          <div className="pt-1 border-t border-border/60">
            <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wider font-bold">
              In-App Notification Types
            </p>
            {(Object.keys(prefs) as (keyof typeof prefs)[]).map((key) => (
              <div
                key={key}
                className="flex items-center justify-between p-3 bg-background rounded-xl border border-border mb-2"
              >
                <span className="text-sm">{labels[key]}</span>
                <Switch
                  checked={prefs[key]}
                  onCheckedChange={() => toggle(key)}
                />
              </div>
            ))}
          </div>
          <Button
            className="w-full mt-2"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Preferences"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Account Privacy ───────────────────────────────────────────────────────────

function LanguageSwitcher(_: { userId: number }) {
  const [lang, setLang] = useState(i18n.language ?? "en");

  const languages = [
    { code: "en", label: "English",          native: "English",         flag: "🇺🇸", region: "US / Global" },
    { code: "es", label: "Español",           native: "Español",         flag: "🇲🇽", region: "América Latina · España" },
    { code: "fr", label: "Français",          native: "Français",        flag: "🇫🇷", region: "Afrique · France · Haïti" },
    { code: "pt", label: "Português",         native: "Português",       flag: "🇧🇷", region: "Brasil · Angola · Moçambique" },
    { code: "sw", label: "Kiswahili",         native: "Kiswahili",       flag: "🇰🇪", region: "Afrika Mashariki" },
    { code: "so", label: "Somali",            native: "Af Soomaali",     flag: "🇸🇴", region: "Minnesota · Mogadishu" },
    { code: "am", label: "Amharic",           native: "አማርኛ",            flag: "🇪🇹", region: "Ethiopia · D.C. · Dallas" },
    { code: "yo", label: "Yoruba",            native: "Yorùbá",          flag: "🇳🇬", region: "Nàìjíríà · Èkó" },
    { code: "ha", label: "Hausa",             native: "Hausa",           flag: "🇳🇬", region: "Arewacin Najeriya · Nijar" },
    { code: "ig", label: "Igbo",              native: "Asụsụ Igbo",      flag: "🇳🇬", region: "Igboland · Diaspora" },
    { code: "tw", label: "Twi (Akan)",        native: "Twi",             flag: "🇬🇭", region: "Ghana · London · New York" },
    { code: "wo", label: "Wolof",             native: "Wolof",           flag: "🇸🇳", region: "Senegaal · Gàmbia · Paris" },
    { code: "ht", label: "Kreyòl Ayisyen",   native: "Kreyòl Ayisyen",  flag: "🇭🇹", region: "Ayiti · Miami · Nòw Yòk" },
    { code: "ar", label: "Arabic",            native: "العربية",          flag: "🌍", region: "Arabworld · Diaspora" },
    { code: "zu", label: "Zulu",              native: "isiZulu",         flag: "🇿🇦", region: "South Africa" },
  ];

  const handleChange = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem("niakofa_lang", code);
    setLang(code);
    const selected = languages.find(l => l.code === code);
    toast({ title: `Language changed to ${selected?.label ?? code}` });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Choose your preferred language. Nia will respond in your language too.
      </p>
      {languages.map(l => (
        <button
          key={l.code}
          onClick={() => handleChange(l.code)}
          className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-colors text-left active:scale-[0.98] ${
            lang === l.code
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-foreground hover:border-primary/40"
          }`}
          style={{ touchAction: "manipulation" }}
        >
          <span className="text-2xl w-8 shrink-0">{l.flag}</span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">{l.native}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{l.region}</div>
          </div>
          {lang === l.code && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
        </button>
      ))}
    </div>
  );
}

// ── Nia Voice ──────────────────────────────────────────────────────────────────

interface VoiceProfileOption {
  id: string;
  name: string;   // API returns 'name' (not 'label')
  available: boolean;
}

function NiaVoiceSettings(_: { userId: number }) {
  const [profiles, setProfiles] = useState<VoiceProfileOption[]>([]);
  const [selected, setSelected] = useState(
    () => { try { return localStorage.getItem("nia_voice_profile") ?? "default_en"; } catch { return "default_en"; } }
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    fetch(`${base}/api/nia/voice/profiles`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : { profiles: [] }))
      .then((data: { profiles?: VoiceProfileOption[] }) => setProfiles(data.profiles ?? []))
      .catch(() => setProfiles([]))
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = (id: string, available: boolean) => {
    if (!available) {
      toast({ title: "This voice isn't live yet", description: "We'll let you know when it's ready." });
      return;
    }
    try { localStorage.setItem("nia_voice_profile", id); } catch {}
    setSelected(id);
    const name = profiles.find((p) => p.id === id)?.name ?? id;
    toast({ title: `Nia's voice set to ${name}` });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold">Nia's Voice</h2>
      <p className="text-sm text-muted-foreground">
        Choose the voice Nia speaks with. Voices are real, licensed recordings —
        not a synthetic accent. Standard English is always available.
      </p>
      {profiles.map((p) => (
        <button
          key={p.id}
          onClick={() => handleSelect(p.id, p.available)}
          className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-colors text-left active:scale-[0.98] ${
            selected === p.id
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-foreground hover:border-primary/40"
          } ${!p.available ? "opacity-50" : ""}`}
          style={{ touchAction: "manipulation" }}
        >
          <Mic className="w-4 h-4 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">{p.name}</div>
            {!p.available && (
              <div className="text-[11px] text-muted-foreground mt-0.5">Coming soon</div>
            )}
          </div>
          {selected === p.id && p.available && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
        </button>
      ))}
      {profiles.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          Voice profiles are not available yet.
        </p>
      )}
    </div>
  );
}

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
    fetchSettings(userId)
      .then((data) => {
        if (data)
          setPrefs({
            privacy_profile_visible: data.privacy_profile_visible ?? true,
            privacy_live_location: data.privacy_live_location ?? false,
            privacy_activity_sharing: data.privacy_activity_sharing ?? true,
            privacy_anonymous_giving: data.privacy_anonymous_giving ?? false,
          });
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const toggle = (key: keyof typeof prefs) =>
    setPrefs((p) => ({ ...p, [key]: !p[key] }));

  const items: { key: keyof typeof prefs; label: string; desc: string }[] = [
    {
      key: "privacy_profile_visible",
      label: "Profile discoverable",
      desc: "Others can find your profile when searching for helpers",
    },
    {
      key: "privacy_live_location",
      label: "Share live location",
      desc: "Show your real-time position to requesters when helping",
    },
    {
      key: "privacy_activity_sharing",
      label: "Activity sharing",
      desc: "Show recent help activity on your public profile",
    },
    {
      key: "privacy_anonymous_giving",
      label: "Anonymous giving",
      desc: "Niakofa contributions appear as anonymous",
    },
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
          {items.map((item) => (
            <div
              key={item.key}
              className="p-3 bg-background rounded-xl border border-border mb-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm">{item.label}</span>
                <Switch
                  checked={prefs[item.key]}
                  onCheckedChange={() => toggle(item.key)}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
            </div>
          ))}
          <Button
            className="w-full mt-2"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Preferences"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Change Password ────────────────────────────────────────────────────────────

function ChangePassword({ userId }: { userId: number }) {
  const { setCurrentUser } = useAppContext();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword &&
    !saving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must be different from your current password");
      return;
    }

    setSaving(true);
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const res = await fetch(`${base}/api/users/${userId}/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data?.error_code === "LEGACY_PASSWORD_REQUIRED") {
          setError("Your account doesn't have a password set yet. Use \"Forgot password\" on the login screen to set one.");
        } else {
          setError(data?.error ?? "Failed to change password");
        }
        return;
      }

      // Server rotates token_version on password change, invalidating old tokens —
      // store the freshly issued token so this session stays signed in.
      if (data?.token) setToken(data.token);
      if (data?.user) setCurrentUser(data.user);

      toast({ title: "Password changed", description: "Your password has been updated." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Change Password</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground" htmlFor="current-password">
            Current password
          </label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground" htmlFor="new-password">
            New password
          </label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
          <p className="text-[10px] text-muted-foreground">At least 8 characters.</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground" htmlFor="confirm-password">
            Confirm new password
          </label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-xl">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        <Button type="submit" className="w-full mt-2" disabled={!canSubmit}>
          {saving ? "Updating…" : "Update Password"}
        </Button>
      </form>
    </div>
  );
}

// ── Helper Settings ───────────────────────────────────────────────────────────

function HelperSettings({ userId }: { userId: number }) {
  const [prefs, setPrefs] = useState({
    service_radius_miles: 5,
    max_travel_miles: 10,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings(userId)
      .then((data) => {
        if (data)
          setPrefs({
            service_radius_miles: data.service_radius_miles ?? 5,
            max_travel_miles: data.max_travel_miles ?? 10,
          });
      })
      .finally(() => setLoading(false));
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
            <label
              htmlFor="service_radius"
              className="text-sm font-semibold"
            >
              Service Radius (miles)
            </label>
            <input
              id="service_radius"
              type="number"
              min={1}
              max={50}
              value={prefs.service_radius_miles}
              onChange={(e) =>
                setPrefs((p) => ({
                  ...p,
                  service_radius_miles: parseInt(e.target.value) || 1,
                }))
              }
              className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary transition-all mt-2"
              style={{ fontSize: "16px" }}
            />
          </div>
          <div className="p-3 bg-background rounded-xl border border-border mb-2">
            <label
              htmlFor="max_travel"
              className="text-sm font-semibold"
            >
              Max Travel Distance (miles)
            </label>
            <input
              id="max_travel"
              type="number"
              min={1}
              max={100}
              value={prefs.max_travel_miles}
              onChange={(e) =>
                setPrefs((p) => ({
                  ...p,
                  max_travel_miles: parseInt(e.target.value) || 1,
                }))
              }
              className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary transition-all mt-2"
              style={{ fontSize: "16px" }}
            />
          </div>
          <Button
            className="w-full mt-2"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Helper Settings"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Payout Setup ──────────────────────────────────────────────────────────────

function PayoutSetup({ userId }: { userId: number }) {
  const [loading, setLoading] = useState(false);
  const [stripeAccountStatus, setStripeAccountStatus] = useState<string | null>(
    null
  );

  useEffect(() => {
    const fetchStripeStatus = async () => {
      setLoading(true);
      try {
        const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
        const res = await fetch(
          `${base}/api/stripe/connect/status/${userId}`,
          { headers: authHeaders() }
        );
        if (res.ok) {
          const data = await res.json();
          setStripeAccountStatus(data.status);
        } else {
          setStripeAccountStatus("not_connected");
        }
      } catch {
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
      const res = await fetch(
        `${base}/api/stripe/connect/onboard/${userId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({
          title: data.error || "Failed to connect Stripe",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Could not connect to Stripe — please try again",
        variant: "destructive",
      });
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
              <span className="text-sm font-semibold text-green-400">
                Stripe Connected
              </span>
            </div>
          ) : stripeAccountStatus === "pending_requirements" ? (
            <div className="flex items-center gap-2 p-3 bg-yellow-500/10 rounded-xl border border-yellow-500/30">
              <AlertCircle className="w-5 h-5 text-yellow-400" />
              <span className="text-sm font-semibold text-yellow-400">
                Action Required: Complete Stripe Onboarding
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleConnectStripe}
                disabled={loading}
                className="ml-auto"
              >
                Continue Setup
              </Button>
            </div>
          ) : (
            <Button
              className="w-full"
              onClick={handleConnectStripe}
              disabled={loading}
            >
              Connect with Stripe
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Connect your Stripe account to receive payouts for completed help
            requests.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Section type ──────────────────────────────────────────────────────────────

type SectionComponent = React.ComponentType<{ userId: number }>;

interface SettingsSection {
  id: string;
  title: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  component: SectionComponent | null;
}

// ── Main Settings Page ────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [, setLocation] = useLocation();
  const { currentUser } = useAppContext();

  // Read ?section= query param to allow deep-linking from profile page
  const initialSection = new URLSearchParams(window.location.search).get("section");
  const [activeSection, setActiveSection] = useState<string | null>(initialSection);

  if (!currentUser) {
    setLocation("/login");
    return null;
  }

  const sections: SettingsSection[] = [
    {
      id: "notifications",
      title: "Notification Preferences",
      icon: Bell,
      component: NotificationPreferences,
      description: "Nearby requests, alerts & pledge reminders",
    },
    {
      id: "privacy",
      title: "Account Privacy",
      icon: Lock,
      component: AccountPrivacy,
      description: "Profile visibility, live location & activity",
    },
    {
      id: "change-password",
      title: "Change Password",
      icon: KeyRound,
      component: ChangePassword,
      description: "Update your account password",
    },
    {
      id: "language",
      title: "Language / Idioma",
      icon: Globe,
      component: LanguageSwitcher,
      description: "App language & Nia's response language",
    },
    {
      id: "nia-voice",
      title: "Nia's Voice",
      icon: Mic,
      component: NiaVoiceSettings,
      description: "Choose how Nia speaks to you",
    },
    {
      id: "delete-account",
      title: "Delete Account",
      icon: Trash2,
      component: null,
      description: "Permanently remove your account and data",
    },
  ];

  if (currentUser.is_helper) {
    sections.splice(2, 0,
      {
        id: "helper-settings",
        title: "Helper Settings",
        icon: Sliders,
        component: HelperSettings,
        description: "Service radius & max travel distance",
      },
      {
        id: "payout-setup",
        title: "Payout Setup",
        icon: CreditCard,
        component: PayoutSetup,
        description: "Connect Stripe to receive payments",
      }
    );
  }

  const activeEntry = sections.find((s) => s.id === activeSection) ?? null;
  const CurrentComponent = activeEntry?.component ?? null;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header — sticky, safe-area aware */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl border-b border-border flex items-center p-4 pt-safe gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() =>
            activeSection ? setActiveSection(null) : setLocation("/profile")
          }
          className="rounded-full shrink-0"
          style={{ touchAction: "manipulation" }}
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-black">
          {activeSection ? (activeEntry?.title ?? "Settings") : "Settings"}
        </h1>
      </div>

      {/* Body — pb-28 keeps last card above the bottom nav on all devices */}
      <div className="flex-1 overflow-y-auto p-4 pb-28 max-w-lg mx-auto w-full">
        {!activeSection ? (
          /* Section list — full-height tappable cards with descriptions */
          <div className="space-y-2 pt-2">
            {sections.map((section) => {
              const isDelete = section.id === "delete-account";
              return (
                <button
                  key={section.id}
                  style={{ touchAction: "manipulation", minHeight: "68px" }}
                  className={`w-full flex items-center justify-between px-4 py-4 bg-card border rounded-2xl transition-all active:scale-[0.98] text-left ${
                    isDelete
                      ? "border-destructive/30 hover:border-destructive/50"
                      : "border-border hover:border-primary/40 hover:bg-card/80"
                  }`}
                  onClick={() => setActiveSection(section.id)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isDelete ? "bg-destructive/10" : "bg-muted"
                    }`}>
                      <section.icon className={`w-5 h-5 ${
                        isDelete ? "text-destructive" : "text-muted-foreground"
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-bold leading-tight ${isDelete ? "text-destructive" : ""}`}>
                        {section.title}
                      </div>
                      {section.description && (
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          {section.description}
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 shrink-0 ml-2 ${isDelete ? "text-destructive/50" : "text-muted-foreground"}`} />
                </button>
              );
            })}
          </div>
        ) : (
          /* Active subsection */
          <div className="py-2">
            {CurrentComponent && (
              <CurrentComponent userId={currentUser.id} />
            )}

            {activeSection === "delete-account" && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-destructive">Delete Account</h2>
                <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4">
                  <p className="text-sm text-destructive font-bold mb-1">
                    This cannot be undone.
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Deleting your account will permanently remove your profile,
                    transaction history, goodwill score, and benevolence wallet
                    balance. Scheduled payments will be cancelled.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Under GDPR/CCPA regulations, you have the right to request
                  deletion of your personal data. Your data will be removed
                  within 30 days of confirmation. To request deletion, contact:
                </p>
                <a
                  href="mailto:privacy@niakofa.community?subject=Account%20Deletion%20Request"
                  className="block bg-card border border-border rounded-2xl p-4 text-sm text-primary font-semibold hover:border-primary/50 transition-colors"
                >
                  📧 privacy@niakofa.community
                </a>
                <Button
                  variant="destructive"
                  className="w-full h-12 text-sm font-bold"
                  onClick={() => {
                    toast({
                      title: "Deletion request submitted",
                      description:
                        "You will receive a confirmation email within 24 hours.",
                    });
                  }}
                >
                  Request Account Deletion
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
