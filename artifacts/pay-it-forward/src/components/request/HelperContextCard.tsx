import { MapPin, MessageCircle, Navigation2, ShieldCheck } from "lucide-react";
import type { RequestInteractionSummary } from "./RequestInteractionTypes";

export function HelperContextCard({
  request,
  onOpen,
  onMessage,
}: {
  request: RequestInteractionSummary;
  onOpen: () => void;
  onMessage?: () => void;
}) {
  const requesterName = request.requester_name ?? "Your neighbor";
  const category = request.category?.replace(/_/g, " ") ?? "Community help";

  return (
    <section className="rounded-2xl border border-primary/20 bg-primary/5 p-3.5" data-testid={`card-helper-context-${request.id}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-primary/30 bg-primary/10">
          {request.requester_avatar ? (
            <img src={request.requester_avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-base font-black text-primary">{requesterName[0]}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Helping</p>
          <p className="truncate text-sm font-black">{requesterName}</p>
          <p className="mt-0.5 truncate text-xs capitalize text-muted-foreground">{category}</p>
        </div>
        <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-label="Protected request context" />
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-background/60 px-3 py-2 text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span className="truncate">{request.neighborhood ?? "Destination details are shown on the map"}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onOpen} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground">
          <Navigation2 className="h-3.5 w-3.5" aria-hidden="true" /> Open navigation
        </button>
        {onMessage && (
          <button type="button" onClick={onMessage} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-border bg-background/60 px-3 text-xs font-bold">
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> Message
          </button>
        )}
      </div>
    </section>
  );
}