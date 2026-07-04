import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart, Mail, User, Lock, Eye, EyeOff, Loader2, MapPin, Shield,
  KeyRound, CheckCircle2, ChevronDown, ChevronUp, Globe, Car, Wrench,
  Clock, AlertCircle, Sparkles, MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/lib/AppContext";
import type { User as AppUser } from "@workspace/api-client-react";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";

// VITE_GOOGLE_CLIENT_ID must be set to enable Google Sign-In.
// If unset (empty string), the Google button is hidden and email+password is the only option.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

type ApiAuthResponse = Partial<AppUser> & {
  error?: string;
  error_code?: string;
  user_id?: number;
  user_email?: string;
  user_name?: string;
  token?: string;
  user?: AppUser;
};
import { setToken } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

type Mode = "login" | "register";

// ── Helper profile constants ──────────────────────────────────────────────────

const HELPER_SKILLS = [
  { id: "plumbing",         label: "Plumbing",         emoji: "🔧" },
  { id: "electrical",       label: "Electrical",        emoji: "⚡" },
  { id: "carpentry",        label: "Carpentry",         emoji: "🪚" },
  { id: "painting",         label: "Painting",          emoji: "🖌️" },
  { id: "yard_work",        label: "Yard Work",         emoji: "🌿" },
  { id: "heavy_lifting",    label: "Heavy Lifting",     emoji: "💪" },
  { id: "drives_truck",     label: "Drives Truck",      emoji: "🚛" },
  { id: "cdl_driver",       label: "CDL Driver",        emoji: "🚚" },
  { id: "grocery_shopping", label: "Grocery Shopping",  emoji: "🛒" },
  { id: "cooking",          label: "Cooking",           emoji: "🍳" },
  { id: "childcare",        label: "Childcare",         emoji: "👶" },
  { id: "elder_care",       label: "Elder Care",        emoji: "🧓" },
  { id: "medical_support",  label: "Medical Support",   emoji: "💊" },
  { id: "tech_support",     label: "Tech Support",      emoji: "💻" },
  { id: "tutoring",         label: "Tutoring",          emoji: "📚" },
  { id: "translation",      label: "Translation",       emoji: "🌍" },
  { id: "pet_care",         label: "Pet Care",          emoji: "🐾" },
  { id: "food_delivery",    label: "Food Delivery",     emoji: "🍔" },
  { id: "event_setup",      label: "Event Setup",       emoji: "🎪" },
  { id: "emergency_first_aid", label: "First Aid",     emoji: "🚑" },
];

const HELPER_LANGUAGES = [
  "English", "Spanish", "Vietnamese", "Arabic", "Somali", "Swahili",
  "French", "Mandarin", "Hindi", "Urdu", "Tagalog", "Portuguese",
  "Amharic", "Korean", "Japanese", "Russian",
];

const HELPER_QUALIFICATIONS = [
  "Background check completed",
  "CPR/First Aid certified",
  "Licensed contractor",
  "Licensed electrician",
  "Licensed plumber",
  "Certified EMT/Paramedic",
  "Certified teacher/tutor",
  "Food handler certified",
  "Commercial driver (CDL)",
  "Professional caregiver",
  "Fluent bilingual",
  "Military/Veteran",
  "Community volunteer experience",
  "Social work background",
];

const VEHICLE_OPTIONS = [
  { id: "car",        label: "Has a car",        emoji: "🚗" },
  { id: "truck",      label: "Drives a truck",   emoji: "🛻" },
  { id: "van",        label: "Has a van/SUV",    emoji: "🚐" },
  { id: "motorcycle", label: "Motorcycle",       emoji: "🏍️" },
  { id: "bicycle",    label: "Bicycle/E-bike",   emoji: "🚲" },
  { id: "none",       label: "No vehicle",       emoji: "🚶" },
];

// ── Helper signup form ─────────────────────────────────────────────────────────

function HelperProfileForm({
  selectedSkills, setSelectedSkills,
  selectedLanguages, setSelectedLanguages,
  selectedQuals, setSelectedQuals,
  vehicle, setVehicle,
  bio, setBio,
  socialLinks, setSocialLinks,
}: {
  selectedSkills: string[];
  setSelectedSkills: (s: string[]) => void;
  selectedLanguages: string[];
  setSelectedLanguages: (l: string[]) => void;
  selectedQuals: string[];
  setSelectedQuals: (q: string[]) => void;
  vehicle: string;
  setVehicle: (v: string) => void;
  bio: string;
  setBio: (b: string) => void;
  socialLinks: string;
  setSocialLinks: (s: string) => void;
}) {
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [showQuals, setShowQuals] = useState(false);

  const toggleSkill = (id: string) => {
    setSelectedSkills(
      selectedSkills.includes(id)
        ? selectedSkills.filter(s => s !== id)
        : [...selectedSkills, id]
    );
  };

  const toggleLanguage = (lang: string) => {
    setSelectedLanguages(
      selectedLanguages.includes(lang)
        ? selectedLanguages.filter(l => l !== lang)
        : [...selectedLanguages, lang]
    );
  };

  const toggleQual = (q: string) => {
    setSelectedQuals(
      selectedQuals.includes(q)
        ? selectedQuals.filter(x => x !== q)
        : [...selectedQuals, q]
    );
  };

  const visibleSkills = showAllSkills ? HELPER_SKILLS : HELPER_SKILLS.slice(0, 10);

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="overflow-hidden"
    >
      <div className="space-y-4 pt-2 pb-1">
        {/* Skills */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Wrench className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-black uppercase tracking-wider text-foreground">
              Skills & Specialties <span className="text-destructive">*</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {visibleSkills.map(skill => (
              <button
                key={skill.id}
                type="button"
                onClick={() => toggleSkill(skill.id)}
                className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border font-bold transition-all ${
                  selectedSkills.includes(skill.id)
                    ? "bg-primary/20 border-primary text-primary"
                    : "bg-card border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                <span>{skill.emoji}</span>
                <span>{skill.label}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowAllSkills(p => !p)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border border-dashed border-border text-muted-foreground hover:border-primary/40 transition-all"
            >
              {showAllSkills ? <><ChevronUp className="w-3 h-3" /> Less</> : <><ChevronDown className="w-3 h-3" /> More skills</>}
            </button>
          </div>
          {selectedSkills.length > 0 && (
            <p className="text-[10px] text-primary mt-1.5">{selectedSkills.length} skill{selectedSkills.length !== 1 ? "s" : ""} selected</p>
          )}
        </div>

        {/* Languages */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Globe className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-black uppercase tracking-wider text-foreground">Languages Spoken</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {HELPER_LANGUAGES.map(lang => (
              <button
                key={lang}
                type="button"
                onClick={() => toggleLanguage(lang)}
                className={`text-xs px-2.5 py-1.5 rounded-full border font-bold transition-all ${
                  selectedLanguages.includes(lang)
                    ? "bg-primary/20 border-primary text-primary"
                    : "bg-card border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>

        {/* Vehicle */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Car className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-black uppercase tracking-wider text-foreground">Transportation</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {VEHICLE_OPTIONS.map(v => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVehicle(vehicle === v.id ? "" : v.id)}
                className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border font-bold transition-all ${
                  vehicle === v.id
                    ? "bg-primary/20 border-primary text-primary"
                    : "bg-card border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                <span>{v.emoji}</span>
                <span>{v.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Qualifications */}
        <div>
          <button
            type="button"
            onClick={() => setShowQuals(p => !p)}
            className="flex items-center gap-1.5 mb-2 text-xs font-black uppercase tracking-wider text-foreground w-full text-left"
          >
            <Shield className="w-3.5 h-3.5 text-primary" />
            <span>Certifications &amp; Qualifications</span>
            <span className="ml-auto">{showQuals ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</span>
          </button>
          {showQuals && (
            <div className="space-y-2 bg-muted/30 rounded-xl p-3 border border-border">
              {HELPER_QUALIFICATIONS.map(q => (
                <label key={q} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedQuals.includes(q)}
                    onChange={() => toggleQual(q)}
                    className="accent-primary w-3.5 h-3.5 shrink-0"
                  />
                  <span className="text-xs text-muted-foreground">{q}</span>
                </label>
              ))}
            </div>
          )}
          {selectedQuals.length > 0 && (
            <p className="text-[10px] text-primary mt-1.5">{selectedQuals.length} qualification{selectedQuals.length !== 1 ? "s" : ""} selected</p>
          )}
        </div>

        {/* Bio */}
        <div>
          <div className="text-xs font-black uppercase tracking-wider text-foreground mb-1.5">About You (optional)</div>
          <textarea
            placeholder="Tell the community about yourself, why you want to help, and what makes you a great helper…"
            value={bio}
            onChange={e => setBio(e.target.value)}
            rows={3}
            maxLength={500}
            className="w-full bg-card border border-border rounded-2xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground resize-none"
          />
          <div className="text-[10px] text-muted-foreground mt-0.5 text-right">{bio.length}/500</div>
        </div>

        {/* Social links */}
        <div>
          <div className="text-xs font-black uppercase tracking-wider text-foreground mb-1.5">Social Media (optional)</div>
          <input
            type="text"
            placeholder="@instagram, Facebook profile, LinkedIn…"
            value={socialLinks}
            onChange={e => setSocialLinks(e.target.value)}
            className="w-full bg-card border border-border rounded-2xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground"
          />
        </div>

        {/* Pending notice */}
        <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3">
          <Clock className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-400 leading-relaxed">
            Your helper account will be <strong>held for admin review</strong> before you can accept requests. You'll be notified once approved.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main login screen ──────────────────────────────────────────────────────────

export default function LoginScreen() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { setCurrentUser } = useAppContext();
  const [mode, setMode] = useState<Mode>("login");
  // Reset ToS acceptance when switching between login and register modes so
  // a user can't accidentally carry over a stale checkbox state.
  const handleModeSwitch = (m: Mode) => {
    setMode(m);
    if (m === "login") setTosAccepted(false);
  };

  // ENH-003: show a clear message when we landed here because a 401
  // bounced the user out of an expired session, instead of leaving them
  // wondering why they were suddenly logged out.
  useEffect(() => {
    if (sessionStorage.getItem("niakofa_session_expired")) {
      sessionStorage.removeItem("niakofa_session_expired");
      toast({
        title: "Session expired",
        description: "Please sign in again to continue.",
        variant: "destructive",
      });
    }
  }, []);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [isHelper, setIsHelper] = useState(false);
  const [accountType, setAccountType] = useState<"individual" | "business" | "sponsor">("individual");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationDescription, setOrganizationDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Helper profile state
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [selectedQuals, setSelectedQuals] = useState<string[]>([]);
  const [vehicle, setVehicle] = useState("");
  const [bio, setBio] = useState("");
  const [socialLinks, setSocialLinks] = useState("");

  // Terms of service acceptance (required for registration)
  const [tosAccepted, setTosAccepted] = useState(false);
  const [showTosModal, setShowTosModal] = useState<"tos" | "privacy" | null>(null);

  // Password strength computation
  const getPasswordStrength = (pw: string): { level: 0 | 1 | 2 | 3 | 4; label: string; color: string } => {
    if (!pw) return { level: 0, label: "", color: "" };
    const hasUpper = /[A-Z]/.test(pw);
    const hasLower = /[a-z]/.test(pw);
    const hasNum = /[0-9]/.test(pw);
    const hasSpecial = /[^A-Za-z0-9]/.test(pw);
    const variety = [hasUpper, hasLower, hasNum, hasSpecial].filter(Boolean).length;
    if (pw.length < 8) return { level: 1, label: "Too short", color: "bg-red-500" };
    if (pw.length >= 8 && variety <= 1) return { level: 2, label: "Weak", color: "bg-orange-500" };
    if (pw.length >= 8 && variety === 2) return { level: 3, label: "Fair", color: "bg-yellow-400" };
    if (pw.length >= 10 && variety >= 3) return { level: 4, label: "Strong", color: "bg-green-500" };
    return { level: 3, label: "Fair", color: "bg-yellow-400" };
  };

  // Legacy account set-password flow
  const [pendingLegacyUser, setPendingLegacyUser] = useState<{ id: number; email: string; name: string } | null>(null);
  const [resetCode, setResetCode] = useState("");
  const [codeSentMessage, setCodeSentMessage] = useState("");
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [forgotStep, setForgotStep] = useState<"email" | "code">("email");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
  const [forgotSaving, setForgotSaving] = useState(false);
  const [forgotPasswordSaved, setForgotPasswordSaved] = useState(false);
  const [showForgotNewPass, setShowForgotNewPass] = useState(false);
  const [showForgotConfirmPass, setShowForgotConfirmPass] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Nia cultural greetings rotation
  const CULTURAL_GREETINGS = [
    { text: "Sawubona", sub: "I see you — we see each other", lang: "isiZulu" },
    { text: "Salaam", sub: "Peace be upon you", lang: "Arabic" },
    { text: "Shalom", sub: "Peace and wholeness", lang: "Hebrew" },
    { text: "Namaste", sub: "The divine in me greets the divine in you", lang: "Sanskrit" },
    { text: "As-Salaam-Alaikum", sub: "Peace be unto you", lang: "Swahili" },
    { text: "Aloha", sub: "Love, peace, compassion", lang: "Hawaiian" },
  ];

  const [greetingIndex, setGreetingIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setGreetingIndex(i => (i + 1) % CULTURAL_GREETINGS.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const currentGreeting = CULTURAL_GREETINGS[greetingIndex];

  const handleSubmit = async () => {
    if (!email.trim()) return;
    if (mode === "register" && !name.trim()) return;
    if (mode === "register" && isHelper && selectedSkills.length === 0) {
      toast({ title: "Please select at least one skill", variant: "destructive" });
      return;
    }
    if (mode === "register" && (accountType === "business" || accountType === "sponsor") && !organizationName.trim()) {
      toast({ title: `Please enter your ${accountType} name`, variant: "destructive" });
      return;
    }
    if (mode === "register" && password.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    if (mode === "register" && !tosAccepted) {
      toast({ title: "Please accept the Terms of Service to continue", variant: "destructive" });
      return;
    }
    setLoading(true);

    try {
      if (mode === "register") {
        const res = await fetch("/api/users/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            password,
            tos_accepted: tosAccepted,   // required by server — must be explicitly true
            is_helper: false,
            account_type: accountType,
            organization_name: organizationName.trim() || undefined,
            organization_description: organizationDescription.trim() || undefined,
          }),
        });
        const data = await res.json().catch(() => ({})) as ApiAuthResponse;
        if (!res.ok) {
          const msgKey = data.error === "Email already registered" ? "auth.email_taken" : null;
          throw new Error(msgKey ? t(msgKey) : (data.error ?? "Registration failed"));
        }

        if (!data.user) throw new Error("Registration failed");
        const user = data.user;
        if (data.token) setToken(data.token);

        // If they want to be a helper, submit their profile application
        if (isHelper && selectedSkills.length > 0) {
          try {
            const appRes = await fetch(`/api/users/${user.id}/helper-application`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${data.token}`,
              },
              body: JSON.stringify({
                helper_skills: selectedSkills,
                helper_languages: selectedLanguages,
                helper_qualifications: selectedQuals,
                helper_bio: bio.trim() || undefined,
                helper_vehicle: vehicle || undefined,
                helper_social_links: socialLinks.trim() || undefined,
              }),
            });
            if (appRes.ok) {
              const updatedUser = await appRes.json();
              setCurrentUser(updatedUser);
              localStorage.setItem("niakofa_user", JSON.stringify(updatedUser));
              toast({ title: `Welcome, ${user.name}! 💙`, description: "Your helper application is pending admin review." });
            } else {
              setCurrentUser(user);
              localStorage.setItem("niakofa_user", JSON.stringify(user));
              toast({ title: `Welcome to Niakofa, ${user.name}! 💙` });
            }
          } catch {
            setCurrentUser(user);
            localStorage.setItem("niakofa_user", JSON.stringify(user));
            toast({ title: `Welcome to Niakofa, ${user.name}! 💙` });
          }
        } else {
          setCurrentUser(user);
          localStorage.setItem("niakofa_user", JSON.stringify(user));
          const welcomeDesc =
            accountType === "business"
              ? "Your business account is pending admin review."
              : accountType === "sponsor"
                ? "Your sponsor account is pending admin review."
                : undefined;
          toast({ title: `Welcome to Niakofa, ${user.name}! 💙`, description: welcomeDesc });
        }

        const onboarded = localStorage.getItem("niakofa_onboarded");
        setLocation(onboarded ? "/" : "/onboarding");
      } else {
        const res = await fetch("/api/users/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), password }),
        });
        const data = await res.json().catch(() => ({})) as ApiAuthResponse;

        // Google-only account trying email+password — guide them back to Google button
        if (!res.ok && res.status === 403 && data.error_code === "GOOGLE_ACCOUNT_USE_OAUTH") {
          toast({
            title: "Please use Google Sign-In",
            description: GOOGLE_CLIENT_ID
              ? "This account was created with Google. Use the \"Continue with Google\" button above."
              : "This account requires Google Sign-In, which isn't configured here yet.",
            variant: "destructive",
          });
          return;
        }

        if (!res.ok && res.status === 403 && data.error_code === "LEGACY_PASSWORD_REQUIRED" && data.user_id && data.user_email && data.user_name) {
          setPendingLegacyUser({ id: data.user_id, email: data.user_email, name: data.user_name });
          // Fire the emailed verification code immediately — no extra tap needed
          fetch("/api/users/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: data.user_email }),
          }).then(() => setCodeSentMessage(`We sent a 6-digit code to ${data.user_email}`))
            .catch(() => setCodeSentMessage("Enter the 6-digit code sent to your email"));
          return;
        }

        if (!res.ok) {
          const msgKey =
            data.error === "Incorrect password" ? "auth.wrong_password" :
            data.error === "No account found with that email" ? "auth.no_account" : null;
          throw new Error(msgKey ? t(msgKey) : (data.error ?? t("common.error")));
        }

        if (!data.user) throw new Error(t("common.error"));
        const user = data.user;
        if (data.token) setToken(data.token);
        setCurrentUser(user);
        localStorage.setItem("niakofa_user", JSON.stringify(user));
        toast({ title: `Welcome back, ${user.name}!` });
        setLocation("/");
      }
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : t("common.error"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async () => {
    if (!pendingLegacyUser) return;
    if (newPassword.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (resetCode.trim().length !== 6) {
      toast({ title: "Enter the 6-digit code sent to your email", variant: "destructive" });
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch("/api/users/set-initial-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: pendingLegacyUser.id,
          email: pendingLegacyUser.email,
          code: resetCode.trim(),
          new_password: newPassword,
        }),
      });
      const data = await res.json().catch(() => ({})) as ApiAuthResponse;
      if (!res.ok || !data.user) throw new Error(data.error ?? "Failed to save password");
      if (data.token) setToken(data.token);
      setCurrentUser(data.user);
      localStorage.setItem("niakofa_user", JSON.stringify(data.user));
      setPasswordSaved(true);
      setTimeout(() => {
        toast({ title: "Password set — welcome, " + pendingLegacyUser.name + "!" });
        setLocation("/");
      }, 1400);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : t("common.error"), variant: "destructive" });
    } finally {
      setSavingPassword(false);
    }
  };

  // ── Google Sign-In handler ────────────────────────────────────────────────────
  // Called by GoogleLogin's onSuccess with the ID token string.
  // Sends the token to /api/auth/google which verifies it server-side,
  // then finds / creates / links the Niakofa account and returns a JWT.
  const handleGoogleSuccess = async (credential: string) => {
    setGoogleLoading(true);
    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: credential }),
      });
      const data = await res.json().catch(() => ({})) as {
        user?: AppUser;
        token?: string;
        created?: boolean;
        linked?: boolean;
        error?: string;
        error_code?: string;
      };

      if (!res.ok) {
        if (data.error_code === "GOOGLE_NOT_CONFIGURED") {
          toast({ title: "Google Sign-In is not set up yet", description: "Please use email + password for now.", variant: "destructive" });
        } else if (data.error_code === "ACCOUNT_SUSPENDED") {
          toast({ title: "Account suspended", description: "Please contact support@niakofa.app.", variant: "destructive" });
        } else {
          toast({ title: data.error ?? "Google sign-in failed. Please try again.", variant: "destructive" });
        }
        return;
      }

      if (!data.user || !data.token) throw new Error("Sign-in failed — please try again.");

      setToken(data.token);
      setCurrentUser(data.user);
      localStorage.setItem("niakofa_user", JSON.stringify(data.user));

      if (data.linked) {
        toast({
          title: "Google account linked! 🔗",
          description: "You can now sign in with Google or your existing email + password.",
        });
      } else if (data.created) {
        toast({ title: `Welcome to Niakofa, ${data.user.name}! 💙`, description: "Account created with Google." });
      } else {
        toast({ title: `Welcome back, ${data.user.name}!` });
      }

      // If joining as helper with skills filled in, submit the helper application now
      if (data.created && mode === "register" && isHelper && selectedSkills.length > 0) {
        try {
          await fetch(`/api/users/${data.user.id}/helper-application`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${data.token}`,
            },
            body: JSON.stringify({
              helper_skills: selectedSkills,
              helper_languages: selectedLanguages,
              helper_qualifications: selectedQuals,
              helper_bio: bio.trim() || undefined,
              helper_vehicle: vehicle || undefined,
              helper_social_links: socialLinks.trim() || undefined,
            }),
          });
          toast({ title: "Helper application submitted!", description: "Pending admin review." });
        } catch {
          /* non-blocking — account is already created */
        }
      }

      const onboarded = localStorage.getItem("niakofa_onboarded");
      setLocation(data.created && !onboarded ? "/onboarding" : "/");
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Google sign-in failed",
        variant: "destructive",
      });
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleRequestForgotCode = async () => {
    if (!forgotEmail.trim()) return;
    setForgotSaving(true);
    try {
      await fetch("/api/users/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      setForgotStep("code");
      toast({ title: "If that email has an account, a code has been sent." });
    } catch {
      toast({ title: t("common.error"), variant: "destructive" });
    } finally {
      setForgotSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (forgotCode.trim().length !== 6) {
      toast({ title: "Enter the 6-digit code sent to your email", variant: "destructive" });
      return;
    }
    if (forgotNewPassword.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setForgotSaving(true);
    try {
      const res = await fetch("/api/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: forgotEmail.trim(),
          code: forgotCode.trim(),
          new_password: forgotNewPassword,
        }),
      });
      const data = await res.json().catch(() => ({})) as ApiAuthResponse;
      if (!res.ok || !data.user) throw new Error(data.error ?? "Failed to reset password");
      if (data.token) setToken(data.token);
      setCurrentUser(data.user);
      localStorage.setItem("niakofa_user", JSON.stringify(data.user));
      setForgotPasswordSaved(true);
      const resetUserName = data.user.name;
      setTimeout(() => {
        toast({ title: `Welcome back, ${resetUserName}!` });
        setLocation("/");
      }, 1400);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : t("common.error"), variant: "destructive" });
    } finally {
      setForgotSaving(false);
    }
  };

  // ── Forgot Password screen ───────────────────────────────────────────────────
  if (forgotPasswordMode) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="w-full max-w-sm"
          >
            <div className="flex flex-col items-center mb-8">
              <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center mb-4 shadow-[0_0_40px_rgba(0,212,255,0.15)]">
                <KeyRound className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-black tracking-tight text-foreground">Reset Password</h2>
              <p className="text-sm text-muted-foreground mt-2 text-center leading-relaxed">
                {forgotStep === "email"
                  ? "Enter your email and we'll send you a code."
                  : `Enter the code sent to ${forgotEmail}`}
              </p>
            </div>
            <AnimatePresence mode="wait">
              {forgotPasswordSaved ? (
                <motion.div key="saved" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-3 py-8 text-center">
                  <CheckCircle2 className="w-14 h-14 text-green-400" />
                  <div className="font-black text-lg text-foreground">Password reset!</div>
                  <div className="text-sm text-muted-foreground">Taking you to the app…</div>
                </motion.div>
              ) : forgotStep === "email" ? (
                <motion.div key="email-step" className="space-y-3">
                  <div className="relative">
                    <input
                      type="email"
                      placeholder="Email address"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleRequestForgotCode()}
                      className="w-full bg-card border border-border rounded-2xl px-4 py-3.5 text-sm outline-none focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground"
                      autoComplete="email"
                    />
                  </div>
                  <Button className="w-full h-13 font-black text-base mt-2" onClick={handleRequestForgotCode} disabled={forgotSaving || !forgotEmail.trim()}>
                    {forgotSaving ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Sending…</span> : "Send Code"}
                  </Button>
                  <button onClick={() => setForgotPasswordMode(false)} className="w-full text-center text-xs text-muted-foreground active:text-foreground transition-colors py-2">
                    Back to sign in
                  </button>
                </motion.div>
              ) : (
                <motion.div key="code-step" className="space-y-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6-digit code"
                    value={forgotCode}
                    onChange={e => setForgotCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-full bg-card border border-border rounded-2xl px-4 py-3.5 text-sm outline-none focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground tracking-widest"
                    autoComplete="one-time-code"
                  />
                  <div className="relative">
                    <input
                      type={showForgotNewPass ? "text" : "password"}
                      placeholder="New password (min 8 characters)"
                      value={forgotNewPassword}
                      onChange={e => setForgotNewPassword(e.target.value)}
                      className="w-full bg-card border border-border rounded-2xl px-4 py-3.5 pr-11 text-sm outline-none focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground"
                      autoComplete="new-password"
                    />
                    <button type="button" onClick={() => setShowForgotNewPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                      {showForgotNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showForgotConfirmPass ? "text" : "password"}
                      placeholder="Confirm password"
                      value={forgotConfirmPassword}
                      onChange={e => setForgotConfirmPassword(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleResetPassword()}
                      className="w-full bg-card border border-border rounded-2xl px-4 py-3.5 pr-11 text-sm outline-none focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground"
                      autoComplete="new-password"
                    />
                    <button type="button" onClick={() => setShowForgotConfirmPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                      {showForgotConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <Button className="w-full h-13 font-black text-base mt-2" onClick={handleResetPassword} disabled={forgotSaving || forgotCode.length !== 6 || forgotNewPassword.length < 8 || forgotNewPassword !== forgotConfirmPassword}>
                    {forgotSaving ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Saving…</span> : "Reset Password"}
                  </Button>
                  {/* BUG-020: "Resend code" must actually call the forgot-password API —
                      previously it only reset UI state without sending a new code.
                      Now it re-runs handleRequestForgotCode which POSTs to the endpoint
                      (which also deletes any prior unused code) and moves back to code step. */}
                  <button
                    onClick={handleRequestForgotCode}
                    disabled={forgotSaving || !forgotEmail.trim()}
                    className="w-full text-center text-xs text-primary active:text-primary/70 transition-colors py-1 disabled:opacity-50"
                  >
                    Resend code
                  </button>
                  <button onClick={() => setForgotPasswordMode(false)} className="w-full text-center text-xs text-muted-foreground active:text-foreground transition-colors py-2">
                    Back to sign in
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    );
  }

  // ── Legacy account "Set Password" screen ────────────────────────────────────
  if (pendingLegacyUser) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="w-full max-w-sm"
          >
            <div className="flex flex-col items-center mb-8">
              <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center mb-4 shadow-[0_0_40px_rgba(0,212,255,0.15)]">
                <KeyRound className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-black tracking-tight text-foreground">{t("auth.set_password")}</h2>
              <p className="text-sm text-muted-foreground mt-2 text-center leading-relaxed">{t("auth.password_setup_prompt")}</p>
            </div>
            <AnimatePresence mode="wait">
              {passwordSaved ? (
                <motion.div key="saved" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-3 py-8 text-center">
                  <CheckCircle2 className="w-14 h-14 text-green-400" />
                  <div className="font-black text-lg text-foreground">Password saved!</div>
                  <div className="text-sm text-muted-foreground">Taking you to the app…</div>
                </motion.div>
              ) : (
                <motion.div key="form" className="space-y-3">
                  {codeSentMessage && (
                    <p className="text-xs text-muted-foreground text-center px-1 mb-1">{codeSentMessage}</p>
                  )}
                  <div className="relative">
                    <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="6-digit code from your email"
                      value={resetCode}
                      onChange={e => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="w-full bg-card border border-border rounded-2xl pl-11 pr-4 py-3.5 text-sm outline-none focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground tracking-widest"
                      autoComplete="one-time-code"
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type={showNewPass ? "text" : "password"}
                      placeholder="New password (min 8 characters)"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full bg-card border border-border rounded-2xl pl-11 pr-12 py-3.5 text-sm outline-none focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground"
                      autoComplete="new-password"
                    />
                    <button onClick={() => setShowNewPass(p => !p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground active:text-foreground transition-colors">
                      {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="password"
                      placeholder="Confirm password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleSetPassword()}
                      className="w-full bg-card border border-border rounded-2xl pl-11 pr-4 py-3.5 text-sm outline-none focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground"
                      autoComplete="new-password"
                    />
                  </div>
                  {newPassword.length > 0 && confirmPassword.length > 0 && newPassword !== confirmPassword && (
                    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-destructive px-1">
                      Passwords do not match
                    </motion.p>
                  )}
                  <Button className="w-full h-13 font-black text-base mt-2" onClick={handleSetPassword} disabled={savingPassword || resetCode.length !== 6 || newPassword.length < 8 || newPassword !== confirmPassword}>
                    {savingPassword ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Saving…</span> : t("auth.set_password")}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
        <div className="px-6 pb-safe pb-6 text-center">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <Shield className="w-3 h-3" />
            No tracking, no ads, community-owned
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-12 pb-8">
        {/* ── NiaOrb Hero Element ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="flex flex-col items-center mb-6"
        >
          {/* NiaOrb — pulsing animated orb */}
          <div className="relative mb-4">
            <motion.div
              animate={{
                scale: [1, 1.08, 1],
                opacity: [0.7, 1, 0.7],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-600 blur-md absolute inset-0"
            />
            <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-600 flex items-center justify-center shadow-[0_0_60px_rgba(0,150,255,0.4)] border border-white/20">
              <Sparkles className="w-10 h-10 text-white drop-shadow-lg" />
            </div>
            {/* Orbiting dots */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0"
            >
              <div className="w-2 h-2 rounded-full bg-cyan-300 absolute -top-1 left-1/2 -translate-x-1/2 shadow-[0_0_8px_rgba(0,255,255,0.8)]" />
            </motion.div>
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
              className="absolute inset-[-8px]"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-purple-300 absolute bottom-0 left-1/4 shadow-[0_0_6px_rgba(200,100,255,0.8)]" />
            </motion.div>
          </div>

          {/* Animated greeting */}
          <AnimatePresence mode="wait">
            <motion.div
              key={greetingIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.5 }}
              className="text-center"
            >
              <h1 className="text-2xl font-black tracking-tight text-foreground">
                {currentGreeting.text}
                <span className="text-primary"> — I see you</span>
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                {currentGreeting.sub} · <span className="text-primary/70">{currentGreeting.lang}</span>
              </p>
            </motion.div>
          </AnimatePresence>

          <p className="text-sm text-muted-foreground mt-2 text-center max-w-xs">
            Help Today. Pay It Forward Tomorrow.
          </p>
        </motion.div>

        {/* Mode toggle */}
        <div className="flex bg-muted rounded-2xl p-1 mb-5 w-full max-w-sm">
          {(["login", "register"] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => handleModeSwitch(m)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider transition-all ${
                mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {m === "login" ? "Sign In" : "Join"}
            </button>
          ))}
        </div>

        <div className="w-full max-w-sm space-y-3">

          {/* ── Google Sign-In ──────────────────────────────────────────────────
               Only rendered when VITE_GOOGLE_CLIENT_ID is configured.
               GoogleOAuthProvider is scoped here so it doesn't affect unrelated
               parts of the app. The official Google button is rendered inside
               an iframe managed by Google's Identity Services script — this is
               required by Google's security model and guarantees the button's
               click handler is never tampered with by the hosting page.
          ──────────────────────────────────────────────────────────────────── */}
          {GOOGLE_CLIENT_ID && (
            <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
              <div className="w-full flex flex-col gap-3">
                <div className="w-full flex justify-center">
                  {googleLoading ? (
                    <div className="w-full h-11 bg-card border border-border rounded-2xl flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Signing in with Google…</span>
                    </div>
                  ) : (
                    <GoogleLogin
                      onSuccess={(r) => {
                        if (r.credential) handleGoogleSuccess(r.credential);
                        else toast({ title: "Google sign-in failed — no credential returned.", variant: "destructive" });
                      }}
                      onError={() =>
                        toast({ title: "Google sign-in was cancelled or failed. Please try again.", variant: "destructive" })
                      }
                      theme="outline"
                      size="large"
                      width="352"
                      text={mode === "login" ? "signin_with" : "signup_with"}
                      shape="rectangular"
                      logo_alignment="left"
                      useOneTap={false}
                    />
                  )}
                </div>
                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border/60" />
                  <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">or continue with email</span>
                  <div className="h-px flex-1 bg-border/60" />
                </div>
              </div>
            </GoogleOAuthProvider>
          )}

          <AnimatePresence mode="wait">
            {mode === "register" && (
              <motion.div key="name" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-card border border-border rounded-2xl pl-11 pr-4 py-3.5 text-sm outline-none focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground"
                    autoComplete="name"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {mode === "register" && (
              <motion.div key="account-type" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {(["individual", "business", "sponsor"] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setAccountType(t)}
                        className={`py-2.5 rounded-xl border-2 text-xs font-black capitalize transition-all ${
                          accountType === t ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {(accountType === "business" || accountType === "sponsor") && (
                    <div className="space-y-3">
                      <input
                        type="text"
                        placeholder={accountType === "business" ? "Business name" : "Organization name"}
                        value={organizationName}
                        onChange={e => setOrganizationName(e.target.value)}
                        className="w-full bg-card border border-border rounded-2xl px-4 py-3.5 text-sm outline-none focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground"
                      />
                      <textarea
                        placeholder={`Tell us about your ${accountType} and how you'd like to support Niakofa`}
                        value={organizationDescription}
                        onChange={e => setOrganizationDescription(e.target.value)}
                        rows={3}
                        className="w-full bg-card border border-border rounded-2xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground resize-none"
                      />
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-card border border-border rounded-2xl pl-11 pr-4 py-3.5 text-sm outline-none focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground"
              autoComplete="email"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type={showPass ? "text" : "password"}
              placeholder={mode === "register" ? "Password (min 8 characters)" : "Password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !isHelper && handleSubmit()}
              className="w-full bg-card border border-border rounded-2xl pl-11 pr-12 py-3.5 text-sm outline-none focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
            <button onClick={() => setShowPass(p => !p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground active:text-foreground transition-colors">
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Password strength meter — only shown during registration */}
          <AnimatePresence>
            {mode === "register" && password.length > 0 && (() => {
              const strength = getPasswordStrength(password);
              return (
                <motion.div
                  key="strength"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden -mt-1"
                >
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3, 4].map(n => (
                      <div
                        key={n}
                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                          n <= strength.level ? strength.color : "bg-muted"
                        }`}
                      />
                    ))}
                  </div>
                  {strength.label && (
                    <p className={`text-[11px] px-1 font-medium ${
                      strength.level <= 2 ? "text-red-400" :
                      strength.level === 3 ? "text-yellow-400" : "text-green-400"
                    }`}>
                      {strength.label} password
                      {strength.level <= 2 && " — try adding numbers or symbols"}
                    </p>
                  )}
                </motion.div>
              );
            })()}
          </AnimatePresence>

          {mode === "login" && (
            <button
              type="button"
              onClick={() => setForgotPasswordMode(true)}
              className="text-xs text-muted-foreground active:text-foreground transition-colors text-right w-full px-1"
            >
              Forgot password?
            </button>
          )}

          {/* Helper toggle + expanded form */}
          <AnimatePresence mode="wait">
            {mode === "register" && (
              <motion.div key="helper-section" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <div className="space-y-3">
                  {/* Toggle */}
                  <button
                    type="button"
                    onClick={() => setIsHelper(p => !p)}
                    className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${
                      isHelper ? "border-primary bg-primary/10" : "border-border bg-card"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isHelper ? "bg-primary/20" : "bg-muted"}`}>
                      <MapPin className={`w-5 h-5 ${isHelper ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-black text-sm ${isHelper ? "text-primary" : "text-foreground"}`}>
                        I want to be a helper
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {isHelper ? "Fill in your skills below to apply" : "Receive requests, earn goodwill & pay"}
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isHelper ? "bg-primary border-primary" : "border-border"}`}>
                      {isHelper && <div className="w-2 h-2 rounded-full bg-primary-foreground" />}
                    </div>
                  </button>

                  {/* Expanded helper profile form */}
                  {isHelper && (
                    <HelperProfileForm
                      selectedSkills={selectedSkills}
                      setSelectedSkills={setSelectedSkills}
                      selectedLanguages={selectedLanguages}
                      setSelectedLanguages={setSelectedLanguages}
                      selectedQuals={selectedQuals}
                      setSelectedQuals={setSelectedQuals}
                      vehicle={vehicle}
                      setVehicle={setVehicle}
                      bio={bio}
                      setBio={setBio}
                      socialLinks={socialLinks}
                      setSocialLinks={setSocialLinks}
                    />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Validation hint */}
          {mode === "register" && isHelper && selectedSkills.length === 0 && (
            <div className="flex items-center gap-2 text-[11px] text-yellow-400">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Select at least one skill to apply as a helper</span>
            </div>
          )}

          {/* Terms of Service — required for all new accounts */}
          <AnimatePresence>
            {mode === "register" && (
              <motion.div
                key="tos"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setTosAccepted(p => !p)}
                  className={`w-full flex items-start gap-3 p-3.5 rounded-2xl border-2 transition-all text-left ${
                    tosAccepted ? "border-primary/50 bg-primary/5" : "border-border bg-card"
                  }`}
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                    tosAccepted ? "bg-primary border-primary" : "border-border bg-background"
                  }`}>
                    {tosAccepted && (
                      <svg className="w-3 h-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    I agree to Niakofa's{" "}
                    <span
                      role="link"
                      tabIndex={0}
                      onClick={e => { e.stopPropagation(); setShowTosModal("tos"); }}
                      onKeyDown={e => e.key === "Enter" && (e.stopPropagation(), setShowTosModal("tos"))}
                      className="text-primary font-semibold underline-offset-2 underline cursor-pointer"
                    >Terms of Service</span>{" "}and{" "}
                    <span
                      role="link"
                      tabIndex={0}
                      onClick={e => { e.stopPropagation(); setShowTosModal("privacy"); }}
                      onKeyDown={e => e.key === "Enter" && (e.stopPropagation(), setShowTosModal("privacy"))}
                      className="text-primary font-semibold underline-offset-2 underline cursor-pointer"
                    >Privacy Policy</span>.
                    {" "}I understand this is a community mutual-aid platform, not a professional service marketplace.
                  </p>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <Button
            className="w-full h-13 font-black text-base mt-2"
            onClick={handleSubmit}
            disabled={
              loading ||
              !email.trim() ||
              (mode === "register" && !name.trim()) ||
              (mode === "register" && password.length < 8) ||
              (mode === "register" && !tosAccepted) ||
              (mode === "register" && isHelper && selectedSkills.length === 0)
            }
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {mode === "login" ? "Signing in…" : "Creating account…"}
              </span>
            ) : (
              mode === "login"
                ? "Sign In"
                : isHelper
                  ? "Apply as Helper"
                  : accountType === "business"
                    ? "Register Business"
                    : accountType === "sponsor"
                      ? "Register as Sponsor"
                      : "Create Account"
            )}
          </Button>
        </div>

        {/* Nia presence indicator */}
        <div className="flex items-center gap-2 mt-4 text-muted-foreground">
          <MessageCircle className="w-3.5 h-3.5 text-primary animate-pulse" />
          <span className="text-xs">Nia is here to help · Ask her anything</span>
        </div>

        <div className="flex items-center gap-2 mt-2 text-muted-foreground">
          <Shield className="w-3.5 h-3.5" />
          <span className="text-xs">No tracking, no ads, community-owned</span>
        </div>
      </div>

      <div className="px-6 pb-safe pb-6 text-center">
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
          <MapPin className="w-3 h-3" />
          Global mutual aid · Building community one act of kindness at a time
        </p>
      </div>

      {/* ── ToS / Privacy modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showTosModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
              onClick={() => setShowTosModal(null)}
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 220 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-3xl flex flex-col"
              style={{ maxHeight: "82dvh", paddingBottom: "env(safe-area-inset-bottom)" }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
                <h2 className="text-base font-black">
                  {showTosModal === "tos" ? "Terms of Service" : "Privacy Policy"}
                </h2>
                <button
                  onClick={() => setShowTosModal(null)}
                  className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-lg"
                >×</button>
              </div>
              <div className="overflow-y-auto px-6 py-4 space-y-4 text-sm text-muted-foreground leading-relaxed">
                {showTosModal === "tos" ? (
                  <>
                    <p className="text-xs text-muted-foreground">Last updated: July 2026</p>
                    <section>
                      <h3 className="font-black text-foreground mb-1">1. What Niakofa Is</h3>
                      <p>Niakofa is a community mutual-aid platform where neighbors help neighbors. It is <strong>not</strong> a professional service marketplace, employment platform, or emergency service. All help is provided voluntarily by community members.</p>
                    </section>
                    <section>
                      <h3 className="font-black text-foreground mb-1">2. Your Responsibilities</h3>
                      <p>You are responsible for the accuracy of your profile, the requests you make, and the help you offer. You agree not to use Niakofa for illegal activities, solicitation, or to misrepresent your identity or qualifications.</p>
                    </section>
                    <section>
                      <h3 className="font-black text-foreground mb-1">3. Safety & Liability</h3>
                      <p>Niakofa does not guarantee the safety, quality, or outcome of any help transaction. By using this platform you acknowledge that all interactions are at your own discretion and risk. Niakofa is not liable for any damages, injuries, or losses arising from community interactions.</p>
                    </section>
                    <section>
                      <h3 className="font-black text-foreground mb-1">4. Community Standards</h3>
                      <p>All users must treat each other with dignity and respect. Discrimination, harassment, or exploitative behavior will result in immediate account termination. Niakofa reserves the right to moderate, suspend, or remove accounts that violate community standards.</p>
                    </section>
                    <section>
                      <h3 className="font-black text-foreground mb-1">5. Payments & Pay It Forward</h3>
                      <p>The community pool is funded voluntarily. Guaranteed minimums and tips are facilitated by the platform but Niakofa does not guarantee payment for any service. By accepting payment you agree to Stripe's terms of service.</p>
                    </section>
                    <section>
                      <h3 className="font-black text-foreground mb-1">6. Changes to These Terms</h3>
                      <p>Niakofa may update these terms at any time. Continued use after notice of changes constitutes acceptance. Contact support@niakofa.app with questions.</p>
                    </section>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">Last updated: July 2026</p>
                    <section>
                      <h3 className="font-black text-foreground mb-1">1. What We Collect</h3>
                      <p>We collect your name, email, approximate location (city/GPS), help requests, and interaction history. We do <strong>not</strong> sell your data to advertisers or third parties.</p>
                    </section>
                    <section>
                      <h3 className="font-black text-foreground mb-1">2. How We Use It</h3>
                      <p>Your data is used to match helpers to requests, power Nia's AI assistance, detect safety issues, and improve the platform. Location data is fuzzed (~100 meters) before being shared with other users.</p>
                    </section>
                    <section>
                      <h3 className="font-black text-foreground mb-1">3. Nia AI</h3>
                      <p>Nia uses your location, request history, and city context to personalize responses. Conversations are used to improve Nia but are not shared publicly. You can delete your conversation history at any time from your profile.</p>
                    </section>
                    <section>
                      <h3 className="font-black text-foreground mb-1">4. Data Retention</h3>
                      <p>Your data is retained while your account is active. You may request account deletion at any time by emailing support@niakofa.app. Deleted accounts are purged within 30 days, except where legally required to retain records.</p>
                    </section>
                    <section>
                      <h3 className="font-black text-foreground mb-1">5. Push Notifications</h3>
                      <p>If you enable push notifications, we store your device subscription token to send you relevant alerts. You can revoke this at any time from your device settings.</p>
                    </section>
                    <section>
                      <h3 className="font-black text-foreground mb-1">6. Contact</h3>
                      <p>For privacy requests or questions: <strong>privacy@niakofa.app</strong></p>
                    </section>
                  </>
                )}
              </div>
              <div className="px-6 py-4 border-t border-border shrink-0">
                <button
                  onClick={() => { setTosAccepted(true); setShowTosModal(null); }}
                  className="w-full h-12 bg-primary text-primary-foreground rounded-2xl font-black text-sm active:opacity-80"
                >
                  I Agree — Accept &amp; Close
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
