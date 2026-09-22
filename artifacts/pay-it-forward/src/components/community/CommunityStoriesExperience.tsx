import { CommunityStoryRail } from "./CommunityStoryRail";

/**
 * Named boundary for the Community → Stories experience.
 *
 * The rail owns Story data, playback, creation, gallery, music, and durable
 * interactions. This shell keeps that surface separate from Community Feed
 * and gives future Stories navigation states one stable integration point.
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
    <section
      className="nia-community-stories-experience"
      aria-label="Niakofa Community Stories experience"
    >
      <CommunityStoryRail
        hubId={hubId}
        openComposerSignal={openComposerSignal}
        openStoryId={openStoryId}
        compact={compact}
      />
    </section>
  );
}