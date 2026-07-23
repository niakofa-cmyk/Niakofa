import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { CheckCircle2, DollarSign, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";

export default function StripeConnectedScreen() {
  const [, setLocation] = useLocation();
  const { currentUser } = useAppContext();
  const [status, setStatus] = useState<"loading" | "success" | "pending">("loading");
  const [retryCount, setRetryCount] = useState(0);
  const [checking, setChecking] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!currentUser?.id) { setStatus("pending"); return; }
    setChecking(true);
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    try {
      const r = await fetch(`${base}/api/stripe/connect/status/${currentUser.id}`, { headers: authHeaders() });
      const data = await r.json();
      setStatus(data.payoutsEnabled ? "success" : "pending");
    } catch {
      setStatus("pending");
    } finally {
      setChecking(false);
    }
  }, [currentUser?.id]);

  // Initial check
  useEffect(() => { checkStatus(); }, [checkStatus]);

  // Auto-retry every 6 s for up to 5 times when still pending (Stripe verification can take a moment)
  useEffect(() => {
    if (status !== "pending" || retryCount >= 5) return;
    const id = setTimeout(() => {
      setRetryCount(c => c + 1);
      checkStatus();
    }, 6000);
    return () => clearTimeout(id);
  }, [status, retryCount, checkStatus]);

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-6">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="flex flex-col items-center text-center max-w-sm"
      >
        {status === "loading" && (
          <Loader2 className="w-16 h-16 text-primary animate-spin mb-6" />
        )}

        {status === "success" && (
          <>
            <div className="w-24 h-24 rounded-full bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(34,197,94,0.15)]">
              <CheckCircle2 className="w-12 h-12 text-green-400" />
            </div>
            <h1 className="text-2xl font-black mb-3">Payouts Enabled! 🎉</h1>
            <p className="text-muted-foreground leading-relaxed mb-8">
              Your Stripe account is connected and payouts are active. You'll receive payments directly when you complete paid requests.
            </p>
            <div className="w-full bg-card border border-border rounded-2xl p-4 mb-6 text-left space-y-2">
              {[
                "Automatic payouts after each completed request",
                "5% platform fee supports the community",
                "Funds arrive within 2 business days",
              ].map(item => (
                <div key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                  <span className="text-sm text-muted-foreground">{item}</span>
                </div>
              ))}
            </div>
            <Button className="w-full h-12 font-black gap-2" onClick={() => setLocation("/wallet")}>
              <DollarSign className="w-4 h-4" />
              View My Wallet
            </Button>
          </>
        )}

        {status === "pending" && (
          <>
            <div className="w-24 h-24 rounded-full bg-yellow-500/10 border-2 border-yellow-500/30 flex items-center justify-center mb-6">
              {checking ? (
                <Loader2 className="w-10 h-10 text-yellow-400 animate-spin" />
              ) : (
                <DollarSign className="w-12 h-12 text-yellow-400" />
              )}
            </div>
            <h1 className="text-2xl font-black mb-3">Almost There</h1>
            <p className="text-muted-foreground leading-relaxed mb-2">
              Your Stripe account is being reviewed. Payouts will activate once Stripe verifies your information — usually within a few minutes.
            </p>
            {retryCount < 5 && (
              <p className="text-xs text-muted-foreground/60 mb-6">
                Checking automatically… ({retryCount}/5)
              </p>
            )}
            {retryCount >= 5 && (
              <p className="text-xs text-muted-foreground/60 mb-6">
                Verification is taking longer than usual. Check back in your wallet.
              </p>
            )}
            <div className="flex flex-col gap-3 w-full">
              <Button
                variant="outline"
                className="w-full h-12 font-semibold gap-2"
                onClick={() => { setRetryCount(0); checkStatus(); }}
                disabled={checking}
              >
                <RefreshCw className={`w-4 h-4 ${checking ? "animate-spin" : ""}`} />
                Check Again
              </Button>
              <Button className="w-full h-12 font-black gap-2" onClick={() => setLocation("/wallet")}>
                Back to Wallet
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
