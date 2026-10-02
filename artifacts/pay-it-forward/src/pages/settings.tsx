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
  PawPrint,
  HeartHandshake,
  MapPin,
  Sun,
} from "lucide-react";
import { ColorModeSwitch } from "@/components/appearance/ColorModeSwitch";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/lib/AppContext";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import i18n from "../i18n";
import { SpiritAnimalAvatar } from "@/components/SpiritAnimal/SpiritAnimalAvatar";
import {
  SPIRIT_ANIMAL_IDS,
  SPIRIT_ANIMAL_LABELS,
  SPIRIT_ANIMAL_FEEL,
  SPIRIT_ANIMAL_BLURBS,
  type SpiritAnimalId,
} from "@/components/SpiritAnimal/types";
import { getSpiritEnvironment } from "@/components/SpiritAnimal/environments";
import { LocationPuck } from "@/components/LocationPuck";
import {
  isLocationMarkerStyle,
  type LocationMarkerStyle,
} from "@/lib/location-marker";

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
  if (!res.ok) {
    let payload: { error?: string; settings?: Record<string, unknown> } = {};
    try {
      payload = await res.json();
    } catch {
      // Keep the generic save error below for non-JSON failures.
    }
    const error = new Error(payload.error ?? "Failed to save settings") as Error & {
      settings?: Record<string, unknown>;
    };
    error.settings = payload.settings;
    throw error;
  }
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
    notif_exchange_activity: false,
    notif_exchange_digest: false,
    notif_exchange_needs: true,
    notif_exchange_offers: true,
    notif_exchange_goods: true,
    notif_exchange_services: true,
    notif_exchange_urgent_aid: true,
    notif_optional_paused: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

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
            notif_exchange_activity: data.notif_exchange_activity ?? false,
            notif_exchange_digest: data.notif_exchange_digest ?? false,
            notif_exchange_needs: data.notif_exchange_needs ?? true,
            notif_exchange_offers: data.notif_exchange_offers ?? true,
            notif_exchange_goods: data.notif_exchange_goods ?? true,
            notif_exchange_services: data.notif_exchange_services ?? true,
            notif_exchange_urgent_aid: data.notif_exchange_urgent_aid ?? true,
            notif_optional_paused: data.notif_optional_paused ?? false,
          });
          setUpdatedAt(typeof data.updated_at === "string" ? data.updated_at : null);
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
    notif_exchange_activity: "Exchange activity near me",
    notif_exchange_digest: "Weekly Exchange digest",
    notif_exchange_needs: "Exchange needs",
    notif_exchange_offers: "Exchange offers",
    notif_exchange_goods: "Exchange goods",
    notif_exchange_services: "Exchange services",
    notif_exchange_urgent_aid: "Urgent aid Exchange posts",
    notif_optional_paused: "Pause optional notifications",
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveSettings(userId, {
        ...prefs,
        ...(updatedAt ? { expected_updated_at: updatedAt } : {}),
      });
      setUpdatedAt(typeof saved.updated_at === "string" ? saved.updated_at : updatedAt);
      toast({ title: "Notification preferences saved" });
    } catch (error) {
      // A stale settings timestamp means another tab/session won the write.
      // Adopt the server copy instead of leaving a misleading optimistic UI.
      const serverSettings = error instanceof Error
        ? (error as Error & { settings?: Record<string, unknown> }).settings
        : undefined;
      if (serverSettings) {
        setPrefs((current) => {
          const next = { ...current };
          for (const key of Object.keys(current) as (keyof typeof current)[]) {
            if (typeof serverSettings[key] === "boolean") next[key] = serverSettings[key] as boolean;
          }
          return next;
        });
        setUpdatedAt(typeof serverSettings.updated_at === "string" ? serverSettings.updated_at : updatedAt);
      }
      toast({
        title: serverSettings ? "Preferences changed elsewhere" : "Failed to save. Please reload and try again.",
        description: serverSettings ? "Your screen now shows the saved preferences." : undefined,
        variant: "destructive",
      });
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
                <span className={`text-sm ${key.startsWith("notif_exchange_") ? "pl-3" : ""}`}>{labels[key]}</span>
                <Switch
                  checked={prefs[key]}
                  onCheckedChange={() => toggle(key)}
                   disabled={saving}
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

function SpiritAnimalSettings({ userId }: { userId: number }) {
  const [selected, setSelected] = useState<SpiritAnimalId>("sankofa_bird");
  const [markerStyle, setMarkerStyle] = useState<LocationMarkerStyle>("puck");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings(userId)
      .then((data) => {
        const animal = data?.spirit_animal;
        if (typeof animal === "string" && SPIRIT_ANIMAL_IDS.includes(animal as SpiritAnimalId)) {
          setSelected(animal as SpiritAnimalId);
        }
        if (isLocationMarkerStyle(data?.location_marker_style)) {
          setMarkerStyle(data.location_marker_style);
        }
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const handleSelect = async (id: SpiritAnimalId) => {
    if (id === selected || saving) return;
    const previous = selected;
    setSelected(id);
    setSaving(true);
    try {
      await saveSettings(userId, { spirit_animal: id });
      toast({ title: `${SPIRIT_ANIMAL_LABELS[id]} is now your companion` });
    } catch {
      setSelected(previous);
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkerStyleSelect = async (style: LocationMarkerStyle) => {
    if (style === markerStyle || saving) return;
    const previous = markerStyle;
    setMarkerStyle(style);
    setSaving(true);
    try {
      await saveSettings(userId, { location_marker_style: style });
      toast({ title: style === "puck" ? "Blue location puck enabled" : "Spirit companion enabled" });
    } catch {
      setMarkerStyle(previous);
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Spirit Animal</h2>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Each companion changes the entire feel of the app — shadows, transitions, palette, and more. Choose the one that moves with you.
          </p>
          <div className="space-y-2 border-b border-border pb-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold">Location marker</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              The blue puck is the default directional marker. A Spirit Animal is optional and may switch back to the puck when reduced motion or battery saver is active.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleMarkerStyleSelect("puck")}
                disabled={saving}
                className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl border p-3 text-xs font-bold transition-colors disabled:opacity-60 ${
                  markerStyle === "puck" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <LocationPuck heading={0} mapBearing={0} size={42} />
                Blue puck
              </button>
              <button
                type="button"
                onClick={() => handleMarkerStyleSelect("spirit")}
                disabled={saving}
                className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl border p-3 text-xs font-bold transition-colors disabled:opacity-60 ${
                  markerStyle === "spirit" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <SpiritAnimalAvatar species={selected} heading={0} size={42} mapZoom={16} />
                Spirit companion
              </button>
            </div>
          </div>
          {SPIRIT_ANIMAL_IDS.map((id) => {
            const env = getSpiritEnvironment(id);
            const isSelected = selected === id;
            return (
              <button
                key={id}
                onClick={() => handleSelect(id)}
                disabled={saving}
                className={`w-full flex items-start gap-3 p-4 rounded-xl border transition-all text-left active:scale-[0.98] disabled:opacity-60 ${
                  isSelected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-foreground hover:border-primary/40"
                }`}
                style={{
                  touchAction: "manipulation",
                  borderColor: isSelected ? env.particleColor : undefined,
                  background: isSelected
                    ? `${env.cssVars["--spirit-surface-tint"]}`
                    : undefined,
                }}
              >
                {/* Avatar */}
                <div
                  className="w-14 h-14 shrink-0 rounded-xl flex items-center justify-center overflow-hidden"
                  style={{
                    background: `${env.cssVars["--spirit-bg-gradient"]}, rgba(0,0,0,0.15)`,
                    boxShadow: isSelected
                      ? `0 0 12px ${env.particleColor}55`
                      : undefined,
                  }}
                >
                  <SpiritAnimalAvatar species={id} heading={0} size={44} mapZoom={16} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{SPIRIT_ANIMAL_LABELS[id]}</span>
                    {isSelected && (
                      <CheckCircle2
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: env.particleColor }}
                      />
                    )}
                  </div>

                  {/* Feel tag */}
                  <div
                    className="text-[10px] font-semibold mt-0.5 mb-1 tracking-wide uppercase"
                    style={{ color: env.particleColor, opacity: 0.85 }}
                  >
                    {SPIRIT_ANIMAL_FEEL[id]}
                  </div>

                  {/* Blurb */}
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {SPIRIT_ANIMAL_BLURBS[id]}
                  </p>

                  {/* Accent swatches */}
                  <div className="flex items-center gap-1.5 mt-2">
                    {[
                      env.cssVars["--spirit-accent"],
                      env.particleColor,
                      env.cssVars["--spirit-nav-glow"]?.replace(/rgba?\([^)]+\)/, env.particleColor) ?? env.particleColor,
                    ].filter((c, i, a) => a.indexOf(c) === i).slice(0, 3).map((color, i) => (
                      <div
                        key={i}
                        className="w-3 h-3 rounded-full border border-white/10"
                        style={{ background: color }}
                      />
                    ))}
                    <span className="text-[10px] text-muted-foreground ml-1">
                      {env.atmosphere}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
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
      .catch(() => {
        // Keep whatever was previously loaded — don't clear on transient error.
      })
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

// ── Niakofa Mission ("Help Today, Pay It Forward Tomorrow") ──────────────────
// Groups the pay-it-forward-specific preferences that used to be scattered
// across Privacy and Notifications into one branded destination, reachable
// directly from the Map screen's floating nav (see BottomNav.tsx).
function NiaMissionSettings({ userId }: { userId: number }) {
  const [prefs, setPrefs] = useState({
    privacy_anonymous_giving: false,
    notif_pledge_reminders: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings(userId)
      .then((data) => {
        if (data)
          setPrefs({
            privacy_anonymous_giving: data.privacy_anonymous_giving ?? false,
            notif_pledge_reminders: data.notif_pledge_reminders ?? true,
          });
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const toggle = (key: keyof typeof prefs) =>
    setPrefs((p) => ({ ...p, [key]: !p[key] }));

  const items: { key: keyof typeof prefs; label: string; desc: string }[] = [
    {
      key: "privacy_anonymous_giving",
      label: "Anonymous giving",
      desc: "Your Niakofa contributions appear as anonymous to the person you help",
    },
    {
      key: "notif_pledge_reminders",
      label: "Pay-it-forward reminders",
      desc: "Nudge me when a scheduled pledge is coming due",
    },
  ];

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings(userId, prefs);
      toast({ title: "Niakofa settings saved" });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Niakofa</h2>
      <p className="text-xs font-black uppercase tracking-widest text-primary/80">
        Help Today, Pay It Forward Tomorrow
      </p>
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

function AccountPrivacy({ userId }: { userId: number }) {
  const [prefs, setPrefs] = useState({
    privacy_profile_visible: true,
    privacy_live_location: false,
    privacy_activity_sharing: true,
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

function AppearanceSettings() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Dark mode uses deep navy. Light mode uses the off-white surface. Electric cyan stays the action color, with navy text on those buttons.</p>
      <ColorModeSwitch ariaLabel="Settings color mode" />
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl p-3" style={{ background: "#08182b", color: "#ffffff" }}>
          <div className="font-black">Dark</div>
          <div style={{ color: "#8ea6c0" }}>Secondary text</div>
          <div className="mt-2 inline-block rounded-full px-2 py-1 font-black" style={{ background: "#00cfff", color: "#08182b" }}>Cyan</div>
          <span className="ml-2 font-black" style={{ color: "#ff5a5f" }}>Alert</span>
        </div>
        <div className="rounded-xl border p-3" style={{ background: "#f8fafc", color: "#08182b", borderColor: "#e2e8f0" }}>
          <div className="font-black">Light</div>
          <div style={{ color: "#4a627a" }}>Secondary text</div>
          <div className="mt-2 inline-block rounded-full px-2 py-1 font-black" style={{ background: "#00cfff", color: "#08182b" }}>Cyan</div>
          <span className="ml-2 font-black" style={{ color: "#ff5a5f" }}>Alert</span>
        </div>
      </div>
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
  group: "mission" | "account" | "diaspora" | "helper";
}

const GROUP_LABELS: Record<SettingsSection["group"], string> = {
  mission: "Niakofa Mission",
  account: "Account",
  diaspora: "Diaspora & Personalization",
  helper: "Helper Tools",
};

// ── Main Settings Page ────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [, setLocation] = useLocation();
  const { currentUser, logout } = useAppContext();

  // Read ?section= query param to allow deep-linking from profile page
  const initialSection = new URLSearchParams(window.location.search).get("section");
  const [activeSection, setActiveSection] = useState<string | null>(initialSection);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  if (!currentUser) {
    setLocation("/login");
    return null;
  }

  const sections: SettingsSection[] = [
    {
      id: "mission",
      title: "Niakofa Mission",
      icon: HeartHandshake,
      component: NiaMissionSettings,
      description: "Help Today, Pay It Forward Tomorrow — giving & pledge preferences",
      group: "mission",
    },
    {
      id: "appearance",
      title: "Appearance",
      icon: Sun,
      component: AppearanceSettings,
      description: "Switch between dark navy and light mode",
      group: "account",
    },
    {
      id: "notifications",
      title: "Notification Preferences",
      icon: Bell,
      component: NotificationPreferences,
      description: "Nearby requests, alerts & pledge reminders",
      group: "account",
    },
    {
      id: "privacy",
      title: "Account Privacy",
      icon: Lock,
      component: AccountPrivacy,
      description: "Profile visibility, live location & activity",
      group: "account",
    },
    {
      id: "change-password",
      title: "Change Password",
      icon: KeyRound,
      component: ChangePassword,
      description: "Update your account password",
      group: "account",
    },
    {
      id: "spirit-animal",
      title: "Spirit Animal",
      icon: PawPrint,
      component: SpiritAnimalSettings,
      description: "Choose your map companion",
      group: "diaspora",
    },
    {
      id: "language",
      title: "Language / Idioma",
      icon: Globe,
      component: LanguageSwitcher,
      description: "App language & Nia's response language",
      group: "diaspora",
    },
    {
      id: "nia-voice",
      title: "Nia's Voice",
      icon: Mic,
      component: NiaVoiceSettings,
      description: "Choose how Nia speaks to you",
      group: "diaspora",
    },
    {
      id: "delete-account",
      title: "Delete Account",
      icon: Trash2,
      component: null,
      description: "Permanently remove your account and data",
      group: "account",
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
        group: "helper",
      },
      {
        id: "payout-setup",
        title: "Payout Setup",
        icon: CreditCard,
        component: PayoutSetup,
        description: "Connect Stripe to receive payments",
        group: "helper",
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

      {/* Body — combined calc() keeps last card clear of nav + notch on all devices */}
      <div className="flex-1 overflow-y-auto p-4 max-w-lg mx-auto w-full" style={{ paddingBottom: "calc(7rem + env(safe-area-inset-bottom))" }}>
        {!activeSection ? (
          /* Section list — grouped under category headers, full-height
             tappable cards with descriptions within each group */
          <div className="space-y-5 pt-2">
            {(["mission", "account", "diaspora", "helper"] as const).map((group) => {
              const groupSections = sections.filter((s) => s.group === group);
              if (groupSections.length === 0) return null;
              return (
                <div key={group} className="space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">
                    {GROUP_LABELS[group]}
                  </div>
                  {groupSections.map((section) => {
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
                    Your profile and personal settings will be removed from
                    active use, push subscriptions will be deleted, scheduled
                    payments will be cancelled, and your account will be
                    anonymized before its scheduled purge. Required community
                    and financial history may be retained in anonymous form.
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
                <label className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4 text-sm">
                  <input
                    type="checkbox"
                    checked={deleteConfirmed}
                    onChange={(event) => setDeleteConfirmed(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-destructive"
                  />
                  <span>I understand that this signs me out immediately and permanently removes my personal account access.</span>
                </label>
                <Button
                  variant="destructive"
                  className="w-full h-12 text-sm font-bold"
                  disabled={!deleteConfirmed || deletingAccount}
                  onClick={async () => {
                    if (!deleteConfirmed || deletingAccount) return;
                    setDeletingAccount(true);
                    try {
                      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
                      const response = await fetch(`${base}/api/users/me`, {
                        method: "DELETE",
                        headers: { ...authHeaders() },
                      });
                      const payload = await response.json().catch(() => ({})) as { error?: string };
                      if (!response.ok) {
                        toast({
                          title: response.status === 409 ? "Deletion needs support" : "Could not delete account",
                          description: payload.error ?? "Please try again.",
                          variant: "destructive",
                        });
                        return;
                      }
                      toast({ title: "Account deleted", description: "You have been signed out." });
                      logout();
                    } catch {
                      toast({
                        title: "Could not delete account",
                        description: "Check your connection and try again.",
                        variant: "destructive",
                      });
                    } finally {
                      setDeletingAccount(false);
                    }
                  }}
                >
                  {deletingAccount ? "Deleting…" : "Delete My Account"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
