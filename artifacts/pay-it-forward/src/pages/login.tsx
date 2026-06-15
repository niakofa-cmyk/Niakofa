import { useState } from "react";
import { useAppContext, setStoredAuth } from "@/lib/AppContext";
import type { User } from "@workspace/api-client-react";

type Mode = "login" | "register";

interface AuthResponse {
  user: User;
  token: string;
}

export default function LoginPage() {
  const { setCurrentUser } = useAppContext();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isHelper, setIsHelper] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setError(null);
    setPassword("");
    setConfirmPassword("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "register") {
      if (!name.trim()) {
        setError("Please enter your name.");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    } else {
      if (!password) {
        setError("Please enter your password.");
        return;
      }
    }

    setLoading(true);
    try {
      const endpoint = mode === "register" ? "/api/users/register" : "/api/users/login";
      const body = mode === "register"
        ? {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password,
            is_helper: isHelper,
          }
        : {
            email: email.trim().toLowerCase(),
            password,
          };

      const res = await fetch(`${base}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.json() as { error?: string };
        setError(errBody.error ?? "Something went wrong. Please try again.");
        return;
      }

      const data = await res.json() as AuthResponse;
      setStoredAuth(data.user, data.token);
      setCurrentUser(data.user);
    } catch {
      setError("Network error — please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        {/* Logo / wordmark */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <span className="text-3xl">💙</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight">Niakofa</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "register"
              ? "Create your account to get started"
              : "Welcome back — sign in to continue"}
          </p>
        </div>

        {/* Mode tabs */}
        <div className="flex rounded-xl border border-border overflow-hidden mb-6">
          <button
            onClick={() => switchMode("login")}
            className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
              mode === "login"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            Sign in
          </button>
          <button
            onClick={() => switchMode("register")}
            className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
              mode === "register"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            Create account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name — register only */}
          {mode === "register" && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Your name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Alex Helper"
                required
                autoComplete="name"
                className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
              />
            </div>
          )}

          {/* Email */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === "register" ? "Min. 8 characters" : "Your password"}
              required
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
            />
          </div>

          {/* Confirm Password — register only */}
          {mode === "register" && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Confirm password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repeat your password"
                required
                autoComplete="new-password"
                className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
              />
            </div>
          )}

          {/* Helper toggle — register only */}
          {mode === "register" && (
            <label className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl cursor-pointer hover:border-primary/50 transition-colors">
              <input
                type="checkbox"
                checked={isHelper}
                onChange={e => setIsHelper(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              <div>
                <div className="text-sm font-semibold">I want to help others</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Toggle Helper Mode to see and accept nearby requests
                </div>
              </div>
            </label>
          )}

          {/* Error message */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-primary-foreground font-black rounded-xl py-3.5 text-sm transition-opacity disabled:opacity-60 hover:opacity-90"
          >
            {loading
              ? (mode === "login" ? "Signing in…" : "Creating account…")
              : (mode === "login" ? "Sign in" : "Create account")}
          </button>
        </form>

        {/* Mode switch hint */}
        <p className="text-xs text-muted-foreground text-center mt-5 leading-relaxed">
          {mode === "login" ? (
            <>
              Don&apos;t have an account?{" "}
              <button
                onClick={() => switchMode("register")}
                className="text-primary font-semibold hover:underline"
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                onClick={() => switchMode("login")}
                className="text-primary font-semibold hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
