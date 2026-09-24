import { ArrowUpRight, CheckCircle2, HeartHandshake, Navigation2 } from "lucide-react";
import type { MouseEvent } from "react";
import type { RequestInteractionSummary } from "./RequestInteractionTypes";

function statusCopy(status: string): string {
  if (status === "arrived") return "Helper has arrived";
  if (status === "en_route") return "Helper is on the way";
  if (status === "claimed") return "Helper matched";
  if (status === "completed") return "Help completed";
  return status.replaceAll("_", " ");
}

export function ActiveHelpCard({
  request,
  currentUserId,
  onOpen,
  onDismiss,
}: {
  request: RequestInteractionSummary;
  currentUserId?: number | null;
  onOpen: () => void;
  onDismiss?: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const isRequester = request.requester_id === currentUserId;
  const person = isRequester ? request.helper_name ?? "Your helper" : request.requester_name ?? "Your neighbor";
  const avatar = isRequester ? request.helper_avatar : request.requester_avatar;
  const isComplete = request.status === "completed";

  return (
    <div
      className="pointer-events-auto flex w-[min(92vw,25rem)] items-center gap-3 rounded-2xl border border-primary/30 bg-card/95 px-3 py-2.5 shadow-xl backdrop-blur-md"
      data-testid={`card-active-help-${request.id}`}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border ${
        isComplete ? "border-primary/40 bg-primary/10" : "border-green-400/40 bg-green-500/10"
      }`}>
        {avatar ? (
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        ) : isComplete ? (
          <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />
        ) : (
          <HeartHandshake className="h-5 w-5 text-green-400" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">
          {isRequester ? "Your help request" : "Active help"}
        </p>
        <p className="truncate text-sm font-black">{request.title}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {statusCopy(request.status)} · {person}
        </p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-[11px] font-black text-primary-foreground transition hover:bg-primary/90"
        aria-label={isRequester ? "Track your helper" : "Continue helping"}
      >
        <Navigation2 className="h-3.5 w-3.5" aria-hidden="true" />
        {isRequester ? "Track" : "Continue"}
        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
      </button>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 px-1 text-lg leading-none text-muted-foreground hover:text-foreground"
          aria-label="Dismiss active help reminder"
        >
          ×
        </button>
      )}
    </div>
  );
}