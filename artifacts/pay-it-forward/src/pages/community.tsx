import { useState, useEffect, useMemo } from "react";
import { useLocation, useSearch, useRoute } from "wouter";
import { authHeaders } from "@/lib/auth";
import { CommunitySpiralsTab } from "@/components/CommunitySpiralsTab";
import { CommunitySocialShell, type CommunityNavKey } from "@/components/community/CommunitySocialShell";
import { CommunityMoreDirectory } from "@/components/community/CommunityMoreDirectory";
import { MediaDiscoveryView } from "@/components/community/CommunityDiscoveryViews";
import { SkillsMarketplaceTab } from "@/components/community/SkillsMarketplaceTab";
import { CommunityHomeView } from "@/components/community/CommunityHomeView";
import { CommunityPeopleView } from "@/components/community/CommunityPeopleView";
import { CommunityHubsView } from "@/components/community/CommunityHubsView";
import { CommunityStoriesView } from "@/components/community/CommunityStoriesView";
import { CommunityRequestsView } from "@/components/community/CommunityRequestsView";

const COMMUNITY_SECTIONS = new Set<CommunityNavKey>([
  "home",
  "people",
  "hubs",
  "stories",
  "more",
  "requests",
  "services",
  "circles",
  "media",
]);

export default function CommunityScreen() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [match, params] = useRoute("/community/:section");
  const requestedSection = match && params?.section ? params.section : "home";
  const compatibleSection = requestedSection === "spirals" ? "circles" : requestedSection;
  const normalizedSection: CommunityNavKey = COMMUNITY_SECTIONS.has(compatibleSection as CommunityNavKey)
    ? compatibleSection as CommunityNavKey
    : "home";

  const [storyComposerSignal, setStoryComposerSignal] = useState(0);

  const [communitySearch, setCommunitySearch] = useState("");

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const hubContextId = useMemo(() => {
    const value = Number(new URLSearchParams(search).get("hubId"));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }, [search]);
  const openStoryId = useMemo(() => {
    const value = Number(new URLSearchParams(search).get("storyId"));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }, [search]);

  const [defaultHubId, setDefaultHubId] = useState<number | null>(null);
  const [defaultHubResolved, setDefaultHubResolved] = useState(hubContextId !== null);

  useEffect(() => {
    if (hubContextId !== null) {
      setDefaultHubResolved(true);
      return;
    }
    let cancelled = false;
    setDefaultHubResolved(false);
    fetch(`${base}/api/community/my-hub`, { headers: authHeaders() })
      .then(r => r.json())
      .then((data: unknown) => {
        if (!cancelled && data && typeof data === "object" && "hub_id" in data && typeof data.hub_id === "number") {
          setDefaultHubId(data.hub_id);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDefaultHubResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [base, hubContextId]);

  const effectiveHubId = hubContextId ?? defaultHubId;

  return (
    <CommunitySocialShell
      active={normalizedSection as CommunityNavKey}
      onNavigate={(key) => setLocation(key === "home" ? "/community" : `/community/${key}`)}
      onRoute={setLocation}
      onCreate={() => undefined}
      onSearch={(value) => {
        setCommunitySearch(value);
        if (value.trim() && normalizedSection !== "home") setLocation("/community");
      }}
      searchValue={communitySearch}
    >
      <div className="space-y-3">
        {normalizedSection === "home" && (
          <CommunityHomeView
            hubId={effectiveHubId}
            hubResolved={defaultHubResolved}
            storyComposerSignal={storyComposerSignal}
            openStoryId={openStoryId}
            onOpenStoryComposer={() => setStoryComposerSignal((signal) => signal + 1)}
            searchQuery={communitySearch}
          />
        )}
        {normalizedSection === "people" && <CommunityPeopleView hubId={effectiveHubId} />}
        {normalizedSection === "hubs" && <CommunityHubsView hubId={effectiveHubId} />}
        {normalizedSection === "stories" && <CommunityStoriesView hubId={effectiveHubId} openStoryId={openStoryId} />}
        {normalizedSection === "requests" && <CommunityRequestsView />}
        {normalizedSection === "circles" && <CommunitySpiralsTab />}
        {normalizedSection === "media" && <MediaDiscoveryView hubId={effectiveHubId} />}
        {normalizedSection === "more" && <CommunityMoreDirectory />}

        {/* Legacy redirect logic or additional sections can be added here if needed */}
        {normalizedSection === "services" && <SkillsMarketplaceTab />}

      </div>

    </CommunitySocialShell>
  );
}
