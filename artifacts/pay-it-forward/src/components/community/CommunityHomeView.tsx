import { Globe2, Loader2 } from "lucide-react";
import { Link } from "wouter";
import HubCommunityFeedPanel from "@/components/community/HubCommunityFeedPanel";
import { CommunityMomentsExperience } from "@/components/community/CommunityMomentsExperience";

type CommunityHomeViewProps = {
  hubId: number | null;
  hubResolved: boolean;
  sparkComposerSignal: number;
  openSparkId: number | null;
  openPostId: number | null;
  onOpenSparkComposer: () => void;
  searchQuery: string;
};

export function CommunityHomeView({
  hubId,
  hubResolved,
  sparkComposerSignal,
  openSparkId,
  openPostId,
  onOpenSparkComposer,
  searchQuery,
}: CommunityHomeViewProps) {
  if (!hubResolved) {
    return (
      <section
        className="flex min-h-48 items-center justify-center rounded-2xl border border-border bg-card p-6"
        aria-label="Loading Community home"
        role="status"
      >
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Loading your Hub</span>
      </section>
    );
  }

  if (hubId === null) {
    return (
      <section className="space-y-3" aria-label="Community home">
        <CommunityMomentsExperience
          hubId={null}
          openComposerSignal={sparkComposerSignal}
          openSparkId={openSparkId}
          compact
        />
        <div className="border-y border-border bg-card p-6 text-center sm:rounded-2xl sm:border">
          <Globe2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" aria-hidden="true" />
          <h2 className="text-lg font-black">No Hub Selected</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Join a Hub in Diaspora to see community posts here.
          </p>
          <Link
            href="/diaspora"
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90"
          >
            Explore Diaspora
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Community home">
      <HubCommunityFeedPanel
        hubId={hubId}
        socialHomeMode
        openPostId={openPostId}
        onOpenStoryComposer={onOpenSparkComposer}
        searchQuery={searchQuery}
        homeInterstitial={(
          <CommunityMomentsExperience
            hubId={hubId}
            openSparkId={openSparkId}
            openComposerSignal={sparkComposerSignal}
            compact
          />
        )}
      />
    </section>
  );
}