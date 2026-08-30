import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { X, Loader2, Lock, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Z_MODAL } from "@/lib/zLayers";

const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

const stripePromise = STRIPE_PK ? loadStripe(STRIPE_PK) : null;

export function isStripeConfigured(): boolean {
  return !!STRIPE_PK;
}

interface PaymentFormProps {
  amount: number;
  description: string;
  returnUrl?: string;
  onSuccess: () => void;
  onSkip: () => void;
}

function PaymentForm({ amount, description, returnUrl, onSuccess, onSkip }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || isLoading) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: returnUrl ?? window.location.href,
        },
        redirect: "if_required",
      });

      if (error) {
        setErrorMessage(error.message ?? "Payment failed. Please try again.");
      } else if (
        paymentIntent &&
        paymentIntent.status !== "succeeded" &&
        paymentIntent.status !== "processing"
      ) {
        setErrorMessage("Payment needs another step before it can be completed.");
      } else {
        onSuccess();
      }
    } catch {
      setErrorMessage("Payment could not be completed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
      <div className="flex-1 space-y-5">
        <div className="flex items-start justify-between rounded-2xl border border-green-500/30 bg-green-500/10 p-4">
          <div>
            <div className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Amount to Pay
            </div>
            <div className="text-4xl font-black text-green-400">${amount.toFixed(2)}</div>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-500/20">
            <DollarSign className="h-5 w-5 text-green-400" aria-hidden="true" />
          </div>
        </div>

        {description && <p className="px-1 text-xs leading-relaxed text-muted-foreground">{description}</p>}

        <PaymentElement options={{ layout: "tabs" }} />

        {errorMessage && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {errorMessage}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-10 -mx-1 mt-6 border-t border-border/60 bg-card/95 px-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-md">
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="min-h-[52px] flex-1 text-sm font-bold"
            onClick={onSkip}
            disabled={isLoading}
          >
            Skip for Now
          </Button>
          <Button
            type="submit"
            className="min-h-[52px] flex-1 bg-green-500 text-base font-black text-white hover:bg-green-600"
            disabled={!stripe || !elements || isLoading}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Processing…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Lock className="h-4 w-4" aria-hidden="true" />
                Confirm ${amount.toFixed(2)}
              </span>
            )}
          </Button>
        </div>

        <p className="flex items-center justify-center gap-1 pt-2.5 text-center text-[10px] text-muted-foreground">
          <Lock className="h-3 w-3" aria-hidden="true" />
          Secured by Stripe — card details never touch our servers
        </p>
      </div>
    </form>
  );
}

interface StripePaymentModalProps {
  clientSecret: string;
  amount: number;
  description?: string;
  returnUrl?: string;
  onSuccess: () => void;
  onSkip: () => void;
  onClose: () => void;
}

export function StripePaymentModal({
  clientSecret,
  amount,
  description = "",
  returnUrl,
  onSuccess,
  onSkip,
  onClose,
}: StripePaymentModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverscrollBehavior = document.body.style.overscrollBehavior;
    const previousHtmlOverscrollBehavior = document.documentElement.style.overscrollBehavior;
    const previousActiveElement = document.activeElement as HTMLElement | null;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overscrollBehavior = "none";
    setMounted(true);

    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscrollBehavior;
      previousActiveElement?.focus();
    };
  }, []);

  if (!stripePromise) return null;
  if (!mounted) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 isolate overflow-hidden bg-card"
        style={{ zIndex: Z_MODAL }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-modal-title"
      >
        <div className="absolute inset-0 overflow-y-auto overscroll-contain">
          <div className="mx-auto min-h-full max-w-lg px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="sticky top-0 z-20 -mx-4 flex items-center justify-between border-b border-border bg-card/95 px-4 py-3 backdrop-blur-md">
              <div className="flex min-w-0 items-center gap-2.5">
                <DollarSign className="h-5 w-5 shrink-0 text-green-400" aria-hidden="true" />
                <div className="min-w-0">
                  <h3 id="payment-modal-title" className="truncate text-lg font-black leading-tight">
                    Confirm Payment
                  </h3>
                  <p className="text-[10px] text-muted-foreground">
                    Review your contribution and complete securely.
                  </p>
                </div>
              </div>
              <Button
                ref={closeButtonRef}
                type="button"
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="min-h-[44px] min-w-[44px] shrink-0 rounded-full"
                aria-label="Close payment"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>

            <div className="py-5">
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: {
                    theme: "night",
                    variables: {
                      colorPrimary: "hsl(190, 100%, 50%)",
                      colorBackground: "hsl(220, 15%, 10%)",
                      colorText: "#ffffff",
                      colorTextSecondary: "hsl(220, 10%, 60%)",
                      colorDanger: "#ef4444",
                      borderRadius: "12px",
                      fontFamily: "system-ui, -apple-system, sans-serif",
                    },
                  },
                }}
              >
                <PaymentForm
                  amount={amount}
                  description={description}
                  returnUrl={returnUrl}
                  onSuccess={onSuccess}
                  onSkip={onSkip}
                />
              </Elements>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
