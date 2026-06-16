import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, X, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/lib/AppContext";
import { toast } from "@/hooks/use-toast";

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

  const amount = selected ?? (custom ? parseFloat(custom) : null);

  const handleTip = async () => {
    if (!amount || !currentUser || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/requests/${requestId}/tip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requester_id: currentUser.id, tip_amount: amount }),
      });
      if (res.ok) {
        toast({ title: `💚 $${amount.toFixed(2)} tip sent to ${helperName}!` });
        onClose();
      } else {
        toast({ title: "Tip failed", variant: "destructive" });
      }
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
          initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 26, stiffness: 220 }}
          className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-3xl p-6 pb-safe"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-green-400" />
              <h3 className="font-black text-lg">Leave a Tip</h3>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
              <X className="w-5 h-5" />
            </Button>
          </div>

          <p className="text-sm text-muted-foreground mb-5">
            Show <strong className="text-foreground">{helperName}</strong> some extra love. 100% goes to them.
          </p>

          <div className="grid grid-cols-5 gap-2 mb-4">
            {TIP_AMOUNTS.map(amt => (
              <button
                key={amt}
                onClick={() => { setSelected(amt); setCustom(""); }}
                className={`h-12 rounded-xl font-black text-sm border transition-all ${
                  selected === amt
                    ? "bg-green-500 border-green-500 text-white"
                    : "bg-muted border-border hover:border-green-500/50"
                }`}
              >
                ${amt}
              </button>
            ))}
          </div>

          <div className="relative mb-5">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="number"
              placeholder="Custom amount"
              value={custom}
              onChange={e => { setCustom(e.target.value); setSelected(null); }}
              className="w-full bg-muted border border-border rounded-xl pl-9 pr-4 py-3 text-sm outline-none focus:border-green-500 transition-colors"
              min="0.50"
              step="0.50"
            />
          </div>

          <Button
            className="w-full h-12 font-black bg-green-500 hover:bg-green-600 text-white text-base"
            disabled={!amount || amount < 0.5 || submitting}
            onClick={handleTip}
          >
            {submitting ? "Sending…" : amount ? `Send $${amount.toFixed(2)} tip` : "Select an amount"}
          </Button>
        </motion.div>
      </>
    </AnimatePresence>
  );
}
