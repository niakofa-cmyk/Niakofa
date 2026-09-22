import { PeopleDiscoveryView } from "@/components/community/CommunityDiscoveryViews";

export function CommunityPeopleView({ hubId }: { hubId: number | null }) {
  return (
    <section aria-label="Community people">
      <PeopleDiscoveryView hubId={hubId} />
    </section>
  );
}