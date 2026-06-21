import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Sparkles, X, Send } from "lucide-react";

interface GratitudePrompt {
  requestId: number;
  requestTitle: string;
  helperName: string;
  helperId?: number;
  authorId: number;
  authorName: string;
  authorAvatar?: string;
}

interface GratitudeModalProps {
  prompt: GratitudePrompt | null;
  onClose: () => void;
}

const QUICK_MESSAGES = [
  "Thank you so much — you showed up exactly when I needed it. 💙",
  "This community is incredible. I'll pay it forward!",
  "I can't believe a stranger helped me so quickly. Truly grateful.",
  "Made my whole day. This is what neighbors are for.",
];

export function GratitudeModal({ prompt, onClose }: GratitudeModalProps) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!prompt) return null;

  async function handleSubmit() {
    if (!message.trim() || submitting || !prompt) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/gratitude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: prompt.requestId,
          author_id: prompt.authorId,
          author_name: prompt.authorName,
          author_avatar: prompt.authorAvatar,
          helper_id: prompt.helperId,
          helper_name: prompt.helperName,
          message: message.trim(),
          request_title: prompt.requestTitle,
        }),
      });
      if (!res.ok) throw new Error("Failed to post");
      setSubmitted(true);
      setTimeout(() => onClose(), 2800);
    } catch {
      setError("Couldn't post right now. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        key="gratitude-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          key="gratitude-sheet"
          initial={{ y: 60, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 60, opacity: 0, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="w-full max-w-md bg-card border border-border rounded-3xl overflow-hidden shadow-2xl"
        >
          {/* Header */}
          <div className="relative bg-gradient-to-br from-primary/20 via-primary/5 to-background p-6 pb-4">
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex flex-col items-center gap-3">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 400, damping: 20 }}
                className="w-14 h-14 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center"
              >
                <Heart className="w-7 h-7 text-primary" />
              </motion.div>
              <div className="text-center">
                <div className="font-black text-base">Say thank you to the community</div>
                <div className="text-xs text-muted-foreground mt-1">
                  <span className="text-primary font-semibold">{prompt.helperName}</span> just helped with{" "}
                  <span className="font-medium">"{prompt.requestTitle}"</span>
                </div>
              </div>
            </div>
          </div>

          {submitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-8 flex flex-col items-center gap-3 text-center"
            >
              <Sparkles className="w-10 h-10 text-primary" />
              <div className="font-black text-lg">Posted to the community! 🎉</div>
              <p className="text-sm text-muted-foreground">
                Your gratitude inspires others to keep paying it forward.
              </p>
            </motion.div>
          ) : (
            <div className="p-5 space-y-4">
              {/* Quick picks */}
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                  Quick picks
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {QUICK_MESSAGES.map((msg) => (
                    <button
                      key={msg}
                      onClick={() => setMessage(msg)}
                      className={`text-left text-xs px-3 py-2 rounded-xl border transition-all ${
                        message === msg
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      {msg}
                    </button>
                  ))}
                </div>
              </div>

              {/* Free-form textarea */}
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                  Or write your own
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="What did this experience mean to you?"
                  className="w-full resize-none rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="text-right text-[10px] text-muted-foreground mt-1">
                  {message.length}/500
                </div>
              </div>

              {error && (
                <div className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  Skip
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!message.trim() || submitting}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
                >
                  {submitting ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                      <Sparkles className="w-4 h-4" />
                    </motion.div>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Share Gratitude
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
