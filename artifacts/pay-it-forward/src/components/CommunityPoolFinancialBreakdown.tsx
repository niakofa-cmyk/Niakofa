interface CommunityPoolFinancialBreakdownProps {
  grossAmountCents: number;
  stripeFeeCents: number;
  climateContributionCents: number;
  netAmountCents: number;
  /** Track A: Stripe records were independently verified. */
  stripeVerificationStatus?: string | null;
  /** Track B: Niakofa has or has not confirmed release of funds. */
  settlementStatus?: string | null;
  availableOn?: string | Date | null;
  paidOutAt?: string | Date | null;
  paidOutReference?: string | null;
  stripeBalanceTransactionId?: string | null;
  stripeClimateTransactionId?: string | null;
}

function formatCents(cents: number): string {
  return (Number(cents || 0) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toneClass(tone: "good" | "warn" | "bad"): string {
  if (tone === "good") return "text-green-400";
  if (tone === "bad") return "text-red-400";
  return "text-yellow-400";
}

function verificationLabel(status?: string | null): { text: string; tone: "good" | "warn" | "bad" } {
  if (status === "verified") return { text: "Stripe verified", tone: "good" };
  if (status === "verification_failed") return { text: "Stripe verification failed", tone: "bad" };
  return { text: "Verifying with Stripe…", tone: "warn" };
}

function settlementLabel(status?: string | null): { text: string; tone: "good" | "warn" | "bad" } {
  if (status === "available") return { text: "Available", tone: "good" };
  if (status === "paid_out") return { text: "Paid out", tone: "good" };
  if (status === "failed") return { text: "Settlement failed", tone: "bad" };
  return { text: "Settlement pending", tone: "warn" };
}

/**
 * Publicly explains why a contribution's gross amount and spendable pool
 * credit differ. All values come from Stripe settlement data, not estimates.
 */
export function CommunityPoolFinancialBreakdown({
  grossAmountCents,
  stripeFeeCents,
  climateContributionCents,
  netAmountCents,
  stripeVerificationStatus,
  settlementStatus,
  availableOn,
  paidOutAt,
  paidOutReference,
  stripeBalanceTransactionId,
  stripeClimateTransactionId,
}: CommunityPoolFinancialBreakdownProps) {
  const verification = verificationLabel(stripeVerificationStatus);
  const settlement = settlementLabel(settlementStatus);
  const availableText = availableOn
    ? new Date(availableOn).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  return (
    <div className="mt-2 rounded-lg border border-border/50 bg-background/50 px-2.5 py-2 text-[10px]">
       <div className="mb-1.5 font-bold uppercase tracking-wider text-muted-foreground">Financial breakdown</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
        <span>Gross contribution</span>
        <span className="text-right text-foreground">${formatCents(grossAmountCents)}</span>
        <span>Stripe fee</span>
        <span className="text-right">−${formatCents(stripeFeeCents)}</span>
        <span>Climate deduction</span>
        <span className="text-right">−${formatCents(climateContributionCents)}</span>
        <span className="font-bold text-foreground">Pool funds</span>
        <span className="text-right font-bold text-green-400">${formatCents(netAmountCents)}</span>
      </div>
      <div className="mt-2 space-y-0.5 border-t border-border/40 pt-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Stripe verification</span>
          <span className={toneClass(verification.tone)}>{verification.text}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Settlement</span>
          <span className={toneClass(settlement.tone)}>{settlement.text}</span>
        </div>
      </div>
      {availableText && settlementStatus !== "available" && settlementStatus !== "paid_out" && (
        <div className="mt-1 text-muted-foreground">Expected available {availableText}</div>
      )}
      {settlementStatus === "paid_out" && paidOutAt && (
        <div className="mt-1 text-muted-foreground">
          Released {new Date(paidOutAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          {paidOutReference ? ` · ${paidOutReference}` : ""}
        </div>
      )}
      {stripeBalanceTransactionId && (
        <div className="mt-1 truncate text-muted-foreground/60" title={stripeBalanceTransactionId}>
          Stripe settlement linked · {stripeBalanceTransactionId}
        </div>
      )}
      {stripeClimateTransactionId && (
        <div className="truncate text-muted-foreground/60" title={stripeClimateTransactionId}>
          Climate contribution linked · {stripeClimateTransactionId}
        </div>
      )}
    </div>
  );
}