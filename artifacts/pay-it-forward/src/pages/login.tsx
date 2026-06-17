import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Mail, User, Lock, Eye, EyeOff, Loader2, MapPin, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/lib/AppContext";
import { toast } from "@/hooks/use-toast";

type Mode = "login" | "register";

export default function LoginScreen() {
  const [, setLocation] = useLocation();
  const { setCurrentUser } = useAppContext();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [isHelper, setIsHelper] = useState(false);
  const [loading, setLoading] = useState(false);

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
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Registration failed");
        const user = data.user ?? data;
        setCurrentUser(user);
        localStorage.setItem("niakofa_user", JSON.stringify(user));
        toast({ title: `Welcome to Niakofa, ${user.name}! 💙` });
        setLocation("/");
      } else {
        const res = await fetch("/api/users/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Login failed");
        const user = data.user ?? data;
        setCurrentUser(user);
        localStorage.setItem("niakofa_user", JSON.stringify(user));
        toast({ title: `Welcome back, ${user.name}!` });
        setLocation("/");
      }
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Something went wrong", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

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
          <div className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center mb-5 shadow-[0_0_40px_rgba(0,212,255,0.15)]">
            <Heart className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Niakofa</h1>
          <p className="text-sm text-muted-foreground mt-1 text-center max-w-xs">
            Help Today. Pay It Forward Tomorrow.
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
          Fort Worth, TX · Building community one act of kindness at a time
        </p>
      </div>
    </div>
  );
}
