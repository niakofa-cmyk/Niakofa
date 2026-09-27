import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ExternalLink, Loader2, ShieldAlert } from "lucide-react";
import {
  disputeExchangePickupRequest,
  getExchangePickupRequests,
  updateExchangePickupRequest,
  type PickupAction,
} from "@/lib/community-exchange-client";
import type { ExchangePickupRequest } from "@/lib/community-exchange-types";

type Props = {
  listingId: number;
  pickupRequestId: number;
  currentUserId: number;
  peerId: number;
};

type PublicDisputeMetadata = {
  status?: string | null;
  outcome?: string | null;
  opened_at?: string | null;
  resolved_at?: string | null;
};

function formatDisputeTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function safeOutcomeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.toLowerCase().replaceAll("-", "_");
  const labels: Record<string, string> = {
    resolved: "Review completed",
    closed: "Review completed",
    dismissed: "Review completed",
    no_action: "No further action",
    upheld: "Review completed",
  };
  return labels[normalized] ?? "Review completed";
}

function safeDisputeStatusLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.toLowerCase().replaceAll("-", "_");
  const labels: Record<string, string> = {
    open: "Dispute open",
    disputed: "Dispute open",
    pending: "Under review",
    under_review: "Under review",
    in_review: "Under review",
    reviewed: "Review completed",
    resolved: "Review completed",
    closed: "Review completed",
  };
  return labels[normalized] ?? "Safety review update";
}

export function ExchangePickupContextPanel({ listingId, pickupRequestId, currentUserId, peerId }: Props) {
  const [pickupRequest, setPickupRequest] = useState<ExchangePickupRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const result = await getExchangePickupRequests();
      const request = (result.pickup_requests ?? []).find((item) => item.id === pickupRequestId && item.listing_id === listingId) ?? null;
      // The direct-message recipient is not an authority source. Only expose
      // controls when this exact Exchange request names both conversation users.
      const isParticipantPair = request
        && [request.buyer_id, request.seller_id].includes(currentUserId)
        && [request.buyer_id, request.seller_id].includes(peerId)
        && request.buyer_id !== request.seller_id
        && request.buyer_id !== undefined
        && request.seller_id !== undefined;
      setPickupRequest(isParticipantPair ? request : null);
      if (!isParticipantPair) setError("This Exchange pickup is not authorized for the current conversation.");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Pickup coordination could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [currentUserId, listingId, peerId, pickupRequestId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = async (action: PickupAction) => {
    if (!pickupRequest) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const result = await updateExchangePickupRequest(pickupRequest.id, action);
      setNotice(result.awaiting_other_confirmation
        ? "Your confirmation is recorded. Waiting for the other participant."
        : action === "confirm-complete" && result.pickup_request.status === "completed"
          ? "Both participants confirmed the handoff."
          : "Pickup coordination updated.");
      await refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "That coordination update could not be made.");
    } finally {
      setWorking(false);
    }
  };

  const submitDispute = async (event: FormEvent) => {
    event.preventDefault();
    if (!pickupRequest || pickupRequest.status !== "accepted" || !reason.trim()) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const result = await disputeExchangePickupRequest(pickupRequest.id, {
        reason: reason.trim(),
        ...(evidence.trim() ? { evidence: evidence.trim() } : {}),
      });
      setPickupRequest(result.pickup_request);
      setReason("");
      setEvidence("");
      setDisputeOpen(false);
      setNotice("Your dispute was sent for safety review.");
      await refresh();
    } catch (disputeError) {
      setError(disputeError instanceof Error ? disputeError.message : "The dispute could not be opened.");
    } finally {
      setWorking(false);
    }
  };

  const isSeller = pickupRequest?.seller_id === currentUserId;
  const isDisputed = pickupRequest?.status === "disputed";
  const allowDispute = pickupRequest?.status === "accepted";
  const publicDispute = pickupRequest
    ? (pickupRequest.dispute as PublicDisputeMetadata | null | undefined) ?? null
    : null;
  const topLevelDispute = pickupRequest as (ExchangePickupRequest & {
    dispute_status?: string | null;
    dispute_outcome?: string | null;
  }) | null;
  const disputeStatus = safeDisputeStatusLabel(publicDispute?.status ?? topLevelDispute?.dispute_status);
  const disputeOutcome = safeOutcomeLabel(publicDispute?.outcome ?? topLevelDispute?.dispute_outcome);
  const openedAt = formatDisputeTimestamp(publicDispute?.opened_at ?? pickupRequest?.dispute_opened_at);
  const resolvedAt = formatDisputeTimestamp(publicDispute?.resolved_at ?? pickupRequest?.dispute_resolved_at);
  const exchangeUrl = `/community?section=exchange&listingId=${listingId}&pickupRequestId=${pickupRequestId}`;

  return (
    <section className="rounded-2xl border border-primary/25 bg-primary/5 p-4" aria-label="Exchange pickup coordination" data-testid="exchange-pickup-context-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Exchange pickup</p>
          <h3 className="mt-1 text-sm font-black">Coordination #{pickupRequestId}</h3>
        </div>
        <a href={exchangeUrl} className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-primary underline-offset-4 hover:underline" data-testid="link-exchange-pickup">
          Open post <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      {loading ? <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading pickup status…</div> : pickupRequest ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-black uppercase tracking-wide" data-testid="exchange-pickup-status">{pickupRequest.status.replaceAll("_", " ")}</span>
            <span className="text-xs text-muted-foreground">{pickupRequest.pickup_location_type?.replaceAll("_", " ") || "Public pickup location"}</span>
          </div>
          {pickupRequest.status === "accepted" && (pickupRequest.buyer_confirmed_at || pickupRequest.seller_confirmed_at) && (
            <p className="mt-2 text-xs text-muted-foreground">One participant confirmed the handoff. Waiting for the other participant.</p>
          )}
          {isDisputed && <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs" data-testid="exchange-dispute-status">
            <p className="font-black text-amber-700 dark:text-amber-300">{disputeStatus || "Dispute open"} · Safety team review</p>
            {openedAt && <p className="mt-1 text-muted-foreground">Opened {openedAt}</p>}
            {disputeOutcome && <p className="mt-1 text-muted-foreground">{disputeOutcome}</p>}
            {resolvedAt && <p className="mt-1 text-muted-foreground">Reviewed {resolvedAt}</p>}
            {!resolvedAt && <p className="mt-1 text-muted-foreground">The safety team will update the status after review.</p>}
          </div>}
          <div className="mt-3 flex flex-wrap gap-2">
            {pickupRequest.status === "requested" && isSeller && <>
              <button type="button" disabled={working} onClick={() => void runAction("accept")} className="min-h-8 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-exchange-accept">Accept</button>
              <button type="button" disabled={working} onClick={() => void runAction("decline")} className="min-h-8 rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted disabled:opacity-50" data-testid="button-exchange-decline">Decline</button>
            </>}
            {(pickupRequest.status === "requested" || pickupRequest.status === "accepted") && <button type="button" disabled={working} onClick={() => void runAction("cancel")} className="min-h-8 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted disabled:opacity-50" data-testid="button-exchange-cancel">Cancel pickup</button>}
            {pickupRequest.status === "accepted" && <button type="button" disabled={working} onClick={() => void runAction("confirm-complete")} className="min-h-8 rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10 disabled:opacity-50" data-testid="button-exchange-confirm">{working ? "Updating…" : "Confirm handoff"}</button>}
            {allowDispute && !disputeOpen && <button type="button" onClick={() => setDisputeOpen(true)} className="min-h-8 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-500/10 dark:text-amber-300" data-testid="button-exchange-open-dispute">Open dispute</button>}
          </div>
          {disputeOpen && pickupRequest.status === "accepted" && <form onSubmit={(event) => void submitDispute(event)} className="mt-3 space-y-2 rounded-xl border border-amber-500/30 bg-background/70 p-3">
            <p className="text-xs text-muted-foreground">Describe what happened for the safety team. Do not include private contact details or exact addresses.</p>
             <textarea required minLength={10} maxLength={2000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for the dispute" className="w-full resize-y rounded-lg border border-border bg-background p-2 text-xs outline-none focus:border-primary" data-testid="input-exchange-dispute-reason" />
             <textarea maxLength={4000} rows={2} value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Optional context for the review" className="w-full resize-y rounded-lg border border-border bg-background p-2 text-xs outline-none focus:border-primary" data-testid="input-exchange-dispute-evidence" />
            <div className="flex justify-end gap-2"><button type="button" disabled={working} onClick={() => setDisputeOpen(false)} className="rounded-lg px-2 py-1 text-xs font-bold text-muted-foreground">Cancel</button><button type="submit" disabled={working || !reason.trim()} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50">{working ? "Sending…" : "Send dispute"}</button></div>
          </form>}
        </>
      ) : <p className="mt-3 text-xs text-muted-foreground">No authorized pickup coordination is attached to this conversation.</p>}
      {notice && <p className="mt-3 text-xs font-semibold text-primary" role="status">{notice}</p>}
      {error && <p className="mt-3 flex gap-1.5 text-xs text-destructive" role="alert"><ShieldAlert className="h-3.5 w-3.5 shrink-0" />{error}</p>}
    </section>
  );
}