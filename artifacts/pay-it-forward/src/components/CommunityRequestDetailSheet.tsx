import { ArrowUpRight, HeartHandshake, MapPin, X } from "lucide-react";
import { useLocation } from "wouter";
import type { HelpRequest } from "@workspace/api-client-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { RequestLifecycleTimeline } from "@/components/RequestLifecycleTimeline";

interface CommunityRequestDetailSheetProps {
  request: HelpRequest | null;
  onClose: () => void;
}

const URGENCY_LABEL: Record<string, string> = {
  emergency: "Emergency",
  high: "High priority",
  medium: "Medium priority",
  low: "Low priority",
};

const URGENCY_COLOR: Record<string, string> = {
  emergency: "text-destructive bg-destructive/10 border-destructive/30",
  high: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  low: "text-primary bg-primary/10 border-primary/30",
};

const PAYMENT_LABEL: Record<string, string> = {
  immediate: "Immediate support",
  pay_it_forward: "Pay it forward",
  goodwill: "Goodwill exchange",
};

/**
 * Keeps a map tap contextual while preserving the existing request detail
 * route as the authority for role-specific actions.
 */
export function CommunityRequestDetailSheet({ request, onClose }: CommunityRequestDetailSheetProps) {
  const [, setLocation] = useLocation();

  return (
    <Drawer open={!!request} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DrawerContent className="max-h-[70vh]">
        {request && (
          <>
            <DrawerHeader className="pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 text-left">
                  <DrawerTitle className="truncate">{request.title}</DrawerTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {request.requester_name ?? "A neighbor"} is asking for help
                  </p>
                </div>
                <button onClick={onClose} aria-label="Close request preview" className="text-muted-foreground shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </DrawerHeader>

            <div className="flex flex-col gap-3 p-4 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${URGENCY_COLOR[request.urgency ?? "low"] ?? URGENCY_COLOR.low}`}>
                  {URGENCY_LABEL[request.urgency ?? "low"] ?? "Priority request"}
                </span>
                <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold capitalize text-muted-foreground">
                  {request.category.replace(/_/g, " ")}
                </span>
              </div>
              <RequestLifecycleTimeline status={request.status} compact />

              {request.description && (
                <p className="text-sm leading-relaxed text-foreground/90">{request.description}</p>
              )}

              <div className="flex flex-col gap-2">
                {request.distance_miles != null && (
                  <div className="flex items-center gap-2.5 rounded-xl bg-muted/40 px-3 py-2.5">
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{request.distance_miles.toFixed(1)} mi away</span>
                  </div>
                )}
                <div className="flex items-center gap-2.5 rounded-xl bg-muted/40 px-3 py-2.5">
                  <HeartHandshake className="h-4 w-4 shrink-0 text-primary" />
                  <span className="text-sm text-muted-foreground">
                    {PAYMENT_LABEL[request.payment_type] ?? "Community support"}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setLocation(`/request/${request.id}/view`);
                  onClose();
                }}
                className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-[0_4px_18px_rgba(0,212,255,0.25)] active:scale-[0.98] transition-transform"
              >
                Open request details
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}