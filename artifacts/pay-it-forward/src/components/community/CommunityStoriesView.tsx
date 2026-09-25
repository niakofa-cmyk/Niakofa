import { CommunityMomentsView } from "@/components/community/CommunityMomentsView";

export function CommunityStoriesView({
  hubId,
  openStoryId,
}: {
  hubId: number | null;
  openStoryId: number | null;
}) {
  return (
    <div className="space-y-3">
      <CommunityMomentsView hubId={hubId} openSparkId={openStoryId} />
    </div>
  );
}