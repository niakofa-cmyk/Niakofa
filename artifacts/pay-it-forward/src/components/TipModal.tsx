import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, X, DollarSign, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

interface TipModalProps {
  requestId: number;
  helperName: string;
  onClose: () => void;
}

const TIP_AMOUNTS = [1, 2, 5, 10, 20];

export function TipModal({ requestId, helperName, onClose }: TipModalProps) {
  const { currentUser } = useAppContext();
  const [selected, setSelected] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [, setLocation] = useLocation();

  const amount = selected ?? (custom ? parseFloat(custom) : null);

  const handleTip = async () => {
    if (!amount || !currentUser || submitting) return;
    setSubmitting(true);
    try {
      // Tip via wallet balance deduction → helper credit
      const res = await fetch(`/api/requests/${requestId}/tip-wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ tip_amount_cents: Math.round(amount * 100) }),
      });

      if (res.ok) {
        toast({ title: `💚 $${amount.toFixed(2)} tip sent to ${helperName}!`, description: "Sent from your wallet balance." });
        onClose();
        return;
      }

      // If balance is insufficient (402) or any other failure → redirect to
      // the wallet page with the tip amount pre-filled so the user can add funds.
      const errData = await res.json().catch(() => ({})) as { code?: string };
      if (res.status === 402 || errData?.code === "insufficient_balance") {
        toast({ title: "Not enough balance", description: "Redirecting to wallet to add funds…" });
        setLocation(`/wallet?tip_amount=${amount}&tip_request=${requestId}&tip_helper=${encodeURIComponent(helperName)}`);
        return;
      }

      toast({ title: "Tip failed — try again", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <>
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.95 }}
          className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-3xl p-6 pb-safe"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Heart className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="font-black text-base">Send a Tip</div>
                <div className="text-xs text-muted-foreground">to {helperName}</div>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Preset amounts */}
          <div className="grid grid-cols-5 gap-2 mb-4">
            {TIP_AMOUNTS.map(amt => (
              <button
                key={amt}
                onClick={() => { setSelected(selected === amt ? null : amt); setCustom(""); }}
                className={`py-3 rounded-xl border text-sm font-bold transition-all active:scale-[0.95] ${
                  selected === amt
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted border-border text-foreground"
                }`}
              >
                ${amt}
              </button>
            ))}
          </div>

          {/* Custom amount */}
          <div className="relative mb-4">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="number"
              placeholder="Custom amount"
              value={custom}
              onChange={e => { setCustom(e.target.value); setSelected(null); }}
              style={{ fontSize: "16px" }}
              className="w-full pl-8 pr-4 py-3 bg-muted border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <Button
            onClick={handleTip}
            disabled={!amount || submitting}
            className="w-full h-12 font-black text-base"
          >
            {submitting
              ? "Sending…"
              : amount
                ? `Send $${amount.toFixed(2)} tip`
                : "Select an amount"}
          </Button>

          <p className="text-center text-[10px] text-muted-foreground mt-3 flex items-center justify-center gap-1">
            <ExternalLink className="w-3 h-3" />
            Deducted from your wallet balance. Insufficient funds? We'll take you to add more.
          </p>
        </motion.div>
      </>
    </AnimatePresence>
  );
}
