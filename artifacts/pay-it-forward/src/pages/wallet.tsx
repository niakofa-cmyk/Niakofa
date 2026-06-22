import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { Wallet, TrendingUp, Heart, DollarSign, Gift, Clock, X, ArrowUpRight, ArrowDownLeft, Loader2, Calendar, CheckCircle, CreditCard, ExternalLink, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppContext } from "@/lib/AppContext";
import { KindnessImpactRing } from "@/components/KindnessImpactRing";
import { PayItForwardBadge } from "@/components/PayItForwardBadge";
import { RepaymentSchedulerModal } from "@/components/RepaymentSchedulerModal";
import { StripePaymentModal, isStripeConfigured } from "@/components/StripePaymentModal";
import { authHeaders } from "@/lib/auth";
import {
  useMakePledgePayment,
  useGetUserTransactions,
  useGetUserOutstandingPledges,
  useCreateScheduledPayment,
  useGetScheduledPayments,
  getGetUserTransactionsQueryKey,
  getGetUserOutstandingPledgesQueryKey,
  getGetScheduledPaymentsQueryKey,
} from "@workspace/api-client-react";
import type { Transaction, HelpRequest, ScheduledPayment } from "@workspace/api-client-react";

// ScheduledPayment extended with request_id returned by the backend
type ScheduledPaymentEx = ScheduledPayment & { request_id?: number };
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

function txIcon(type: Transaction["type"]) {
  if (type === "earned") return { Icon: ArrowDownLeft, color: "text-green-400" };
  if (type === "pledge_received") return { Icon: Heart, color: "text-primary" };
  if (type === "pledge_sent") return { Icon: ArrowUpRight, color: "text-yellow-400" };
  if (type === "goodwill") return { Icon: Gift, color: "text-purple-400" };
  if ((type as string) === "tip_received") return { Icon: DollarSign, color: "text-yellow-400" };
  return { Icon: DollarSign, color: "text-muted-foreground" };
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / 3600000;
  if (diffH < 1) return "Just now";
  if (diffH < 24) return `${Math.floor(diffH)} hr ago`;
  if (diffH < 48) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtScheduledDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Cancels a scheduled payment via DELETE /api/users/:id/scheduled-payment/:paymentId
async function cancelScheduledPaymentFetch(userId: number, paymentId: number): Promise<void> {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const res = await fetch(`${base}/api/users/${userId}/scheduled-payment/${paymentId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to cancel scheduled payment");
}

export default function WalletScreen() {
  const { t } = useTranslation();
  const { currentUser } = useAppContext();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [walletTab, setWalletTab] = useState<"activity" | "earnings">("activity");
  const [pledgeOpen, setPledgeOpen] = useState(false);
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [schedulerRequest, setSchedulerRequest] = useState<HelpRequest | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<HelpRequest | null>(null);
  const [pledgeAmount, setPledgeAmount] = useState("");
  const [pledgePayment, setPledgePayment] = useState<{ clientSecret: string; amount: number } | null>(null);
  const [creatingPaymentIntent, setCreatingPaymentIntent] = useState(false);

  // Pay Now state (for fulfilling scheduled payments immediately)
  const [payNowScheduled, setPayNowScheduled] = useState<ScheduledPaymentEx | null>(null);
  const [payNowPayment, setPayNowPayment] = useState<{ clientSecret: string; amount: number } | null>(null);
  const [creatingPayNowIntent, setCreatingPayNowIntent] = useState(false);
  const pledgeMutation = useMakePledgePayment();
  const scheduleMutation = useCreateScheduledPayment();

  const userId = currentUser?.id ?? 0;
  const { data: transactions = [], isLoading: txLoading } = useGetUserTransactions(userId, {
    query: { enabled: !!userId, queryKey: getGetUserTransactionsQueryKey(userId), staleTime: 30000 }
  });
  const { data: outstandingPledges = [] } = useGetUserOutstandingPledges(userId, {
    query: { enabled: !!userId, queryKey: getGetUserOutstandingPledgesQueryKey(userId) }
  });
  const { data: scheduledPayments = [] } = useGetScheduledPayments(userId, {
    query: { enabled: !!userId, queryKey: getGetScheduledPaymentsQueryKey(userId), staleTime: 60000 }
  });

  const cancelMutation = useMutation({
    mutationFn: ({ paymentId }: { paymentId: number }) =>
      cancelScheduledPaymentFetch(userId, paymentId),
    onSuccess: (_data, { paymentId: _pid }) => {
      toast({ title: "Scheduled payment cancelled" });
      queryClient.invalidateQueries({ queryKey: getGetScheduledPaymentsQueryKey(userId) });
    },
    onError: () => toast({ title: "Could not cancel — please try again", variant: "destructive" }),
  });

  // Stripe Connect status (helpers only)
  const [stripeStatus, setStripeStatus] = useState<{
    connected: boolean;
    payoutsEnabled?: boolean;
    chargesEnabled?: boolean;
  } | null>(null);
  const [stripeOnboarding, setStripeOnboarding] = useState(false);

  useEffect(() => {
    if (!currentUser?.is_helper || !userId) return;
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    fetch(`${base}/api/stripe/connect/status/${userId}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(setStripeStatus)
      .catch(() => setStripeStatus({ connected: false }));
  }, [userId, currentUser?.is_helper]);

  const handleStripeOnboard = async () => {
    if (!currentUser) return;
    setStripeOnboarding(true);
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const res = await fetch(`${base}/api/stripe/connect/onboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ userId: currentUser.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { setup?: string };
        toast({ title: err.setup ?? "Payout setup not available yet", variant: "destructive" });
        return;
      }
      const data = await res.json() as { url: string };
      window.open(data.url, "_blank", "noopener noreferrer");
    } catch {
      toast({ title: "Could not start payout setup", variant: "destructive" });
    } finally {
      setStripeOnboarding(false);
    }
  };

  const wallet = currentUser?.benevolence_wallet ?? 0;
  const goodwill = currentUser?.goodwill_score ?? 0;
  const helpCount = currentUser?.help_count ?? 0;
  const trustScore = currentUser?.trust_score ?? 0;

  const totalEarned = transactions.filter(t => t.type === "earned").reduce((s, t) => s + t.amount, 0);
  const totalReceived = transactions.filter(t => t.type === "pledge_received").reduce((s, t) => s + t.amount, 0);
  const totalTips = transactions.filter(t => (t.type as string) === "tip_received").reduce((s, t) => s + t.amount, 0);
  const earningsTransactions = transactions.filter(t => t.type === "earned" || (t.type as string) === "tip_received");

  const livesImpacted = helpCount + goodwill;

  const pendingScheduled = (scheduledPayments as ScheduledPayment[]).filter(p => p.status === "pending");

  const sendHonorSystemPledge = (amt: number) => {
    if (!currentUser || !selectedRequest) return;
    pledgeMutation.mutate(
      { id: currentUser.id, data: { request_id: selectedRequest.id, amount: amt } },
      {
        onSuccess: () => {
          toast({ title: "Contribution sent!", description: `$${amt.toFixed(2)} forwarded to your helper.` });
          setSelectedRequest(null);
          setPledgeAmount("");
          setPledgeOpen(false);
          queryClient.invalidateQueries({ queryKey: getGetUserTransactionsQueryKey(userId) });
          queryClient.invalidateQueries({ queryKey: getGetUserOutstandingPledgesQueryKey(userId) });
        },
        onError: () => toast({ title: "Failed to send contribution", variant: "destructive" }),
      }
    );
  };

  const handlePledge = async () => {
    const amt = parseFloat(pledgeAmount);
    if (!currentUser || !selectedRequest || !amt || amt <= 0) {
      toast({ title: "Select a request and enter an amount", variant: "destructive" });
      return;
    }

    // When Stripe is configured, create a PaymentIntent and show the payment modal.
    // On success (or skip), the DB pledge is still recorded via sendHonorSystemPledge.
    if (isStripeConfigured()) {
      setCreatingPaymentIntent(true);
      try {
        const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
        const res = await fetch(`${base}/api/stripe/payment-intent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            requestId: selectedRequest.id,
            amount: amt,
            requesterId: currentUser.id,
            helperId: selectedRequest.helper_id ?? undefined,
          }),
        });
        if (res.ok) {
          const { clientSecret } = await res.json() as { clientSecret: string };
          setPledgePayment({ clientSecret, amount: amt });
          return; // payment modal takes over
        }
        // 503 = Stripe not configured server-side — fall through to honor system
        if (res.status !== 503) {
          const err = await res.json() as { error?: string };
          toast({ title: "Could not start payment", description: err.error ?? "Falling back to honor system." });
        }
      } catch {
        // network error — fall through to honor system
      } finally {
        setCreatingPaymentIntent(false);
      }
    }

    // Stripe not configured or API call failed — proceed as honor system pledge
    sendHonorSystemPledge(amt);
  };

  // ── Pay Now (fulfil a scheduled payment immediately) ────────────────────────
  const fulfillScheduledNow = (sp: ScheduledPaymentEx, amt: number) => {
    const reqId = sp.request_id;
    if (!currentUser) return;

    const afterPledge = () => {
      cancelMutation.mutate(
        { paymentId: sp.id },
        {
          onSuccess: () => {
            toast({
              title: "Payment sent!",
              description: `$${amt.toFixed(2)} paid forward. Scheduled payment completed.`,
            });
            queryClient.invalidateQueries({ queryKey: getGetUserTransactionsQueryKey(userId) });
            queryClient.invalidateQueries({ queryKey: getGetUserOutstandingPledgesQueryKey(userId) });
            setPayNowScheduled(null);
            setPayNowPayment(null);
          },
        }
      );
    };

    if (reqId) {
      pledgeMutation.mutate(
        { id: currentUser.id, data: { request_id: reqId, amount: amt } },
        {
          onSuccess: afterPledge,
          onError: () => toast({ title: "Payment failed — please try again", variant: "destructive" }),
        }
      );
    } else {
      afterPledge();
    }
  };

  const handlePayNowScheduled = async (sp: ScheduledPaymentEx) => {
    const amt = sp.amount;
    const reqId = sp.request_id;
    setPayNowScheduled(sp);

    if (reqId && isStripeConfigured()) {
      setCreatingPayNowIntent(true);
      try {
        const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
        const res = await fetch(`${base}/api/stripe/payment-intent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            requestId: reqId,
            amount: amt,
            requesterId: currentUser?.id,
            paymentType: "pay_it_forward",
          }),
        });
        if (res.ok) {
          const { clientSecret } = (await res.json()) as { clientSecret: string };
          setPayNowPayment({ clientSecret, amount: amt });
          return; // StripePaymentModal takes over
        }
      } catch {
        // fall through to honor system
      } finally {
        setCreatingPayNowIntent(false);
      }
    }

    // Stripe not available — honor-system pledge
    fulfillScheduledNow(sp, amt);
  };

  const handleSchedule = (date: Date, amount: number) => {
    if (!currentUser || !schedulerRequest) {
      toast({ title: "No request selected", variant: "destructive" });
      return;
    }
    scheduleMutation.mutate(
      {
        id: currentUser.id,
        data: {
          request_id: schedulerRequest.id,
          amount,
          scheduled_date: date.toISOString(),
        },
      },
      {
        onSuccess: () => {
          // Honest copy: no cron/auto-reminder exists yet — don't over-promise
          toast({
            title: "Payment Scheduled",
            description: `$${amount.toFixed(2)} saved for ${date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}. You can find it under Upcoming Payments anytime.`,
          });
          queryClient.invalidateQueries({ queryKey: getGetScheduledPaymentsQueryKey(userId) });
        },
        onError: () => toast({ title: "Failed to save schedule — please try again", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col pb-24">
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl border-b border-border p-4 pt-safe">
        <h1 className="text-xl font-black uppercase tracking-widest flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" /> {t("wallet.wallet")}
        </h1>
      </div>

      <div className="flex-1 p-4 space-y-5 max-w-lg mx-auto w-full">

        {/* Emotional Wallet — KindnessImpactRing */}
        <div className="bg-gradient-to-br from-primary/20 via-primary/5 to-background border border-primary/30 rounded-3xl p-6 shadow-[0_0_40px_rgba(0,212,255,0.1)] flex flex-col items-center gap-4">
          <KindnessImpactRing
            livesImpacted={livesImpacted}
            helpCount={helpCount}
            goodwillScore={goodwill}
            size={160}
          />
          <div className="text-center">
            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">{t("wallet.goodwill_fund")}</div>
            <div className="text-4xl font-black text-primary">${wallet.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{t("wallet.donations_goodwill_amp_community_support")}</div>
          </div>
          <div className="grid grid-cols-3 gap-3 w-full">
            <div className="bg-background/40 rounded-xl p-3 text-center">
              <div className="text-xl font-black text-green-400">${totalEarned.toFixed(0)}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{t("wallet.earned")}</div>
            </div>
            <div className="bg-background/40 rounded-xl p-3 text-center">
              <div className="text-xl font-black text-primary">${totalReceived.toFixed(0)}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{t("wallet.received")}</div>
            </div>
            <div className="bg-background/40 rounded-xl p-3 text-center">
              <div className="text-xl font-black text-purple-400">{goodwill}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{t("wallet.goodwill_label")}</div>
            </div>
          </div>
        </div>

        {/* Community Badge */}
        <PayItForwardBadge helpCount={helpCount} trustScore={trustScore} />

        {/* Stripe Connect — payout setup for helpers */}
        {currentUser?.is_helper && stripeStatus !== null && (
          stripeStatus.payoutsEnabled ? (
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                <CheckCircle className="w-4 h-4 text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-black text-sm text-green-400">{t("wallet.payouts_active")}</div>
                <div className="text-[10px] text-muted-foreground">{t("wallet.earnings_transfer_to_your_bank_via")}</div>
              </div>
            </div>
          ) : (
            <div className="bg-card border border-primary/30 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <CreditCard className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-sm">{t("wallet.enable_real_payouts")}</div>
                  <div className="text-[10px] text-muted-foreground">{t("wallet.connect_your_bank_account_via_stripe")}</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("wallet.set_up_stripe_connect_to_receive")}
              </p>
              <Button
                className="w-full h-10 font-black text-sm"
                onClick={handleStripeOnboard}
                disabled={stripeOnboarding}
              >
                {stripeOnboarding ? (
                  <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{t("wallet.opening_stripe")}</span>
                ) : (
                  <span className="flex items-center gap-2"><ExternalLink className="w-4 h-4" />{t("wallet.set_up_payouts_via_stripe")}</span>
                )}
              </Button>
            </div>
          )
        )}

        {/* Activity / Earnings tab switcher — helpers only */}
        {currentUser?.is_helper && (
          <div className="flex bg-muted rounded-2xl p-1">
            {(["activity", "earnings"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setWalletTab(tab)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider transition-all ${
                  walletTab === tab
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                {tab === "activity" ? "Activity" : "Earnings"}
              </button>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => setPledgeOpen(true)}
            className="bg-primary/10 border-2 border-primary/40 hover:border-primary/70 rounded-2xl p-4 flex flex-col items-center gap-2 transition-all group"
          >
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Heart className="w-5 h-5 text-primary" />
            </div>
            <div className="text-sm font-black">{t("wallet.pay_forward")}</div>
            <div className="text-[10px] text-muted-foreground text-center">{t("wallet.contribute")}</div>
          </button>
          <button
            onClick={() => {
              const first = outstandingPledges[0] ?? null;
              setSchedulerRequest(first);
              setSchedulerOpen(true);
            }}
            className="bg-purple-500/10 border-2 border-purple-500/30 hover:border-purple-500/60 rounded-2xl p-4 flex flex-col items-center gap-2 transition-all group"
          >
            <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-purple-400" />
            </div>
            <div className="text-sm font-black text-purple-400">{t("wallet.schedule")}</div>
            <div className="text-[10px] text-muted-foreground text-center">{t("wallet.plan_repayment")}</div>
          </button>
          <button
            onClick={() => setLocation("/recurring")}
            className="bg-cyan-500/10 border-2 border-cyan-500/30 hover:border-cyan-500/60 rounded-2xl p-4 flex flex-col items-center gap-2 transition-all group"
            aria-label={t("wallet.manage_recurring_help_requests")}
          >
            <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
              <RotateCcw className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="text-sm font-black text-cyan-400">{t("wallet.recurring")}</div>
            <div className="text-[10px] text-muted-foreground text-center">{t("wallet.autoschedule")}</div>
          </button>
        </div>

        {/* Scheduled Payments — real records from DB with cancel button */}
        {pendingScheduled.length > 0 && (
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-purple-400" /> {t("wallet.upcoming_payments")}
            </h2>
            <div className="space-y-2">
              {pendingScheduled.map(sp => {
                const spEx = sp as ScheduledPaymentEx;
                const isPayingThis = payNowScheduled?.id === sp.id;
                return (
                  <div key={sp.id} className="bg-card border border-purple-500/30 rounded-xl p-3.5 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0">
                      <Calendar className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-purple-300">
                        ${sp.amount.toFixed(2)} {t("wallet.scheduled_label")}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {t("wallet.due")} {fmtScheduledDate(sp.scheduled_date)}
                        {sp.note && <> · <span className="italic">{sp.note}</span></>}
                      </div>
                    </div>
                    {/* Pay Now — fulfil immediately */}
                    <button
                      onClick={() => handlePayNowScheduled(spEx)}
                      disabled={isPayingThis && (creatingPayNowIntent || pledgeMutation.isPending)}
                      className="flex items-center gap-1 text-[10px] font-black text-primary bg-primary/10 border border-primary/30 hover:border-primary/60 px-2.5 py-1.5 rounded-lg transition-all shrink-0"
                      title={t("wallet.pay_this_now")}
                    >
                      {isPayingThis && (creatingPayNowIntent || pledgeMutation.isPending) ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Play className="w-3 h-3" />
                      )}
                      {t("wallet.pay_now")}
                    </button>
                    {/* Cancel */}
                    <button
                      onClick={() => cancelMutation.mutate({ paymentId: sp.id })}
                      disabled={cancelMutation.isPending}
                      className="w-11 h-11 rounded-full bg-muted hover:bg-destructive/10 hover:text-destructive border border-border flex items-center justify-center transition-colors shrink-0"
                      title={t("wallet.cancel_scheduled_payment")}
                    >
                      {cancelMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <X className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Outstanding Pledges — with scheduler CTA */}
        {outstandingPledges.length > 0 && (
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" /> {t("wallet.outstanding_pledges")}
            </h2>
            <div className="space-y-2">
              {outstandingPledges.map(r => {
                const outstanding = (r.pledge_amount ?? 0) - (r.pledge_paid ?? 0);
                return (
                  <div key={r.id} className="bg-card border border-yellow-500/30 rounded-xl p-3.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{r.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {t("wallet.outstanding")} <span className="text-yellow-400 font-bold">${outstanding.toFixed(2)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => { setSchedulerRequest(r); setSchedulerOpen(true); }}
                      className="text-[10px] font-black text-purple-400 bg-purple-500/10 border border-purple-500/30 px-2.5 py-1.5 rounded-lg hover:border-purple-500/60 transition-all flex items-center gap-1 shrink-0"
                    >
                      <Calendar className="w-3 h-3" /> {t("wallet.schedule_2")}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-green-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("wallet.paid_jobs")}</span>
            </div>
            <div className="text-2xl font-black text-green-400">${totalEarned.toFixed(0)}</div>
            <div className="text-xs text-muted-foreground">
              {t("wallet.from")} {transactions.filter(t => t.type === "earned").length} {t("wallet.immediatepay_jobs")}
            </div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Gift className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("wallet.goodwill_acts")}</span>
            </div>
            <div className="text-2xl font-black text-purple-400">{goodwill}</div>
            <div className="text-xs text-muted-foreground">{t("wallet.volunteer_missions")}</div>
          </div>
        </div>

        {/* Activity History — hidden on Earnings tab for helpers */}
        {(!currentUser?.is_helper || walletTab === "activity") && (
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" /> {t("wallet.activity_history")}
            </h2>
            {txLoading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">{t("wallet.loading_history")}</span>
              </div>
            )}
            {!txLoading && transactions.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {t("wallet.no_transactions_yet_complete_a_job")}
              </div>
            )}
            <div className="space-y-2">
              {transactions.map(tx => {
                const { Icon, color } = txIcon(tx.type);
                return (
                  <div key={tx.id} className="flex items-center gap-3 bg-card border border-border rounded-xl p-3.5">
                    <div className="w-8 h-8 rounded-full bg-card flex items-center justify-center border border-border shrink-0">
                      <Icon className={`w-4 h-4 ${color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{tx.description ?? tx.type}</div>
                      <div className="text-[10px] text-muted-foreground">{fmtDate(tx.created_at)}</div>
                    </div>
                    {tx.type === "goodwill" ? (
                      <div className="text-[10px] text-purple-400 font-bold shrink-0">{t("wallet.goodwill_2")}</div>
                    ) : (
                      <div className={`font-black text-sm shrink-0 ${tx.amount > 0 ? "text-green-400" : "text-muted-foreground"}`}>
                        {tx.amount > 0 ? "+" : ""}${Math.abs(tx.amount).toFixed(2)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Helper Earnings Tab */}
        {currentUser?.is_helper && walletTab === "earnings" && (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 text-center">
                <div className="text-2xl font-black text-green-400">${totalEarned.toFixed(2)}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{t("wallet.paid_jobs_2")}</div>
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 text-center">
                <div className="text-2xl font-black text-yellow-400">${totalTips.toFixed(2)}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{t("wallet.tips_received")}</div>
              </div>
            </div>
            <div className="bg-primary/10 border border-primary/30 rounded-2xl p-4 text-center">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{t("wallet.total_lifetime_earnings")}</div>
              <div className="text-3xl font-black text-primary">${(totalEarned + totalTips).toFixed(2)}</div>
            </div>

            {/* Payout status */}
            {stripeStatus !== null && (
              stripeStatus.payoutsEnabled ? (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3.5 flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                  <div className="text-sm font-bold text-green-400">{t("wallet.bank_payouts_active_via_stripe_connect")}</div>
                </div>
              ) : (
                <div className="bg-card border border-primary/30 rounded-xl p-3.5 space-y-2">
                  <div className="text-sm font-bold">{t("wallet.connect_your_bank_to_receive_payouts")}</div>
                  <p className="text-xs text-muted-foreground">
                    {t("wallet.immediatepay_earnings_stay_in_your_goodwill")}
                  </p>
                  <Button className="w-full h-10 font-black text-sm" onClick={handleStripeOnboard} disabled={stripeOnboarding}>
                    {stripeOnboarding ? (
                      <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{t("wallet.opening")}</span>
                    ) : (
                      <span className="flex items-center gap-2"><ExternalLink className="w-4 h-4" />{t("wallet.set_up_payouts")}</span>
                    )}
                  </Button>
                </div>
              )
            )}

            {/* Earnings transaction list */}
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-400" /> {t("wallet.earnings_history")}
              </h2>
              {txLoading && (
                <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">{t("wallet.loading")}</span>
                </div>
              )}
              {!txLoading && earningsTransactions.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {t("wallet.no_earnings_yet_complete_a_paid")}
                </div>
              )}
              <div className="space-y-2">
                {earningsTransactions.map(tx => {
                  const { Icon, color } = txIcon(tx.type);
                  const label = (tx.type as string) === "tip_received" ? "Tip" : "Earned";
                  return (
                    <div key={tx.id} className="flex items-center gap-3 bg-card border border-border rounded-xl p-3.5">
                      <div className="w-8 h-8 rounded-full bg-card flex items-center justify-center border border-border shrink-0">
                        <Icon className={`w-4 h-4 ${color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{tx.description ?? tx.type}</div>
                        <div className="text-[10px] text-muted-foreground">{fmtDate(tx.created_at)} · {label}</div>
                      </div>
                      <div className="font-black text-sm text-green-400 shrink-0">
                        +${Math.abs(tx.amount).toFixed(2)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="bg-card/50 border border-border/50 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <DollarSign className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <div className="font-bold text-sm mb-1">{t("wallet.pay_what_you_can_when_you")}</div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("wallet.no_deadlines_no_pressure_when_youre")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Niakofa Drawer */}
      <AnimatePresence>
        {pledgeOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
              onClick={() => { setPledgeOpen(false); setSelectedRequest(null); setPledgeAmount(""); }}
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 220 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-3xl p-6 pb-safe space-y-4 max-h-[90dvh] overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Heart className="w-5 h-5 text-primary" />
                  <h3 className="font-black text-lg">{t("wallet.niakofa")}</h3>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { setPledgeOpen(false); setSelectedRequest(null); setPledgeAmount(""); }} className="rounded-full">
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("wallet.every_contribution_pays_your_helper_directly")}
              </p>

              {outstandingPledges.length > 0 ? (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{t("wallet.your_requests_with_outstanding_balance")}</div>
                  <div className="space-y-2">
                    {outstandingPledges.map(r => {
                      const outstanding = (r.pledge_amount ?? 0) - (r.pledge_paid ?? 0);
                      const isSelected = selectedRequest?.id === r.id;
                      return (
                        <button
                          key={r.id}
                          onClick={() => setSelectedRequest(isSelected ? null : r)}
                          className={`w-full text-left rounded-xl p-3.5 border transition-all ${
                            isSelected
                              ? "border-primary bg-primary/10"
                              : "border-border bg-background hover:border-primary/50"
                          }`}
                        >
                          <div className="font-semibold text-sm truncate">{r.title}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {t("wallet.outstanding_2")} <span className="text-yellow-400 font-bold">${outstanding.toFixed(2)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="bg-muted/50 rounded-xl p-4 text-center text-sm text-muted-foreground">
                  {t("wallet.no_outstanding_pledges_right_now")}
                </div>
              )}

              <Input
                type="number"
                placeholder={t("wallet.amount_any_amount")}
                value={pledgeAmount}
                onChange={e => setPledgeAmount(e.target.value)}
                className="bg-background border-border"
                disabled={!selectedRequest}
              />
              {selectedRequest && (
                <p className="text-xs text-muted-foreground -mt-2">
                  {t("wallet.contributing_to")} <span className="text-primary font-semibold">{selectedRequest.title}</span>
                </p>
              )}
              <Button
                className="w-full h-12 font-black"
                onClick={handlePledge}
                disabled={pledgeMutation.isPending || creatingPaymentIntent || !selectedRequest || !pledgeAmount}
              >
                {creatingPaymentIntent ? (
                  <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{t("wallet.setting_up_payment")}</span>
                ) : pledgeMutation.isPending ? (
                  "Sending..."
                ) : (
                  "Send Contribution"
                )}
              </Button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Stripe Payment Modal — shown when pledging with real card payment */}
      {pledgePayment && (
        <StripePaymentModal
          clientSecret={pledgePayment.clientSecret}
          amount={pledgePayment.amount}
          description={
            selectedRequest
              ? `Niakofa for: "${selectedRequest.title}". Your helper receives funds directly.`
              : "Niakofa contribution"
          }
          onSuccess={() => {
            const amt = pledgePayment.amount;
            setPledgePayment(null);
            sendHonorSystemPledge(amt);
          }}
          onSkip={() => {
            const amt = pledgePayment.amount;
            setPledgePayment(null);
            sendHonorSystemPledge(amt);
          }}
          onClose={() => {
            setPledgePayment(null);
          }}
        />
      )}

      {/* Stripe Payment Modal — Pay Now for a scheduled payment */}
      {payNowPayment && payNowScheduled && (
        <StripePaymentModal
          clientSecret={payNowPayment.clientSecret}
          amount={payNowPayment.amount}
          description={`Niakofa — fulfilling your scheduled $${payNowPayment.amount.toFixed(2)} contribution`}
          onSuccess={() => {
            const sp = payNowScheduled;
            const amt = payNowPayment.amount;
            setPayNowPayment(null);
            fulfillScheduledNow(sp, amt);
          }}
          onSkip={() => {
            const sp = payNowScheduled;
            const amt = payNowPayment.amount;
            setPayNowPayment(null);
            fulfillScheduledNow(sp, amt);
          }}
          onClose={() => {
            setPayNowPayment(null);
            setPayNowScheduled(null);
          }}
        />
      )}

      {/* Repayment Scheduler Modal — wired to real API */}
      <RepaymentSchedulerModal
        open={schedulerOpen}
        onClose={() => setSchedulerOpen(false)}
        request={schedulerRequest}
        onSchedule={handleSchedule}
        isScheduling={scheduleMutation.isPending}
      />
    </div>
  );
}
