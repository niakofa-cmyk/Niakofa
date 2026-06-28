import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Mail, User, Lock, Eye, EyeOff, Loader2, MapPin, Shield, KeyRound, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/lib/AppContext";
import { setToken } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { NiaOrb } from "@/components/NiaDrawer";

type Mode = "login" | "register";

export default function LoginScreen() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { setCurrentUser } = useAppContext();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [isHelper, setIsHelper] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── Set-Password flow for legacy accounts ────────────────────────────────────
  const [pendingLegacyUser, setPendingLegacyUser] = useState<{ id: number; email: string; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) return;
    if (mode === "register" && !name.trim()) return;
    setLoading(true);

    try {
      if (mode === "register") {
        const res = await fetch("/api/users/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), email: email.trim(), password, is_helper: isHelper }),
        });
        const data = await res.json().catch(() => ({})) as any;
        if (!res.ok) {
          const msgKey = data.error === "Email already registered" ? "auth.email_taken" : null;
          throw new Error(msgKey ? t(msgKey) : (data.error ?? "Registration failed"));
        }
        const user = data.user ?? data;
        if (data.token) setToken(data.token);
        setCurrentUser(user);
        localStorage.setItem("niakofa_user", JSON.stringify(user));
        toast({ title: `Welcome to Niakofa, ${user.name}! 💙` });
        const onboarded = localStorage.getItem("niakofa_onboarded");
        setLocation(onboarded ? "/" : "/onboarding");
      } else {
        const res = await fetch("/api/users/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), password }),
        });
        const data = await res.json().catch(() => ({})) as any;

        // Legacy account — server returns 403 with LEGACY_PASSWORD_REQUIRED.
        // No token is issued. The user must set a password before gaining access.
        if (!res.ok && res.status === 403 && data.error_code === "LEGACY_PASSWORD_REQUIRED") {
          setPendingLegacyUser({ id: data.user_id, email: data.user_email, name: data.user_name });
          return;
        }

        if (!res.ok) {
          const msgKey =
            data.error === "Incorrect password" ? "auth.wrong_password" :
            data.error === "No account found with that email" ? "auth.no_account" : null;
          throw new Error(msgKey ? t(msgKey) : (data.error ?? t("common.error")));
        }

        const user = data.user ?? data;
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
    setSavingPassword(true);
    try {
      // Use the dedicated legacy-account endpoint — no pre-existing token required.
      // Ownership is proved by matching user_id + email.
      const res = await fetch("/api/users/set-initial-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: pendingLegacyUser.id,
          email: pendingLegacyUser.email,
          new_password: newPassword,
        }),
      });
      const data = await res.json().catch(() => ({})) as any;
      if (!res.ok) throw new Error(data.error ?? "Failed to save password");
      // Server returns a full auth token — log in normally
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

  // ── Legacy account "Set Password" screen ─────────────────────────────────────
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
              <h2 className="text-2xl font-black tracking-tight text-foreground">
                {t("auth.set_password")}
              </h2>
              <p className="text-sm text-muted-foreground mt-2 text-center leading-relaxed">
                {t("auth.password_setup_prompt")}
              </p>
            </div>

            <AnimatePresence mode="wait">
              {passwordSaved ? (
                <motion.div
                  key="saved"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center gap-3 py-8 text-center"
                >
                  <CheckCircle2 className="w-14 h-14 text-green-400" />
                  <div className="font-black text-lg text-foreground">Password saved!</div>
                  <div className="text-sm text-muted-foreground">Taking you to the app…</div>
                </motion.div>
              ) : (
                <motion.div key="form" className="space-y-3">
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
                    <button
                      onClick={() => setShowNewPass(p => !p)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground active:text-foreground transition-colors"
                    >
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
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-xs text-destructive px-1"
                    >
                      Passwords do not match
                    </motion.p>
                  )}

                  <Button
                    className="w-full h-13 font-black text-base mt-2"
                    onClick={handleSetPassword}
                    disabled={
                      savingPassword ||
                      newPassword.length < 8 ||
                      newPassword !== confirmPassword
                    }
                  >
                    {savingPassword ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving…
                      </span>
                    ) : (
                      t("auth.set_password")
                    )}
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
      {/* Hero header */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-8">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="flex flex-col items-center mb-10"
        >
          {/* Nia sparkle orb — replaces the old heart graphic in the login topbar */}
          <div style={{ marginBottom: 4 }}>
            <NiaOrb size={70} pulse />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Niakofa</h1>
          <p className="text-sm text-muted-foreground mt-1 text-center max-w-xs">
            Help Today. Pay It Forward Tomorrow.
          </p>
          <p className="text-xs mt-2 text-center" style={{ color: "#1D9E75" }}>
            Sawubona — I see you. Tap Nia to chat.
          </p>
        </motion.div>

        {/* Mode toggle */}
        <div className="flex bg-muted rounded-2xl p-1 mb-6 w-full max-w-sm">
          {(["login", "register"] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider transition-all ${
                mode === m
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              {m === "login" ? "Sign In" : "Join"}
            </button>
          ))}
        </div>

        <div className="w-full max-w-sm space-y-3">
          <AnimatePresence mode="wait">
            {mode === "register" && (
              <motion.div
                key="name"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
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
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              className="w-full bg-card border border-border rounded-2xl pl-11 pr-12 py-3.5 text-sm outline-none focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
            <button
              onClick={() => setShowPass(p => !p)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground active:text-foreground transition-colors"
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <AnimatePresence mode="wait">
            {mode === "register" && (
              <motion.button
                key="helper-toggle"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                type="button"
                onClick={() => setIsHelper(p => !p)}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left overflow-hidden ${
                  isHelper
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card"
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  isHelper ? "bg-primary/20" : "bg-muted"
                }`}>
                  <MapPin className={`w-5 h-5 ${isHelper ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`font-black text-sm ${isHelper ? "text-primary" : "text-foreground"}`}>
                    I want to be a helper
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Receive requests, earn goodwill &amp; pay
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  isHelper ? "bg-primary border-primary" : "border-border"
                }`}>
                  {isHelper && <div className="w-2 h-2 rounded-full bg-primary-foreground" />}
                </div>
              </motion.button>
            )}
          </AnimatePresence>

          <Button
            className="w-full h-13 font-black text-base mt-2"
            onClick={handleSubmit}
            disabled={loading || !email.trim() || (mode === "register" && !name.trim())}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {mode === "login" ? "Signing in…" : "Creating account…"}
              </span>
            ) : (
              mode === "login" ? "Sign In" : "Create Account"
            )}
          </Button>
        </div>

        {/* Trust note */}
        <div className="flex items-center gap-2 mt-6 text-muted-foreground">
          <Shield className="w-3.5 h-3.5" />
          <span className="text-xs">No tracking, no ads, community-owned</span>
        </div>
      </div>

      {/* Bottom city tag */}
      <div className="px-6 pb-safe pb-6 text-center">
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
          <MapPin className="w-3 h-3" />
          Building community one act of kindness at a time
        </p>
      </div>
    </div>
  );
}
