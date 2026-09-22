import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useSearch, useRoute } from "wouter";
import { authHeaders } from "@/lib/auth";
import { X, Send, PlusCircle, ClipboardList, Heart } from "lucide-react";
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
import { CommunityGratitudeComposer } from "@/components/community/CommunityGratitudeComposer";

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

  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [storyComposerSignal, setStoryComposerSignal] = useState(0);
  const [gratitudeComposerOpen, setGratitudeComposerOpen] = useState(false);

  const [communitySearch, setCommunitySearch] = useState("");
  const createDialogRef = useRef<HTMLDivElement>(null);
  const createDialogCloseRef = useRef<HTMLButtonElement>(null);

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const hubContextId = useMemo(() => {
    const value = Number(new URLSearchParams(search).get("hubId"));
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

  useEffect(() => {
    if (!createSheetOpen) return;
    const restoreTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => createDialogCloseRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setCreateSheetOpen(false);
        return;
      }
      if (event.key !== "Tab" || !createDialogRef.current) return;
      const focusable = Array.from(createDialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      restoreTarget?.focus();
    };
  }, [createSheetOpen]);

  const handleCreate = () => {
    setCreateSheetOpen(true);
  };

  return (
    <CommunitySocialShell
      active={normalizedSection as CommunityNavKey}
      onNavigate={(key) => setLocation(key === "home" ? "/community" : `/community/${key}`)}
      onRoute={setLocation}
      onCreate={handleCreate}
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
            onOpenStoryComposer={() => setStoryComposerSignal((signal) => signal + 1)}
            searchQuery={communitySearch}
          />
        )}
        {normalizedSection === "people" && <CommunityPeopleView hubId={effectiveHubId} />}
        {normalizedSection === "hubs" && <CommunityHubsView hubId={effectiveHubId} />}
        {normalizedSection === "stories" && <CommunityStoriesView hubId={effectiveHubId} />}
        {normalizedSection === "requests" && <CommunityRequestsView />}
        {normalizedSection === "circles" && <CommunitySpiralsTab />}
        {normalizedSection === "media" && <MediaDiscoveryView hubId={effectiveHubId} />}
        {normalizedSection === "more" && <CommunityMoreDirectory />}

        {/* Legacy redirect logic or additional sections can be added here if needed */}
        {normalizedSection === "services" && <SkillsMarketplaceTab />}

      </div>

      {createSheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setCreateSheetOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Create in Community"
            ref={createDialogRef}
            className="w-full max-w-md rounded-t-3xl border border-border bg-background p-5 shadow-2xl sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-black">Create in Community</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Share an update, Story, or request for help.</p>
              </div>
              <button
                type="button"
                ref={createDialogCloseRef}
                onClick={() => setCreateSheetOpen(false)}
                aria-label="Close create menu"
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => {
                  setCreateSheetOpen(false);
                  setLocation("/community");
                  window.setTimeout(() => document.getElementById("hub-post-composer-trigger")?.click(), 0);
                }}
                className="flex items-center gap-3 rounded-2xl border border-border p-3 text-left hover:border-primary/50 hover:bg-muted"
              >
                <Send className="h-5 w-5 text-primary" />
                <span><span className="block text-sm font-bold">Post</span><span className="block text-xs text-muted-foreground">Share with your Hub feed</span></span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreateSheetOpen(false);
                  setLocation("/community");
                  setStoryComposerSignal((signal) => signal + 1);
                }}
                className="flex items-center gap-3 rounded-2xl border border-border p-3 text-left hover:border-primary/50 hover:bg-muted"
              >
                <PlusCircle className="h-5 w-5 text-primary" />
                <span><span className="block text-sm font-bold">Story</span><span className="block text-xs text-muted-foreground">Share a photo, video, or moment</span></span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreateSheetOpen(false);
                  setLocation("/community");
                  setGratitudeComposerOpen(true);
                }}
                className="flex items-center gap-3 rounded-2xl border border-border p-3 text-left hover:border-primary/50 hover:bg-muted"
              >
                <Heart className="h-5 w-5 text-primary" />
                <span><span className="block text-sm font-bold">Gratitude</span><span className="block text-xs text-muted-foreground">Recognize a neighbor or community moment</span></span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreateSheetOpen(false);
                  setLocation("/request/new");
                }}
                className="flex items-center gap-3 rounded-2xl border border-border p-3 text-left hover:border-primary/50 hover:bg-muted"
              >
                <ClipboardList className="h-5 w-5 text-primary" />
                <span><span className="block text-sm font-bold">Request</span><span className="block text-xs text-muted-foreground">Ask your community for help</span></span>
              </button>
            </div>
          </div>
        </div>
      )}

      <CommunityGratitudeComposer
        open={gratitudeComposerOpen}
        onClose={() => setGratitudeComposerOpen(false)}
      />

    </CommunitySocialShell>
  );
}
