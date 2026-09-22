import { CommunityStoriesExperience } from "@/components/community/CommunityStoriesExperience";

export function CommunityStoriesView({
  hubId,
  openStoryId,
}: {
  hubId: number | null;
  openStoryId: number | null;
}) {
  return (
    <div className="space-y-3">
      <CommunityStoriesExperience hubId={hubId} openStoryId={openStoryId} />
    </div>
  );
}