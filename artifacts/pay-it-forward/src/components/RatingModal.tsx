import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, X, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";

interface Props {
  requestId: number;
  role: "requester" | "helper";
  helperName?: string | null;
  requesterName?: string | null;
  onClose: () => void;
}

export function RatingModal({ requestId, role, helperName, requesterName, onClose }: Props) {
  const [stars, setStars] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [review, setReview] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const rateeLabel =
    role === "requester"
      ? (helperName ?? "your helper")
      : (requesterName ?? "the requester");

  const starLabels = ["", "Poor", "Fair", "Good", "Great", "Excellent!"];

  const handleSubmit = async () => {
    if (stars < 1) {
      toast({ title: "Please select a star rating", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/requests/${requestId}/rate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ stars, review: review.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        if (data.error === "You have already rated this request") {
          setSubmitted(true);
          return;
        }
        throw new Error(data.error ?? "Failed to submit rating");
      }
      setSubmitted(true);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Failed to submit rating", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
        onClick={submitted ? onClose : undefined}
      />
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 26, stiffness: 220 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-3xl p-6 pb-safe space-y-5 max-h-[80dvh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-black text-lg">Rate {rateeLabel}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close rating"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <AnimatePresence mode="wait">
          {submitted ? (
            <motion.div
              key="done"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center gap-3 py-6 text-center"
            >
              <CheckCircle2 className="w-14 h-14 text-green-400" />
              <div className="font-black text-lg">Thanks for your feedback!</div>
              <p className="text-sm text-muted-foreground">
                Your rating helps keep the community safe and high-quality.
              </p>
              <Button className="w-full mt-2 font-black" onClick={onClose}>
                Done
              </Button>
            </motion.div>
          ) : (
            <motion.div key="form" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                How was your experience with {rateeLabel}?
              </p>

              <div className="flex justify-center gap-3">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    onMouseEnter={() => setHovered(n)}
                    onMouseLeave={() => setHovered(0)}
                    onClick={() => setStars(n)}
                    className="transition-transform hover:scale-110 active:scale-95"
                    aria-label={`${n} star${n !== 1 ? "s" : ""}`}
                  >
                    <Star
                      className={`w-10 h-10 transition-colors ${
                        n <= (hovered || stars)
                          ? "text-yellow-400 fill-yellow-400"
                          : "text-muted-foreground"
                      }`}
                    />
                  </button>
                ))}
              </div>

              <AnimatePresence>
                {stars > 0 && (
                  <motion.p
                    key={stars}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-center text-sm font-bold text-yellow-400"
                  >
                    {starLabels[stars]}
                  </motion.p>
                )}
              </AnimatePresence>

              <textarea
                value={review}
                onChange={e => setReview(e.target.value)}
                placeholder="Optional: share a short note (visible to community admins only)"
                rows={3}
                maxLength={500}
                className="w-full bg-background border border-border rounded-xl p-3 text-sm outline-none focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground resize-none"
              />

              <Button
                className="w-full h-12 font-black"
                onClick={handleSubmit}
                disabled={submitting || stars < 1}
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Submitting…
                  </span>
                ) : (
                  "Submit Rating"
                )}
              </Button>

              <button
                onClick={onClose}
                className="w-full text-sm text-muted-foreground py-1 hover:text-foreground transition-colors"
              >
                Skip for now
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}
