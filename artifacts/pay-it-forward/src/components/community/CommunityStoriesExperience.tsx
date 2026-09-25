import { CommunityMomentsExperience } from "./CommunityMomentsExperience";

/**
 * Compatibility boundary for callers that still use the internal Story name.
 * The user-facing destination and short-form content language are Moments and
 * Sparks.
 */
export function CommunityStoriesExperience({
  hubId,
  openComposerSignal,
  openStoryId,
  compact = false,
}: {
  hubId: number | null;
  openComposerSignal?: number;
  openStoryId?: number | null;
  compact?: boolean;
}) {
  return (
    <CommunityMomentsExperience
        hubId={hubId}
        openComposerSignal={openComposerSignal}
        openSparkId={openStoryId}
        compact={compact}
    />
  );
}