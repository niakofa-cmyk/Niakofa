import { useEffect, useRef } from "react";
import { CommunityMomentsExperience } from "@/components/community/CommunityMomentsExperience";
import { trackCommunityContent } from "@/lib/communityMediaAnalytics";

export function CommunityMomentsView({
  hubId,
  openSparkId,
  openComposerSignal,
}: {
  hubId: number | null;
  openSparkId: number | null;
  openComposerSignal?: number;
}) {
  const openedRef = useRef(false);

  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    trackCommunityContent("moment_opened", hubId === null ? {} : { hub_id: hubId });
  }, [hubId]);

  return (
    <div className="space-y-3" data-testid="community-moments-view">
      <CommunityMomentsExperience hubId={hubId} openSparkId={openSparkId} openComposerSignal={openComposerSignal} />
    </div>
  );
}