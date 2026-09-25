import { CommunityStoryRail } from "./CommunityStoryRail";

/**
 * The Moments product boundary over Niakofa's existing authenticated media
 * rail. Sparks remain backed by the compatible community-story API.
 */
export function CommunityMomentsExperience({
  hubId,
  openComposerSignal,
  openSparkId,
  compact = false,
}: {
  hubId: number | null;
  openComposerSignal?: number;
  openSparkId?: number | null;
  compact?: boolean;
}) {
  return (
    <section
      className="nia-community-moments-experience"
      aria-label="Niakofa Community Moments"
    >
      <CommunityStoryRail
        hubId={hubId}
        openComposerSignal={openComposerSignal}
        openStoryId={openSparkId}
        compact={compact}
      />
    </section>
  );
}