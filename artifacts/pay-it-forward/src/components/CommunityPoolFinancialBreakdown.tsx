interface CommunityPoolFinancialBreakdownProps {
  grossAmountCents: number;
  stripeFeeCents: number;
  climateContributionCents: number;
  netAmountCents: number;
  settlementStatus?: string | null;
  availableOn?: string | Date | null;
  stripeBalanceTransactionId?: string | null;
}

function formatCents(cents: number): string {
  return (Number(cents || 0) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function statusLabel(status?: string | null): string {
  if (status === "available") return "Available";
  if (status === "paid_out") return "Paid out";
  if (status === "failed") return "Failed";
  return "Pending settlement";
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
  settlementStatus,
  availableOn,
  stripeBalanceTransactionId,
}: CommunityPoolFinancialBreakdownProps) {
  const status = settlementStatus ?? "pending";
  const availableText = availableOn
    ? new Date(availableOn).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  return (
    <div className="mt-2 rounded-lg border border-border/50 bg-background/50 px-2.5 py-2 text-[10px]">
      <div className="mb-1.5 flex items-center justify-between gap-2 font-bold uppercase tracking-wider text-muted-foreground">
        <span>Financial breakdown</span>
        <span className={status === "available" || status === "paid_out" ? "text-green-400" : "text-yellow-400"}>
          {statusLabel(status)}
        </span>
      </div>
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
      {availableText && status !== "available" && status !== "paid_out" && (
        <div className="mt-1 text-muted-foreground">Expected available {availableText}</div>
      )}
      {stripeBalanceTransactionId && (
        <div className="mt-1 truncate text-muted-foreground/60" title={stripeBalanceTransactionId}>
          Stripe settlement linked
        </div>
      )}
    </div>
  );
}