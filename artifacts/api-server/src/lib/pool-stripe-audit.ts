export interface PoolPaymentIntentAuditInput {
  id: string;
  status: string;
  amount: number;
  amount_received: number;
  currency: string;
  livemode: boolean;
  created: number;
  description?: string | null;
  metadata?: Record<string, string>;
}

export interface PoolPaymentIntentLedgerRecord {
  paymentIntentId: string | null;
  ledgerId: number | null;
  financialEventId: number | null;
}

export interface MissingPoolPaymentIntentRecord {
  payment_intent_id: string;
  amount: number;
  currency: string;
  status: string;
  livemode: boolean;
  created: number;
  user_id: number | null;
  community_id: number | null;
  description: string | null;
  missing_ledger: boolean;
  missing_financial_event: boolean;
  duplicate_ledger_count: number;
}

export function findMissingPoolPaymentIntentRecords(
  paymentIntents: PoolPaymentIntentAuditInput[],
  ledgerRecords: PoolPaymentIntentLedgerRecord[],
): MissingPoolPaymentIntentRecord[] {
  const recordsByPaymentIntent = new Map<string, PoolPaymentIntentLedgerRecord[]>();
  for (const record of ledgerRecords) {
    if (!record.paymentIntentId) continue;
    const records = recordsByPaymentIntent.get(record.paymentIntentId) ?? [];
    records.push(record);
    recordsByPaymentIntent.set(record.paymentIntentId, records);
  }

  return paymentIntents.flatMap(paymentIntent => {
    if (paymentIntent.status !== "succeeded" || paymentIntent.metadata?.["pool_contribution"] !== "true") {
      return [];
    }

    const records = recordsByPaymentIntent.get(paymentIntent.id) ?? [];
    const missingLedger = records.length === 0 || records.some(record => record.ledgerId == null);
    const missingFinancialEvent =
      records.length === 0 || records.some(record => record.financialEventId == null);
    const duplicateLedgerCount = Math.max(0, records.length - 1);
    if (!missingLedger && !missingFinancialEvent && duplicateLedgerCount === 0) return [];

    const metadata = paymentIntent.metadata ?? {};
    const parsedUserId = Number(metadata["user_id"]);
    const parsedCommunityId = Number(metadata["community_id"]);
    return [{
      payment_intent_id: paymentIntent.id,
      amount: (paymentIntent.amount_received || paymentIntent.amount) / 100,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
      livemode: paymentIntent.livemode,
      created: paymentIntent.created,
      user_id: Number.isFinite(parsedUserId) && parsedUserId > 0 ? parsedUserId : null,
      community_id: Number.isFinite(parsedCommunityId) && parsedCommunityId > 0 ? parsedCommunityId : null,
      description: paymentIntent.description ?? null,
      missing_ledger: missingLedger,
      missing_financial_event: missingFinancialEvent,
      duplicate_ledger_count: duplicateLedgerCount,
    }];
  });
}
