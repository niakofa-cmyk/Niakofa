import { useState } from "react";
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

const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

const stripePromise = STRIPE_PK ? loadStripe(STRIPE_PK) : null;

export function isStripeConfigured(): boolean {
  return !!STRIPE_PK;
}

interface PaymentFormProps {
  amount: number;
  description: string;
  onSuccess: () => void;
  onSkip: () => void;
}

function PaymentForm({ amount, description, onSuccess, onSkip }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsLoading(true);
    setErrorMessage(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: "if_required",
    });

    setIsLoading(false);

    if (error) {
      setErrorMessage(error.message ?? "Payment failed. Please try again.");
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-start justify-between bg-green-500/10 border border-green-500/30 rounded-2xl p-4">
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-0.5">
            Amount to Pay
          </div>
          <div className="text-4xl font-black text-green-400">
            ${amount.toFixed(2)}
          </div>
        </div>
        <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
          <DollarSign className="w-5 h-5 text-green-400" />
        </div>
      </div>

      {description && (
        <p className="text-xs text-muted-foreground leading-relaxed px-1">
          {description}
        </p>
      )}

      <PaymentElement options={{ layout: "tabs" }} />

      {errorMessage && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1 h-12"
          onClick={onSkip}
          disabled={isLoading}
        >
          Skip for Now
        </Button>
        <Button
          type="submit"
          className="flex-1 h-12 font-black bg-green-500 hover:bg-green-600 text-white text-base"
          disabled={!stripe || !elements || isLoading}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Pay ${amount.toFixed(2)}
            </span>
          )}
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
        <Lock className="w-3 h-3" />
        Secured by Stripe — card details never touch our servers
      </p>
    </form>
  );
}

interface StripePaymentModalProps {
  clientSecret: string;
  amount: number;
  description?: string;
  onSuccess: () => void;
  onSkip: () => void;
  onClose: () => void;
}

export function StripePaymentModal({
  clientSecret,
  amount,
  description = "",
  onSuccess,
  onSkip,
  onClose,
}: StripePaymentModalProps) {
  if (!stripePromise) return null;

  return (
    <AnimatePresence>
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 26, stiffness: 220 }}
          className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-3xl p-6 pb-safe max-h-[92dvh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-400" />
              <h3 className="font-black text-lg">Confirm Payment</h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close"
              className="rounded-full"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

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
              onSuccess={onSuccess}
              onSkip={onSkip}
            />
          </Elements>
        </motion.div>
      </>
    </AnimatePresence>
  );
}
