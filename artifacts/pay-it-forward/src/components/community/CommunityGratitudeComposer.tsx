import { useEffect, useRef, useState } from "react";
import { Heart, Send, X } from "lucide-react";
import { authHeaders } from "@/lib/auth";

type CommunityGratitudeComposerProps = {
  open: boolean;
  onClose: () => void;
};

export function CommunityGratitudeComposer({ open, onClose }: CommunityGratitudeComposerProps) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const restoreTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => closeRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      restoreTarget?.focus();
    };
  }, [onClose, open]);

  useEffect(() => {
    if (open) return;
    setMessage("");
    setSubmitting(false);
    setSubmitted(false);
    setError(null);
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/gratitude", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ message: trimmedMessage }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error
          : "Could not share your gratitude right now.";
        throw new Error(detail);
      }
      setSubmitted(true);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Could not share your gratitude right now.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-gratitude-title"
        className="w-full max-w-md rounded-t-3xl border border-border bg-background p-5 shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <Heart className="h-4 w-4" aria-hidden="true" />
              <p className="text-[11px] font-black uppercase tracking-[0.16em]">Pay it forward</p>
            </div>
            <h2 id="community-gratitude-title" className="mt-1 text-lg font-black">Share gratitude</h2>
            <p className="mt-1 text-xs text-muted-foreground">Recognize a neighbor or celebrate a community moment.</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close gratitude composer"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-muted"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {submitted ? (
          <div className="mt-6 rounded-2xl border border-primary/30 bg-primary/10 p-5 text-center" role="status">
            <Heart className="mx-auto h-8 w-8 text-primary" aria-hidden="true" />
            <p className="mt-2 text-sm font-black">Gratitude shared</p>
            <p className="mt-1 text-xs text-muted-foreground">Thank you for strengthening the community.</p>
            <button type="button" onClick={onClose} className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground">
              Done
            </button>
          </div>
        ) : (
          <>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={500}
              rows={5}
              autoFocus
              aria-label="Gratitude message"
              placeholder="What are you grateful for?"
              className="mt-5 min-h-28 w-full resize-none rounded-2xl bg-muted/45 px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary/50"
            />
            <div className="mt-1 flex justify-end text-[10px] text-muted-foreground">{message.length}/500</div>
            {error && <p role="alert" className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!message.trim() || submitting}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-black text-primary-foreground disabled:opacity-50"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                {submitting ? "Sharing…" : "Share Gratitude"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}