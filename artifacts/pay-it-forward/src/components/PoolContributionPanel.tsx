import { useId } from "react";
import { DollarSign, Heart, Loader2 } from "lucide-react";

interface PoolContributionPanelProps {
  amount: string;
  setAmount: (value: string) => void;
  pending: boolean;
  onContinue: () => void;
  disabled?: boolean;
  title?: string;
  subtitle?: string;
}

const QUICK_AMOUNTS = [5, 10, 25, 50] as const;
export const MIN_POOL_AMOUNT = 1;
export const MAX_POOL_AMOUNT = 10_000;

/**
 * The primary launcher for funding the Community Pool.
 *
 * Keep this component independent from the payment provider: the parent owns
 * the contribution/donation request, while this component owns input
 * validation and the first, easy-to-reach action in the Pool tab.
 */
export function PoolContributionPanel({
  amount,
  setAmount,
  pending,
  onContinue,
  disabled = false,
  title = "Fund the Community Pool",
  subtitle = "Choose any amount. You will review your payment before money is contributed.",
}: PoolContributionPanelProps) {
  const id = useId().replace(/:/g, "");
  const headingId = `${id}-heading`;
  const amountId = `${id}-amount`;
  const errorId = `${id}-amount-error`;
  const hintId = `${id}-amount-hint`;
  const parsedAmount = Number(amount);
  const valid =
    Number.isFinite(parsedAmount) &&
    parsedAmount >= MIN_POOL_AMOUNT &&
    parsedAmount <= MAX_POOL_AMOUNT;
  const showError = amount.trim() !== "" && !valid;

  return (
    <section
      className="space-y-3 rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/20 via-primary/10 to-background p-4 shadow-[0_0_24px_rgba(0,212,255,0.08)]"
      aria-labelledby={headingId}
    >
      <div>
        <h2 id={headingId} className="flex items-center gap-2 text-base font-black">
          <Heart className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          {title}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
      </div>

      <div className="grid grid-cols-4 gap-2" role="group" aria-label="Quick contribution amounts">
        {QUICK_AMOUNTS.map((quickAmount) => {
          const selected = amount === String(quickAmount);
          return (
            <button
              key={quickAmount}
              type="button"
              onClick={() => setAmount(String(quickAmount))}
              disabled={pending || disabled}
              className={`min-h-[48px] rounded-xl border text-sm font-black transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                selected
                  ? "border-primary bg-primary text-primary-foreground shadow-[0_0_12px_rgba(0,212,255,0.35)]"
                  : "border-border bg-background/70 text-foreground hover:border-primary/50"
              }`}
              aria-pressed={selected}
            >
              ${quickAmount}
            </button>
          );
        })}
      </div>

      <div>
        <label
          htmlFor={amountId}
          className="text-[10px] font-black uppercase tracking-wider text-muted-foreground"
        >
          Custom amount
        </label>
        <div className="relative mt-1">
          <DollarSign
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-primary"
            aria-hidden="true"
          />
          <input
            id={amountId}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            type="number"
            inputMode="decimal"
            min={MIN_POOL_AMOUNT}
            max={MAX_POOL_AMOUNT}
            step="0.01"
            placeholder="0.00"
            disabled={pending || disabled}
            className="min-h-[52px] w-full rounded-2xl border border-primary/30 bg-background pl-10 pr-4 text-lg font-black focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
            aria-label="Contribution amount in dollars"
            aria-invalid={showError}
            aria-describedby={showError ? errorId : hintId}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={!valid || pending || disabled}
        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-black text-primary-foreground transition active:scale-[0.99] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Preparing secure payment…
          </>
        ) : (
          <>
            Continue to secure payment
            <Heart className="h-4 w-4" aria-hidden="true" />
          </>
        )}
      </button>

      {showError && (
        <p id={errorId} className="text-[11px] font-medium text-destructive" role="alert">
          Enter an amount from $1.00 to $10,000.00.
        </p>
      )}
      <p id={hintId} className="text-center text-[10px] text-muted-foreground">
        No card is charged until you confirm payment.
      </p>
    </section>
  );
}