import { MapPinned, Navigation2, Route } from "lucide-react";
import { getRequestNavigationPath } from "@/lib/request-navigation";

type RequestContext = {
  id: number;
  title: string;
  status: string;
  requester_id: number;
  helper_id: number | null;
  requester_name?: string | null;
  helper_name?: string | null;
};

function statusLabel(status: string): string {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function RequestContextCard({
  request,
  currentUserId,
  onOpen,
}: {
  request: RequestContext;
  currentUserId: number;
  onOpen: () => void;
}) {
  const isRequester = request.requester_id === currentUserId;
  const isHelper = request.helper_id === currentUserId;
  const otherPerson = isRequester ? request.helper_name || "Assigned helper" : request.requester_name || "Request owner";
  const actionLabel = isRequester && request.helper_id ? "Track helper" : isHelper ? "Open navigation" : "View request";
  const destination = getRequestNavigationPath({
    id: request.id,
    status: request.status,
    requesterId: request.requester_id,
    helperId: request.helper_id,
    currentUserId,
  });

  return (
    <div className="mb-4 overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card" data-testid={`card-request-context-${request.id}`}>
      <div className="flex items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Request context</p>
          <h3 className="mt-1 text-sm font-black">{request.title}</h3>
        </div>
        <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-[10px] font-black capitalize text-amber-200">{statusLabel(request.status)}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 py-3 text-xs">
        <div><p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Role</p><p className="mt-1 font-bold">{isRequester ? "Requester" : isHelper ? "Helper" : "Observer"}</p></div>
        <div><p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">With</p><p className="mt-1 truncate font-bold">{otherPerson}</p></div>
      </div>
      <div className="mx-4 mb-3 rounded-2xl border border-border/80 bg-background/60 p-3">
        <div className="flex items-center gap-3">
          <div className="relative flex flex-1 items-center gap-2">
            <span className="h-3 w-3 rounded-full border-2 border-primary bg-background" />
            <span className="h-px flex-1 border-t border-dashed border-primary/50" />
            <Navigation2 className="h-4 w-4 text-primary" />
            <span className="h-px flex-1 border-t border-dashed border-primary/50" />
            <MapPinned className="h-4 w-4 text-emerald-300" />
          </div>
          <Route className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Live GPS, route geometry, and arrival details are available on the request map.</p>
      </div>
      <div className="px-4 pb-4">
        <button type="button" onClick={onOpen} data-testid={`button-request-context-${request.id}`} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-3 text-xs font-black text-primary-foreground hover:bg-primary/90">
          <Navigation2 className="h-4 w-4" /> {actionLabel}
        </button>
        <p className="mt-2 text-center text-[10px] text-muted-foreground">Opens {destination.includes("/track") ? "live helper tracking" : destination.includes("/request/") ? "the request workspace" : "request details"}.</p>
      </div>
    </div>
  );
}