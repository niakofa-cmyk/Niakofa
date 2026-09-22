import { HubsDiscoveryView } from "@/components/community/CommunityDiscoveryViews";

export function CommunityHubsView({ hubId }: { hubId: number | null }) {
  return (
    <section aria-label="Community Hubs">
      <HubsDiscoveryView hubId={hubId} />
    </section>
  );
}