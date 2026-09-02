import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RecordingConsentBannerProps {
  isVisible: boolean;
  pendingCount: number;
  onAcknowledge: () => void;
  isSubmitting?: boolean;
}

export function RecordingConsentBanner({
  isVisible,
  pendingCount,
  onAcknowledge,
  isSubmitting = false,
}: RecordingConsentBannerProps) {
  if (!isVisible) return null;
  return (
    <div className="border border-amber-500/40 bg-amber-500/10 rounded-xl px-4 py-3 flex flex-col sm:flex-row gap-3 sm:items-center">
      <ShieldCheck className="w-5 h-5 text-amber-300 shrink-0" />
      <div className="flex-1 text-sm">
        <div className="font-bold text-amber-100">This Circle is preparing to record</div>
        <div className="text-xs text-amber-200/80 mt-0.5">
          Recording starts only after every current participant acknowledges. Your consent is recorded for this session.
          {pendingCount > 0 ? ` ${pendingCount} participant${pendingCount === 1 ? "" : "s"} still need to acknowledge.` : ""}
        </div>
      </div>
      <Button size="sm" onClick={onAcknowledge} disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : "Acknowledge"}
      </Button>
    </div>
  );
}