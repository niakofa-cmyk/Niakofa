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
import { CommunityMomentsView } from "@/components/community/CommunityMomentsView";
import { CommunityRequestsView } from "@/components/community/CommunityRequestsView";
import { CommunityExchangeView } from "@/components/community/CommunityExchangeView";
import {
  canonicalCommunitySectionRoute,
  normalizeCommunitySection,
} from "@/components/community/CommunityMomentsMigration";

const COMMUNITY_SECTIONS = new Set<CommunityNavKey>([
  "home",
  "moments",
  "spirals",
  "people",
  "exchange",
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
  const compatibleSection = normalizeCommunitySection(requestedSection);
  const normalizedSection: CommunityNavKey = COMMUNITY_SECTIONS.has(compatibleSection as CommunityNavKey)
    ? compatibleSection as CommunityNavKey
    : "home";

  useEffect(() => {
    if (requestedSection === "messages") {
      setLocation("/messages");
      return;
    }
    if (requestedSection === "stories" || requestedSection === "circles") {
      const canonicalRoute = canonicalCommunitySectionRoute(requestedSection);
      const query = new URLSearchParams(search).toString();
      setLocation(`${canonicalRoute}${query ? `?${query}` : ""}`);
    }
  }, [requestedSection, search, setLocation]);

  const [sparkComposerSignal, setSparkComposerSignal] = useState(0);
  const [sparkComposerSection, setSparkComposerSection] = useState(normalizedSection);
  // A bumped signal represents an explicit Create a Spark action. Reset it on
  // tab changes so returning to Home or Moments cannot reopen the composer.
  useEffect(() => {
    setSparkComposerSignal(0);
  }, [normalizedSection]);
  const scopedSparkComposerSignal = sparkComposerSection === normalizedSection ? sparkComposerSignal : 0;

  const [communitySearch, setCommunitySearch] = useState("");
  const openSparkComposerInCurrentSection = () => {
    if (normalizedSection !== "home" && normalizedSection !== "moments") return;
    setSparkComposerSection(normalizedSection);
    setSparkComposerSignal((signal) => signal + 1);
  };

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const hubContextId = useMemo(() => {
    const value = Number(new URLSearchParams(search).get("hubId"));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }, [search]);
  const openSparkId = useMemo(() => {
    const query = new URLSearchParams(search);
    const value = Number(query.get("sparkId") ?? query.get("storyId"));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }, [search]);
  const openPostId = useMemo(() => {
    const value = Number(new URLSearchParams(search).get("postId"));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }, [search]);
  const openMomentsComposerSignal = useMemo(() => {
    const composerValues = new URLSearchParams(search).getAll("composer");
    return composerValues.length === 1 && composerValues[0] === "1" ? 1 : 0;
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
      onNavigate={(key) => setLocation(key === "home" ? "/" : `/community/${key}`)}
      onRoute={setLocation}
      onCreate={() => {
        if (normalizedSection === "home" || normalizedSection === "moments") {
          openSparkComposerInCurrentSection();
          return;
        }
        setLocation("/community/moments?composer=1");
      }}
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
            sparkComposerSignal={scopedSparkComposerSignal}
            openSparkId={openSparkId}
            openPostId={openPostId}
            onOpenSparkComposer={openSparkComposerInCurrentSection}
            searchQuery={communitySearch}
          />
        )}
        {normalizedSection === "moments" && (
          <CommunityMomentsView
            hubId={effectiveHubId}
            openSparkId={openSparkId}
            openComposerSignal={openMomentsComposerSignal + scopedSparkComposerSignal}
          />
        )}
        {normalizedSection === "people" && <CommunityPeopleView hubId={effectiveHubId} />}
        {normalizedSection === "exchange" && <CommunityExchangeView />}
        {normalizedSection === "hubs" && <CommunityHubsView hubId={effectiveHubId} />}
        {normalizedSection === "requests" && <CommunityRequestsView />}
        {normalizedSection === "spirals" && <CommunitySpiralsTab />}
        {normalizedSection === "media" && <MediaDiscoveryView hubId={effectiveHubId} />}
        {normalizedSection === "more" && <CommunityMoreDirectory />}

        {/* Legacy redirect logic or additional sections can be added here if needed */}
        {normalizedSection === "services" && <SkillsMarketplaceTab />}

      </div>

    </CommunitySocialShell>
  );
}
