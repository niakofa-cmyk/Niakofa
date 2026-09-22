import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, TrendingUp, Heart, DollarSign, Gift, Clock, X, ArrowUpRight, ArrowDownLeft, Loader2, Calendar, CheckCircle, CreditCard, ExternalLink, Play, BanknoteIcon, LifeBuoy, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { newOperationKey, retryableMutation } from "@/lib/retryableMutation";
import { KindnessImpactRing } from "@/components/KindnessImpactRing";
import { PayItForwardBadge } from "@/components/PayItForwardBadge";
import { RepaymentSchedulerModal } from "@/components/RepaymentSchedulerModal";
import { StripePaymentModal, isStripeConfigured } from "@/components/StripePaymentModal";
import {
  useMakePledgePayment,
  useGetUserOutstandingPledges,
  useCreateScheduledPayment,
  useGetScheduledPayments,
  getGetUserOutstandingPledgesQueryKey,
  getGetScheduledPaymentsQueryKey,
} from "@workspace/api-client-react";
import type { Transaction, HelpRequest, ScheduledPayment } from "@workspace/api-client-react";

// ScheduledPayment extended with request_id returned by the backend
type ScheduledPaymentEx = ScheduledPayment & { request_id?: number };
import { useQueryClient, useMutation, keepPreviousData } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

function txIcon(type: Transaction["type"]) {
  if (type === "earned") return { Icon: ArrowDownLeft, color: "text-green-400" };
  if (type === "pledge_received") return { Icon: Heart, color: "text-primary" };
  if (type === "pledge_sent") return { Icon: ArrowUpRight, color: "text-yellow-400" };
  if (type === "goodwill") return { Icon: Gift, color: "text-purple-400" };
  if ((type as string) === "tip_received") return { Icon: DollarSign, color: "text-yellow-400" };
  if ((type as string) === "tip_sent")     return { Icon: ArrowUpRight, color: "text-orange-400" };
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
  const { currentUser } = useAppContext();
  const queryClient = useQueryClient();
  const [walletTab, setWalletTab] = useState<"activity" | "earnings">("activity");
  const [pledgeOpen, setPledgeOpen] = useState(false);
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [schedulerRequest, setSchedulerRequest] = useState<HelpRequest | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<HelpRequest | null>(null);
  const [paymentDestination, setPaymentDestination] = useState<"original_fund" | "helper">("original_fund");
  const [pledgeAmount, setPledgeAmount] = useState("");
  const [pledgePayment, setPledgePayment] = useState<{
    clientSecret: string;
    amount: number;
    destination: "original_fund" | "helper";
  } | null>(null);
  const [creatingPaymentIntent, setCreatingPaymentIntent] = useState(false);

  // Pay Now state (for fulfilling scheduled payments immediately via Stripe)
  const [payNowScheduled, setPayNowScheduled] = useState<ScheduledPaymentEx | null>(null);
  const [payNowPayment, setPayNowPayment] = useState<{ clientSecret: string; amount: number } | null>(null);
  const [creatingPayNowIntent, setCreatingPayNowIntent] = useState(false);

  // Pay from Balance state — no card entry needed
  const [payFromBalanceId, setPayFromBalanceId] = useState<number | null>(null);
  const pledgeMutation = useMakePledgePayment();
  const scheduleMutation = useCreateScheduledPayment();

  const userId = currentUser?.id ?? 0;

  // ── Paginated transaction history ─────────────────────────────────────────
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txOffset, setTxOffset] = useState(0);
  const [txHasMore, setTxHasMore] = useState(false);
  const [txLoadingMore, setTxLoadingMore] = useState(false);
  const txLoadedRef = useRef(false);
  const TX_PAGE_SIZE = 50;

  // Pending-tip banner — populated when TipModal redirects here after a 402
  // (insufficient_balance). Dismissed manually; URL params cleaned on mount.
  const [pendingTip, setPendingTip] = useState<{
    amount: number;
    requestId: number;
    helperName: string;
  } | null>(null);

  const fetchTransactions = async (offset: number, append: boolean) => {
    if (!userId) return;
    if (append) setTxLoadingMore(true);
    else if (!txLoadedRef.current) setTxLoading(true);
    try {
      const res = await fetch(
        `/api/users/${userId}/transactions?limit=${TX_PAGE_SIZE}&offset=${offset}`,
        { headers: authHeaders() }
      );
      if (!res.ok) return;
      const data = (await res.json()) as Transaction[];
      const hasMore = res.headers.get("X-Has-More") === "true";
      setTransactions(prev => append ? [...prev, ...data] : data);
      setTxHasMore(hasMore);
      setTxOffset(offset + data.length);
      txLoadedRef.current = true;
    } finally {
      setTxLoading(false);
      setTxLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!userId) return;
    setTxOffset(0);
    setTransactions([]);
    txLoadedRef.current = false;
    fetchTransactions(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  const { data: outstandingPledges = [] } = useGetUserOutstandingPledges(userId, {
    query: { enabled: !!userId, queryKey: getGetUserOutstandingPledgesQueryKey(userId), placeholderData: keepPreviousData }
  });

  // Read tip_amount/tip_request/tip_helper URL params set by TipModal on 402 redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tipAmountStr  = params.get("tip_amount");
    const tipRequestStr = params.get("tip_request");
    const tipHelperStr  = params.get("tip_helper");
    if (!tipAmountStr || !tipRequestStr) return;
    const amount    = parseFloat(tipAmountStr);
    const requestId = parseInt(tipRequestStr);
    if (isNaN(amount) || isNaN(requestId)) return;
    setPendingTip({
      amount,
      requestId,
      helperName: tipHelperStr ? decodeURIComponent(tipHelperStr) : "your helper",
    });
    // Remove params so a refresh doesn't re-trigger the banner
    window.history.replaceState({}, "", window.location.pathname);
   
  }, []);

  // Auto-open pledge drawer when navigated from a quick-pay link (?requestId=X&amount=Y)
  const autoOpenDoneRef = useRef(false);
  useEffect(() => {
    if (autoOpenDoneRef.current || outstandingPledges.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const reqId = params.get("requestId");
    const amt = params.get("amount");
    if (!reqId) return;
    const match = outstandingPledges.find(p => String(p.id) === reqId);
    if (match) {
      autoOpenDoneRef.current = true;
      setSelectedRequest(match);
      if (amt) setPledgeAmount(amt);
      setPledgeOpen(true);
      // Clean up URL without re-navigating
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [outstandingPledges]);
  const { data: scheduledPayments = [] } = useGetScheduledPayments(userId, {
    query: { enabled: !!userId, queryKey: getGetScheduledPaymentsQueryKey(userId), staleTime: 60000, placeholderData: keepPreviousData }
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

  // Hardship / forgiveness self-service
  const [hardshipRequestId, setHardshipRequestId] = useState<number | null>(null);
  const [hardshipNote, setHardshipNote] = useState("");
  const [hardshipLoading, setHardshipLoading] = useState(false);

  // Pledge self-service repayment state (for defaulted pledges)
  const [repayRequestId, setRepayRequestId] = useState<number | null>(null);
  const [repayAmount, setRepayAmount] = useState("");
  const [repayLoading, setRepayLoading] = useState(false);
  // Self-service pledge repayment — any amount reinstates a defaulted pledge
  const handlePledgeRepay = async (requestId: number, outstanding: number) => {
    const amt = parseFloat(repayAmount);
    if (isNaN(amt) || amt <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    if (amt > outstanding + 0.01) {
      toast({ title: `Maximum repayment is ${outstanding.toFixed(2)}`, variant: "destructive" });
      return;
    }
    if (!currentUser) return;
    setRepayLoading(true);
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const res = await retryableMutation(`${base}/api/requests/${requestId}/pledge-repay`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ amount: amt }),
      }, newOperationKey("pledge-repay", requestId));
      const data = await res.json() as { success?: boolean; message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to record repayment");
      toast({ title: data.message ?? "Repayment recorded! 💙" });
      setRepayRequestId(null);
      setRepayAmount("");
      queryClient.invalidateQueries({ queryKey: getGetUserOutstandingPledgesQueryKey(currentUser.id) });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Repayment failed", variant: "destructive" });
    } finally {
      setRepayLoading(false);
    }
  };

  const submitHardship = async () => {
    if (!hardshipRequestId || !userId) return;
    setHardshipLoading(true);
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const res = await fetch(`${base}/api/requests/${hardshipRequestId}/hardship`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ note: hardshipNote.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast({ title: body?.error ?? "Could not submit request", variant: "destructive" });
        return;
      }
      toast({
        title: "Hardship request submitted",
        description: "No pressure — an admin will review your situation with care.",
      });
      setHardshipRequestId(null);
      setHardshipNote("");
      queryClient.invalidateQueries({ queryKey: getGetUserOutstandingPledgesQueryKey(userId) });
    } catch {
      toast({ title: "Network error — please try again", variant: "destructive" });
    } finally {
      setHardshipLoading(false);
    }
  };

  // Stripe Connect status (helpers only)
  const [stripeStatus, setStripeStatus] = useState<{
    connected: boolean;
    payoutsEnabled?: boolean;
    chargesEnabled?: boolean;
  } | null>(null);
  const [stripeOnboarding, setStripeOnboarding] = useState(false);

  // Cashout state
  const [cashoutOpen, setCashoutOpen] = useState(false);
  const [cashoutAmount, setCashoutAmount] = useState("");
  const [cashoutLoading, setCashoutLoading] = useState(false);

  useEffect(() => {
    if (!currentUser?.is_helper || !userId) return;
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    fetch(`${base}/api/stripe/connect/status/${userId}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(setStripeStatus)
      .catch(() => setStripeStatus({ connected: false }));
  }, [userId, currentUser?.is_helper]);

  const handleCashout = async () => {
    const amt = parseFloat(cashoutAmount);
    if (!currentUser || !amt || amt <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    if (amt > wallet) {
      toast({ title: "Amount exceeds your Goodwill Fund balance", variant: "destructive" });
      return;
    }
    if (amt < 1) {
      toast({ title: "Minimum cashout is $1.00", variant: "destructive" });
      return;
    }
    setCashoutLoading(true);
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const res = await fetch(`${base}/api/wallet/cashout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ amount: amt }),
      });
      const data = await res.json() as {
        success?: boolean; transferId?: string; newBalance?: number;
        error?: string; code?: string; warning?: string;
      };
      if (!res.ok) {
        toast({
          title: data.code === "payouts_not_enabled"
            ? "Bank account not set up yet"
            : data.code === "no_stripe_account"
              ? "Connect your bank account first"
              : "Cashout failed",
          description: data.error ?? "Please try again.",
          variant: "destructive",
        });
        return;
      }
      if (data.warning) {
        toast({ title: "Transfer sent (balance sync pending)", description: data.warning });
      } else {
        toast({
          title: `✅ ${amt.toFixed(2)} is on its way!`,
          description: `Transfer ID: ${data.transferId ?? "—"}. Arrives in 1–3 business days.`,
        });
      }
      setCashoutOpen(false);
      setCashoutAmount("");
      // Refresh transactions
      fetchTransactions(0, false);
    } catch {
      toast({ title: "Network error — please try again", variant: "destructive" });
    } finally {
      setCashoutLoading(false);
    }
  };

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
        toast({ title: err.setup ?? "Stripe not configured by admin yet", variant: "destructive" });
        return;
      }
      const data = await res.json() as { url: string };
      window.open(data.url, "_blank", "noopener noreferrer");
    } catch {
      toast({ title: "Could not start Stripe setup", variant: "destructive" });
    } finally {
      setStripeOnboarding(false);
    }
  };

  const wallet = currentUser?.benevolence_wallet ?? 0;
  const goodwill = currentUser?.goodwill_score ?? 0;
  const helpCount = currentUser?.help_count ?? 0;
  const _trustScore = currentUser?.trust_score ?? 0;

  const totalEarned = transactions.filter(t => t.type === "earned").reduce((s, t) => s + t.amount, 0);
  const totalReceived = transactions.filter(t => t.type === "pledge_received").reduce((s, t) => s + t.amount, 0);
  const totalTips = transactions.filter(t => (t.type as string) === "tip_received").reduce((s, t) => s + t.amount, 0);
  const earningsTransactions = transactions.filter(t => t.type === "earned" || (t.type as string) === "tip_received");

  const _livesImpacted = helpCount + goodwill;

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
          fetchTransactions(0, false);
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
    // Guard: never allow paying more than what's outstanding
    const outstanding = (selectedRequest.pledge_amount ?? 0) - (selectedRequest.pledge_paid ?? 0);
    if (paymentDestination === "original_fund" && outstanding > 0 && amt > outstanding + 0.01) {
      toast({ title: `Maximum contribution is ${outstanding.toFixed(2)}`, variant: "destructive" });
      return;
    }

    // Stripe's signed webhook is the sole authority for recording a card-funded
    // repayment. Never fall back to the honor-system endpoint after a card error:
    // that would mark an unpaid attempt as paid.
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
            paymentType: paymentDestination === "helper" ? "tip" : "pay_it_forward",
            operationId: crypto.randomUUID(),
          }),
        });
        if (res.ok) {
          const { clientSecret } = await res.json() as { clientSecret: string };
          setPledgePayment({ clientSecret, amount: amt, destination: paymentDestination });
          return; // payment modal takes over
        }
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast({
          title: "Could not start card payment",
          description: err.error ?? "No payment was recorded. Please try again.",
          variant: "destructive",
        });
      } catch {
        toast({
          title: "Network error",
          description: "No payment was recorded. Please try again.",
          variant: "destructive",
        });
      } finally {
        setCreatingPaymentIntent(false);
      }
      return;
    }

    if (paymentDestination === "helper") {
      toast({
        title: "Card payment unavailable",
        description: "Direct helper payments require Stripe. No payment was recorded.",
        variant: "destructive",
      });
      return;
    }

    // Development/offline mode only: explicitly use the legacy honor-system path.
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
            fetchTransactions(0, false);
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

  // ── Pay from Wallet Balance (no card required) ──────────────────────────────
  const handlePayFromBalance = async (sp: ScheduledPaymentEx) => {
    if (!currentUser) return;
    setPayFromBalanceId(sp.id);
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const res = await fetch(
        `${base}/api/users/${currentUser.id}/scheduled-payments/${sp.id}/pay-from-wallet`,
        { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() } }
      );
      const data = await res.json() as {
        success?: boolean; amount?: number; new_wallet_balance?: number;
        message?: string; error?: string; code?: string;
      };
      if (!res.ok) {
        toast({
          title: data.code === "insufficient_balance" ? "Not enough balance" : "Payment failed",
          description: data.error ?? "Please try another method.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: data.message ?? `${(data.amount ?? 0).toFixed(2)} paid! 💜`,
        description: `New balance: ${(data.new_wallet_balance ?? 0).toFixed(2)}`,
      });
      queryClient.invalidateQueries({ queryKey: getGetScheduledPaymentsQueryKey(userId) });
      queryClient.invalidateQueries({ queryKey: getGetUserOutstandingPledgesQueryKey(userId) });
      fetchTransactions(0, false);
    } catch {
      toast({ title: "Network error — please try again", variant: "destructive" });
    } finally {
      setPayFromBalanceId(null);
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
            operationId: crypto.randomUUID(),
          }),
        });
        if (res.ok) {
          const { clientSecret } = (await res.json()) as { clientSecret: string };
          setPayNowPayment({ clientSecret, amount: amt });
          return; // StripePaymentModal takes over
        }
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast({
          title: "Could not start card payment",
          description: err.error ?? "Your scheduled payment is still pending.",
          variant: "destructive",
        });
      } catch {
        toast({
          title: "Network error",
          description: "No payment was recorded. Your scheduled payment is still pending.",
          variant: "destructive",
        });
      } finally {
        setCreatingPayNowIntent(false);
      }
      return;
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
          // pledge-worker runs daily at 9am — sends push+email reminders when payment is overdue
          toast({
            title: "Payment Scheduled",
            description: `${amount.toFixed(2)} set aside for ${date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}. We'll remind you when it's due — no pressure.`,
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
          <Wallet className="w-5 h-5 text-primary" /> Wallet
        </h1>
      </div>

      <div className="flex-1 p-4 space-y-5 max-w-lg mx-auto w-full">

        {/* Pending-tip banner — shown when TipModal redirected here on 402 */}
        {pendingTip && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 flex items-start gap-3">
            <DollarSign className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-yellow-400">Tip pending — add funds first</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                You tried to send <span className="text-yellow-400 font-bold">${pendingTip.amount.toFixed(2)}</span> to {pendingTip.helperName} but your balance was too low.
                Add funds below, then return to the request to send your tip.
              </p>
            </div>
            <button
              onClick={() => setPendingTip(null)}
              className="p-1 rounded-lg hover:bg-muted transition-colors shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        )}

        {/* Emotional Wallet — KindnessImpactRing */}
        <div className="bg-gradient-to-br from-primary/20 via-primary/5 to-background border border-primary/30 rounded-3xl p-6 shadow-[0_0_40px_rgba(0,212,255,0.1)] flex flex-col items-center gap-4">
          <KindnessImpactRing
            helpCount={helpCount}
            trustScore={goodwill}
            size={160}
          />
          <div className="text-center">
            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Goodwill Fund</div>
            <div className="text-4xl font-black text-primary">${wallet.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Donations, goodwill &amp; community support</div>
          </div>
          <div className="grid grid-cols-3 gap-3 w-full">
            <div className="bg-background/40 rounded-xl p-3 text-center">
              <div className="text-xl font-black text-green-400">${totalEarned.toFixed(0)}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Earned</div>
            </div>
            <div className="bg-background/40 rounded-xl p-3 text-center">
              <div className="text-xl font-black text-primary">${totalReceived.toFixed(0)}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Received</div>
            </div>
            <div className="bg-background/40 rounded-xl p-3 text-center">
              <div className="text-xl font-black text-purple-400">{goodwill}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Goodwill</div>
            </div>
          </div>

          {/* Cash Out button — only shown when helper has payouts_enabled */}
          {currentUser?.is_helper && stripeStatus?.payoutsEnabled && wallet > 0 && (
            <button
              onClick={() => setCashoutOpen(true)}
              className="w-full h-11 bg-green-500/10 border border-green-500/40 hover:border-green-500/70 rounded-2xl flex items-center justify-center gap-2 text-sm font-black text-green-400 transition-all active:scale-95"
            >
              <BanknoteIcon className="w-4 h-4" />
              Cash Out Goodwill Fund
            </button>
          )}
        </div>

        {/* Community Badge */}
        <PayItForwardBadge user={currentUser ?? {}} />

        {/* Flexible Repay Impact Chain — shown when the user has paid back any pledge */}
        {transactions.filter(t => t.type === "pledge_sent" || (t.type as string) === "pledge_repayment").length > 0 && (() => {
          const repayCount = transactions.filter(t => t.type === "pledge_sent" || (t.type as string) === "pledge_repayment").length;
          const repayTotal = transactions
            .filter(t => t.type === "pledge_sent" || (t.type as string) === "pledge_repayment")
            .reduce((s, t) => s + Math.abs(t.amount), 0);
          // Each $5 repaid = ~1 more neighbor helped (rough community multiplier)
          const neighborsHelped = Math.max(1, Math.floor(repayTotal / 5));
          return (
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">💙</span>
                <span className="text-sm font-black text-primary">Your kindness is rippling forward</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                You've paid back <span className="text-primary font-bold">${repayTotal.toFixed(0)}</span> across {repayCount} contribution{repayCount !== 1 ? "s" : ""}, helping an estimated{" "}
                <span className="text-primary font-bold">{neighborsHelped} more neighbor{neighborsHelped !== 1 ? "s" : ""}</span> in the community pool. Every dollar you return unlocks another act of help.
              </p>
              <div className="flex gap-1 flex-wrap">
                {Array.from({ length: Math.min(neighborsHelped, 10) }).map((_, i) => (
                  <span key={i} className="text-base" style={{ opacity: Math.max(0.4, 1 - i * 0.08) }}>🤝</span>
                ))}
                {neighborsHelped > 10 && (
                  <span className="text-[10px] text-primary font-bold ml-1 self-end">+{neighborsHelped - 10} more</span>
                )}
              </div>
            </div>
          );
        })()}

        {/* Stripe Connect — payout setup for helpers */}
        {currentUser?.is_helper && stripeStatus !== null && (
          stripeStatus.payoutsEnabled ? (
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                <CheckCircle className="w-4 h-4 text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-black text-sm text-green-400">Payouts Active</div>
                <div className="text-[10px] text-muted-foreground">Earnings transfer to your bank via Stripe Connect</div>
              </div>
            </div>
          ) : (
            <div className="bg-card border border-primary/30 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <CreditCard className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-sm">Enable Real Payouts</div>
                  <div className="text-[10px] text-muted-foreground">Connect your bank account via Stripe</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Set up Stripe Connect to receive immediate-pay job earnings directly to your bank. Takes ~5 minutes.
              </p>
              <Button
                className="w-full h-10 font-black text-sm"
                onClick={handleStripeOnboard}
                disabled={stripeOnboarding}
              >
                {stripeOnboarding ? (
                  <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Opening Stripe…</span>
                ) : (
                  <span className="flex items-center gap-2"><ExternalLink className="w-4 h-4" />Set Up Payouts via Stripe</span>
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
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setPledgeOpen(true)}
            className="bg-primary/10 border-2 border-primary/40 hover:border-primary/70 rounded-2xl p-4 flex flex-col items-center gap-2 transition-all group"
          >
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Heart className="w-5 h-5 text-primary" />
            </div>
            <div className="text-sm font-black">Pay Forward</div>
            <div className="text-[10px] text-muted-foreground text-center">Pay what you can</div>
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
            <div className="text-sm font-black text-purple-400">Schedule</div>
            <div className="text-[10px] text-muted-foreground text-center">Plan repayment</div>
          </button>
        </div>

        {/* Scheduled Payments — real records from DB with cancel button */}
        {pendingScheduled.length > 0 && (
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-purple-400" /> Upcoming Payments
            </h2>
            <div className="space-y-2.5">
              {pendingScheduled.map(sp => {
                const spEx = sp as ScheduledPaymentEx;
                const isPayingThis = payNowScheduled?.id === sp.id;
                const isPayingFromBalance = payFromBalanceId === sp.id;
                const canPayFromBalance = wallet >= sp.amount - 0.001;
                return (
                  <div key={sp.id} className="bg-card border border-purple-500/30 rounded-xl p-3.5 space-y-2.5">
                    {/* Header row */}
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0">
                        <Calendar className="w-4 h-4 text-purple-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-purple-300">
                          ${sp.amount.toFixed(2)} scheduled
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Due {fmtScheduledDate(sp.scheduled_date)}
                          {sp.note && <> · <span className="italic opacity-70">{sp.note}</span></>}
                        </div>
                      </div>
                      {/* Cancel */}
                      <button
                        onClick={() => cancelMutation.mutate({ paymentId: sp.id })}
                        disabled={cancelMutation.isPending || isPayingFromBalance}
                        className="w-7 h-7 rounded-full bg-muted hover:bg-destructive/10 hover:text-destructive border border-border flex items-center justify-center transition-colors shrink-0"
                        title="Cancel scheduled payment"
                      >
                        {cancelMutation.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <X className="w-3 h-3" />
                        )}
                      </button>
                    </div>

                    {/* Payment buttons row */}
                    <div className="flex gap-2">
                      {/* Pay from Balance — highlighted when user has enough */}
                      {canPayFromBalance ? (
                        <button
                          onClick={() => handlePayFromBalance(spEx)}
                          disabled={isPayingFromBalance || isPayingThis}
                          className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-black text-purple-300 bg-purple-500/15 border border-purple-500/40 hover:border-purple-500/70 active:scale-95 px-3 py-2 rounded-lg transition-all disabled:opacity-50"
                          title={`Pay from your ${wallet.toFixed(2)} Goodwill Fund balance`}
                        >
                          {isPayingFromBalance ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <BanknoteIcon className="w-3 h-3" />
                          )}
                          Pay from Balance
                        </button>
                      ) : (
                        <div
                          className="flex-1 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground bg-muted/30 border border-border px-3 py-2 rounded-lg opacity-60"
                          title={`Balance ${wallet.toFixed(2)} is less than ${sp.amount.toFixed(2)}`}
                        >
                          <BanknoteIcon className="w-3 h-3" />
                          Balance too low
                        </div>
                      )}

                      {/* Pay Now (Stripe / honor system) */}
                      <button
                        onClick={() => handlePayNowScheduled(spEx)}
                        disabled={isPayingThis && (creatingPayNowIntent || pledgeMutation.isPending)}
                        className="flex items-center justify-center gap-1.5 text-[11px] font-black text-primary bg-primary/10 border border-primary/30 hover:border-primary/60 active:scale-95 px-3 py-2 rounded-lg transition-all shrink-0"
                        title="Pay via card"
                      >
                        {isPayingThis && (creatingPayNowIntent || pledgeMutation.isPending) ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
                        Pay by Card
                      </button>
                    </div>

                    {/* Balance hint */}
                    {canPayFromBalance && (
                      <div className="text-[10px] text-purple-400/70 text-center">
                        Your Goodwill Fund balance: <span className="font-bold">${wallet.toFixed(2)}</span> — no card needed
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Outstanding Pledges — with scheduler CTA + hardship self-service */}
        {outstandingPledges.length > 0 && (
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Outstanding Pledges
            </h2>

            {/* Hardship submission modal — inline */}
            <AnimatePresence>
              {hardshipRequestId !== null && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="mb-3 bg-card border border-primary/30 rounded-2xl p-4 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <LifeBuoy className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-sm font-black">Request Hardship Waiver</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    No judgment here. If life got in the way and you can't pay this back right now, let us know. An admin will review your situation with care — this is a community, not a collections agency.
                  </p>
                  <textarea
                    value={hardshipNote}
                    onChange={e => setHardshipNote(e.target.value)}
                    placeholder="Optional: share what's going on (e.g. lost my job, medical expenses, etc.)"
                    rows={3}
                    className="w-full text-sm bg-background border border-border rounded-xl p-3 resize-none focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
                    style={{ fontSize: "16px" }}
                    maxLength={1000}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={submitHardship}
                      disabled={hardshipLoading}
                      className="flex-1 h-10 bg-primary text-primary-foreground text-sm font-black rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95 transition-all"
                    >
                      {hardshipLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LifeBuoy className="w-3.5 h-3.5" />}
                      Submit Request
                    </button>
                    <button
                      onClick={() => { setHardshipRequestId(null); setHardshipNote(""); }}
                      className="w-10 h-10 border border-border rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-2">
              {outstandingPledges.map(r => {
                const outstanding = (r.pledge_amount ?? 0) - (r.pledge_paid ?? 0);
                const alreadyHardship = !!(r as typeof r & { hardship_requested_at?: string | null }).hardship_requested_at;
                const isDefaulted = (r as typeof r & { pledge_status?: string }).pledge_status === "defaulted";
                const isRepaying = repayRequestId === r.id;
                return (
                  <div key={r.id} className={`bg-card border rounded-xl p-3.5 space-y-2 ${isDefaulted ? "border-red-500/40" : "border-yellow-500/30"}`}>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-semibold text-sm truncate">{r.title}</div>
                          {isDefaulted && (
                            <span className="text-[9px] font-black uppercase tracking-wider text-red-400 bg-red-500/10 border border-red-500/30 px-1.5 py-0.5 rounded-full shrink-0">Defaulted</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Outstanding: <span className={`font-bold ${isDefaulted ? "text-red-400" : "text-yellow-400"}`}>${outstanding.toFixed(2)}</span>
                          {(r.pledge_paid ?? 0) > 0 && (
                            <span className="ml-2 text-green-400">· ${(r.pledge_paid ?? 0).toFixed(2)} paid</span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {isDefaulted
                            ? "Posting paused — any repayment reinstates your account immediately."
                            : "No pressure — $2 now, $5 next week — every bit replenishes the pool."}
                        </div>
                      </div>

                    {/* ── Repayment progress tracker ── */}
                    {(r.pledge_amount ?? 0) > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-muted-foreground">Repayment progress</span>
                          <span className={`text-[10px] font-black ${
                            Math.round(((r.pledge_paid ?? 0) / (r.pledge_amount ?? 1)) * 100) >= 100
                              ? "text-green-400"
                              : isDefaulted ? "text-red-400" : "text-yellow-400"
                          }`}>
                            {Math.round(((r.pledge_paid ?? 0) / (r.pledge_amount ?? 1)) * 100)}%
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              isDefaulted
                                ? "bg-gradient-to-r from-red-500 to-orange-400"
                                : "bg-gradient-to-r from-green-500 to-emerald-400"
                            }`}
                            style={{ width: `${Math.min(100, Math.round(((r.pledge_paid ?? 0) / (r.pledge_amount ?? 1)) * 100))}%` }}
                          />
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                          <span>${(r.pledge_paid ?? 0).toFixed(2)} paid of ${(r.pledge_amount ?? 0).toFixed(2)} pledge</span>
                          <span className={isDefaulted ? "text-red-400/70" : "text-yellow-400/70"}>${outstanding.toFixed(2)} left</span>
                        </div>
                      </div>
                    )}

                    {/* Nia nudge — shown only when pledge is active and zero paid */}
                    {!isDefaulted && (r.pledge_paid ?? 0) === 0 && (
                      <div className="flex items-start gap-2 bg-primary/5 border border-primary/15 rounded-xl px-3 py-2">
                        <span className="text-base shrink-0 leading-none mt-0.5">💙</span>
                        <span className="text-[11px] text-primary/80 leading-relaxed italic">
                          "Your neighbor helped — pay forward $2 when you're ready? Every bit keeps the community strong."
                        </span>
                      </div>
                    )}

                    {/* Micro-payment quick-pay row — for active (non-defaulted) pledges */}
                    {!isDefaulted && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Pay what you can now</div>
                        <div className="flex gap-1.5">
                          {[2, 5, 10].map(quickAmt => (
                            <button
                              key={quickAmt}
                              type="button"
                              disabled={quickAmt > outstanding + 0.01}
                              onClick={() => {
                                setSelectedRequest(r);
                                setPledgeAmount(String(quickAmt));
                                setPledgeOpen(true);
                              }}
                              className="flex-1 py-2 text-xs font-black rounded-xl border transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed bg-primary/10 border-primary/30 text-primary hover:border-primary/60"
                            >
                              ${quickAmt}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => { setSelectedRequest(r); setPledgeAmount(""); setPledgeOpen(true); }}
                            className="flex-1 py-2 text-xs font-black rounded-xl border transition-all active:scale-95 bg-muted/80 border-border text-muted-foreground hover:border-primary/40"
                          >
                            Other
                          </button>
                        </div>
                      </div>
                    )}

                      {!isDefaulted && (
                        <button
                          onClick={() => { setSchedulerRequest(r); setSchedulerOpen(true); }}
                          className="text-[10px] font-black text-purple-400 bg-purple-500/10 border border-purple-500/30 px-2.5 py-1.5 rounded-lg hover:border-purple-500/60 transition-all flex items-center gap-1 shrink-0"
                        >
                          <Calendar className="w-3 h-3" /> Schedule Later
                        </button>
                      )}
                    </div>

                    {/* Self-service reinstatement for defaulted pledges */}
                    {isDefaulted && (
                      <AnimatePresence>
                        {isRepaying ? (
                          <motion.div
                            key="repay-form"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="space-y-2 overflow-hidden"
                          >
                            <div className="text-[10px] text-red-400 font-semibold">
                              Enter any amount to reinstate your pledge:
                            </div>
                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                                <Input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  max={outstanding}
                                  placeholder={outstanding.toFixed(2)}
                                  value={repayAmount}
                                  onChange={e => setRepayAmount(e.target.value)}
                                  className="pl-5 h-8 text-sm"
                                  style={{ fontSize: "16px" }}
                                />
                              </div>
                              <button
                                onClick={() => handlePledgeRepay(r.id, outstanding)}
                                disabled={repayLoading || !repayAmount}
                                className="h-8 px-3 bg-green-600 text-white text-[10px] font-black rounded-lg flex items-center gap-1 disabled:opacity-50 active:scale-95 transition-all"
                              >
                                {repayLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                                Reinstate
                              </button>
                              <button
                                onClick={() => { setRepayRequestId(null); setRepayAmount(""); }}
                                className="h-8 w-8 border border-border rounded-lg flex items-center justify-center text-muted-foreground"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </motion.div>
                        ) : (
                          <motion.button
                            key="repay-btn"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => { setRepayRequestId(r.id); setRepayAmount(""); }}
                            className="w-full flex items-center justify-center gap-1.5 text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/30 hover:border-green-500/60 rounded-lg px-2.5 py-1.5 transition-all active:scale-95"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Pay some back to reinstate your account
                          </motion.button>
                        )}
                      </AnimatePresence>
                    )}

                    {/* Hardship self-service — only shown if not already filed */}
                    {alreadyHardship ? (
                      <div className="flex items-center gap-1.5 text-[10px] text-primary bg-primary/10 border border-primary/20 rounded-lg px-2.5 py-1.5">
                        <CheckCircle className="w-3 h-3" />
                        Hardship request submitted — pending admin review
                      </div>
                    ) : (
                      <button
                        onClick={() => setHardshipRequestId(hardshipRequestId === r.id ? null : r.id)}
                        className="w-full flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground hover:text-primary border border-border hover:border-primary/30 rounded-lg px-2.5 py-1.5 transition-all"
                      >
                        <LifeBuoy className="w-3 h-3" />
                        Can't pay right now? Request a hardship waiver
                      </button>
                    )}
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
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Paid Jobs</span>
            </div>
            <div className="text-2xl font-black text-green-400">${totalEarned.toFixed(0)}</div>
            <div className="text-xs text-muted-foreground">
              from {transactions.filter(t => t.type === "earned").length} immediate-pay jobs
            </div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Gift className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Goodwill Acts</span>
            </div>
            <div className="text-2xl font-black text-purple-400">{goodwill}</div>
            <div className="text-xs text-muted-foreground">volunteer missions</div>
          </div>
        </div>

        {/* Activity History — hidden on Earnings tab for helpers */}
        {(!currentUser?.is_helper || walletTab === "activity") && (
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Activity History
            </h2>
            {txLoading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading history...</span>
              </div>
            )}
            {!txLoading && transactions.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No transactions yet. Complete a job to see earnings here.
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
                      <div className="text-[10px] text-purple-400 font-bold shrink-0">GOODWILL</div>
                    ) : (
                      <div className={`font-black text-sm shrink-0 ${
                        tx.amount > 0 ? "text-green-400"
                        : tx.amount < 0 ? "text-orange-400"
                        : "text-muted-foreground"
                      }`}>
                        {tx.amount > 0 ? "+" : tx.amount < 0 ? "-" : ""}${Math.abs(tx.amount).toFixed(2)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Load more */}
            {txHasMore && (
              <button
                onClick={() => fetchTransactions(txOffset, true)}
                disabled={txLoadingMore}
                className="w-full mt-2 py-3 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {txLoadingMore
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</>
                  : "Load more transactions"}
              </button>
            )}
          </div>
        )}

        {/* Helper Earnings Tab */}
        {currentUser?.is_helper && walletTab === "earnings" && (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 text-center">
                <div className="text-2xl font-black text-green-400">${totalEarned.toFixed(2)}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Paid Jobs</div>
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 text-center">
                <div className="text-2xl font-black text-yellow-400">${totalTips.toFixed(2)}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Tips Received</div>
              </div>
            </div>
            <div className="bg-primary/10 border border-primary/30 rounded-2xl p-4 text-center">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Lifetime Earnings</div>
              <div className="text-3xl font-black text-primary">${(totalEarned + totalTips).toFixed(2)}</div>
            </div>

            {/* Payout status */}
            {stripeStatus !== null && (
              stripeStatus.payoutsEnabled ? (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3.5 flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                  <div className="text-sm font-bold text-green-400">Bank payouts active via Stripe Connect</div>
                </div>
              ) : (
                <div className="bg-card border border-primary/30 rounded-xl p-3.5 space-y-2">
                  <div className="text-sm font-bold">Connect your bank to receive payouts</div>
                  <p className="text-xs text-muted-foreground">
                    Immediate-pay earnings stay in your goodwill balance until you connect a bank account via Stripe.
                  </p>
                  <Button className="w-full h-10 font-black text-sm" onClick={handleStripeOnboard} disabled={stripeOnboarding}>
                    {stripeOnboarding ? (
                      <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Opening…</span>
                    ) : (
                      <span className="flex items-center gap-2"><ExternalLink className="w-4 h-4" />Set Up Payouts</span>
                    )}
                  </Button>
                </div>
              )
            )}

            {/* Earnings transaction list */}
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-400" /> Earnings History
              </h2>
              {txLoading && (
                <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Loading…</span>
                </div>
              )}
              {!txLoading && earningsTransactions.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No earnings yet. Complete a paid job to see them here.
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
              <div className="font-bold text-sm mb-1">Pay What You Can, When You Can</div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                No deadlines. No pressure. When you're in a better position, help someone else or contribute back. That's how this community grows.
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
                  <h3 className="font-black text-lg">Niakofa</h3>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { setPledgeOpen(false); setSelectedRequest(null); setPledgeAmount(""); }} className="rounded-full">
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Even $1 or $2 keeps the help chain alive. Pay forward what you can — your helper was paid from the community pool and is counting on neighbors like you.
              </p>

              {outstandingPledges.length > 0 ? (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Your Requests With Outstanding Balance</div>
                  <div className="space-y-2">
                    {outstandingPledges.map(r => {
                      const outstanding = (r.pledge_amount ?? 0) - (r.pledge_paid ?? 0);
                      const isSelected = selectedRequest?.id === r.id;
                      return (
                        <button
                          key={r.id}
                          onClick={() => {
                            setSelectedRequest(isSelected ? null : r);
                            if (!isSelected) {
                              setPledgeAmount("");
                              setPaymentDestination("original_fund");
                            }
                          }}
                          className={`w-full text-left rounded-xl p-3.5 border transition-all ${
                            isSelected
                              ? "border-primary bg-primary/10"
                              : "border-border bg-background hover:border-primary/50"
                          }`}
                        >
                          <div className="font-semibold text-sm truncate">{r.title}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Outstanding: <span className="text-yellow-400 font-bold">${outstanding.toFixed(2)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="bg-muted/50 rounded-xl p-4 text-center text-sm text-muted-foreground">
                  No outstanding pledges right now.
                </div>
              )}

              {selectedRequest && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    Where should this payment go?
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentDestination("original_fund")}
                      className={`rounded-xl border p-3 text-left transition-all ${
                        paymentDestination === "original_fund"
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background hover:border-primary/50"
                      }`}
                    >
                      <div className="text-sm font-bold">Repay the Community Fund</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Reduces your outstanding balance and replenishes the original pool.
                      </div>
                    </button>
                    <button
                      type="button"
                      disabled={!selectedRequest.helper_id || selectedRequest.status !== "completed"}
                      onClick={() => setPaymentDestination("helper")}
                      className={`rounded-xl border p-3 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                        paymentDestination === "helper"
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background hover:border-primary/50"
                      }`}
                    >
                      <div className="text-sm font-bold">Thank the Helper Directly</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Sends an extra tip to the assigned helper. This does not reduce a pool balance.
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Nia motivational prompt */}
              {selectedRequest && pledgeAmount === "" && (
                <div className="bg-primary/10 border border-primary/20 rounded-2xl px-4 py-3 flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-sm">✨</span>
                  </div>
                  <p className="text-xs text-primary/90 leading-relaxed">
                    {[
                      "Your $2 today keeps the kindness flowing! Every small act adds up.",
                      "Even $1 tells your helper: 'I see you.' That matters more than you know.",
                      "What you give comes back multiplied. The community is rooting for you. 💙",
                      "No amount is too small. Kindness doesn't have a minimum.",
                    ][Math.floor(Date.now() / 60000) % 4]}
                  </p>
                </div>
              )}

              {/* Quick-pay buttons */}
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Quick Amount</div>
                <div className="flex gap-2">
                  {[1, 2, 5, 10].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      disabled={!selectedRequest}
                      onClick={() => setPledgeAmount(String(amt))}
                      className={`flex-1 py-2.5 text-sm font-black rounded-xl border transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                        pledgeAmount === String(amt)
                          ? "bg-primary text-primary-foreground border-primary shadow-[0_0_10px_rgba(0,212,255,0.3)]"
                          : "bg-muted/80 border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                      }`}
                    >
                      ${amt}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={!selectedRequest}
                    onClick={() => setPledgeAmount("")}
                    className={`flex-1 py-2.5 text-sm font-black rounded-xl border transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                      pledgeAmount !== "" && !["1","2","5","10"].includes(pledgeAmount)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/80 border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                    }`}
                  >
                    Custom
                  </button>
                </div>
              </div>

              <Input
                type="number"
                placeholder="Or enter custom amount ($)"
                value={pledgeAmount}
                onChange={e => setPledgeAmount(e.target.value)}
                className="bg-background border-border"
                disabled={!selectedRequest}
              />
              {selectedRequest && (
                <p className="text-xs text-muted-foreground -mt-2">
                  {paymentDestination === "helper" ? "Tipping the helper for" : "Repaying the fund for"}:{" "}
                  <span className="text-primary font-semibold">{selectedRequest.title}</span>
                </p>
              )}
              <Button
                className="w-full h-12 font-black"
                onClick={handlePledge}
                disabled={pledgeMutation.isPending || creatingPaymentIntent || !selectedRequest || !pledgeAmount}
              >
                {creatingPaymentIntent ? (
                  <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Setting up payment…</span>
                ) : pledgeMutation.isPending ? (
                  "Sending..."
                ) : (
                  <span className="flex items-center gap-2">
                    <Heart className="w-4 h-4" />
                    {paymentDestination === "helper" ? "Send Helper " : "Repay "}
                    {pledgeAmount ? `$${parseFloat(pledgeAmount || "0").toFixed(2)}` : "Contribution"}
                  </span>
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
              ? pledgePayment.destination === "helper"
                ? `Thank the assigned helper for: "${selectedRequest.title}". This is an extra direct tip.`
                : `Repay the original Community Fund for: "${selectedRequest.title}".`
              : "Niakofa contribution"
          }
          onSuccess={() => {
            setPledgePayment(null);
            setSelectedRequest(null);
            setPaymentDestination("original_fund");
            setPledgeAmount("");
            setPledgeOpen(false);
            toast({
              title: "Payment confirmed",
              description: "Stripe confirmed your payment. Your Pay It Forward balance will update securely.",
            });
            window.setTimeout(() => {
              fetchTransactions(0, false);
              queryClient.invalidateQueries({ queryKey: getGetUserOutstandingPledgesQueryKey(userId) });
            }, 1500);
          }}
          onSkip={() => {
            // NOTE: the /users/:id/pledge endpoint increments pledge_paid immediately —
            // it is a "paid" record, not a promise. Calling it here (as before) falsely
            // marked a declined payment as paid. Skipping means no payment was made,
            // so we must NOT call sendHonorSystemPledge/pledgeMutation here.
            setPledgePayment(null);
            toast({ title: "Payment skipped", description: "No contribution was recorded." });
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
            setPayNowPayment(null);
            cancelMutation.mutate(
              { paymentId: sp.id },
              {
                onSuccess: () => {
                  toast({
                    title: "Payment confirmed",
                    description: "Stripe confirmed your payment and the scheduled item is complete.",
                  });
                  window.setTimeout(() => {
                    fetchTransactions(0, false);
                    queryClient.invalidateQueries({ queryKey: getGetUserOutstandingPledgesQueryKey(userId) });
                  }, 1500);
                  setPayNowScheduled(null);
                },
                onError: () => {
                  toast({
                    title: "Payment confirmed",
                    description: "The payment succeeded, but the schedule could not be closed automatically.",
                  });
                },
              },
            );
          }}
          onSkip={() => {
            // Same issue as the pledge modal: fulfillScheduledNow records the pledge as
            // paid and closes out the scheduled payment. Skipping must not do that —
            // leave the scheduled payment pending so it can be retried later.
            setPayNowPayment(null);
            setPayNowScheduled(null);
            toast({ title: "Payment skipped", description: "Your scheduled payment is still pending." });
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
        userId={userId}
      />

      {/* Cash Out Drawer — real Stripe transfer from benevolence_wallet to bank */}
      <AnimatePresence>
        {cashoutOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
              onClick={() => { setCashoutOpen(false); setCashoutAmount(""); }}
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 220 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-3xl p-6 pb-safe space-y-4 max-h-[90dvh] overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BanknoteIcon className="w-5 h-5 text-green-400" />
                  <h3 className="font-black text-lg">Cash Out</h3>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { setCashoutOpen(false); setCashoutAmount(""); }} className="rounded-full">
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 space-y-1">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Available Balance</div>
                <div className="text-3xl font-black text-green-400">${wallet.toFixed(2)}</div>
                <div className="text-[10px] text-muted-foreground">Pay-it-forward, pool, and sponsor earnings</div>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed">
                Enter how much you'd like to transfer to your connected bank account. Minimum $1.00. Stripe transfers typically arrive in 1–3 business days.
              </p>

              <div className="space-y-2">
                <Input
                  type="number"
                  step="0.01"
                  min="1"
                  max={wallet}
                  placeholder="Amount ($)"
                  value={cashoutAmount}
                  onChange={e => setCashoutAmount(e.target.value)}
                  className="bg-background border-border text-base"
                />
                <div className="flex gap-2">
                  {[5, 10, 25, 50].filter(v => v <= wallet).map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setCashoutAmount(String(v))}
                      className="flex-1 py-1.5 text-xs font-bold rounded-lg bg-muted hover:bg-primary/10 hover:text-primary border border-border transition-all"
                    >
                      ${v}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCashoutAmount(wallet.toFixed(2))}
                    className="flex-1 py-1.5 text-xs font-bold rounded-lg bg-muted hover:bg-primary/10 hover:text-primary border border-border transition-all"
                  >
                    All
                  </button>
                </div>
              </div>

              <Button
                className="w-full h-12 font-black bg-green-500 hover:bg-green-600 text-white"
                onClick={handleCashout}
                disabled={cashoutLoading || !cashoutAmount || parseFloat(cashoutAmount) <= 0}
              >
                {cashoutLoading ? (
                  <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Sending to bank…</span>
                ) : (
                  <span className="flex items-center gap-2">
                    <BanknoteIcon className="w-4 h-4" />
                    Transfer ${cashoutAmount || "0.00"} to Bank
                  </span>
                )}
              </Button>

              <p className="text-[10px] text-muted-foreground text-center">
                Secured by Stripe Connect · 5% platform fee retained
              </p>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
