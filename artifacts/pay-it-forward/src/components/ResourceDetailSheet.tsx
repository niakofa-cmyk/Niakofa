import { Phone, MapPin, Navigation2, Clock, X } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import type { CivicResourceNearby } from "@workspace/api-client-react";

interface ResourceDetailSheetProps {
  resource: CivicResourceNearby | null;
  onClose: () => void;
}

const STATUS_LABEL: Record<CivicResourceNearby["open_status"], string> = {
  open: "Open now",
  closed: "Closed",
  unknown: "Hours unknown",
};

const STATUS_COLOR: Record<CivicResourceNearby["open_status"], string> = {
  open: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  closed: "text-muted-foreground bg-muted/40 border-border",
  unknown: "text-amber-400 bg-amber-500/10 border-amber-500/30",
};

/**
 * Resource tap-to-detail surface — phone / hours / directions, the three
 * things a requester actually needs before travelling to a help center.
 * No claim/dispatch flow (that's civic needs, not resources), so this is a
 * lightweight read-only sheet rather than a full page.
 */
export function ResourceDetailSheet({ resource, onClose }: ResourceDetailSheetProps) {
  return (
    <Drawer open={!!resource} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DrawerContent className="max-h-[70vh]">
        {resource && (
          <>
            <DrawerHeader className="pb-0">
              <div className="flex items-start justify-between gap-2">
                <DrawerTitle className="text-left">{resource.org_name}</DrawerTitle>
                <button onClick={onClose} aria-label="Close" className="text-muted-foreground shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </DrawerHeader>
            <div className="flex flex-col gap-3 p-4 pt-2">
              <span className={`self-start text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${STATUS_COLOR[resource.open_status]}`}>
                <Clock className="w-3 h-3" />
                {STATUS_LABEL[resource.open_status]}
              </span>

              {resource.category && (
                <p className="text-xs text-muted-foreground capitalize">{resource.category.replace(/_/g, " ")}</p>
              )}
              {resource.description && (
                <p className="text-sm text-foreground/90 leading-relaxed">{resource.description}</p>
              )}

              <div className="flex flex-col gap-2 mt-1">
                {resource.address && (
                  <a
                    href={`https://maps.google.com/maps?q=${encodeURIComponent(resource.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <Navigation2 className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-sm flex-1 min-w-0 truncate">{resource.address}</span>
                    <span className="text-[10px] font-bold text-primary shrink-0">Directions</span>
                  </a>
                )}
                {resource.phone && (
                  <a
                    href={`tel:${resource.phone}`}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <Phone className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-sm flex-1">{resource.phone}</span>
                    <span className="text-[10px] font-bold text-primary shrink-0">Call</span>
                  </a>
                )}
                {resource.distance_miles != null && (
                  <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-muted/30">
                    <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm text-muted-foreground">{resource.distance_miles.toFixed(1)} mi away</span>
                  </div>
                )}
                {resource.url && (
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-center text-xs font-bold text-primary underline py-1"
                  >
                    Visit website
                  </a>
                )}
              </div>
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
