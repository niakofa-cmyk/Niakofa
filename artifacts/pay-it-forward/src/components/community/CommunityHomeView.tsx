import { Globe2 } from "lucide-react";
import { Link } from "wouter";
import HubCommunityFeedPanel from "@/components/community/HubCommunityFeedPanel";
import { CommunityMomentsExperience } from "@/components/community/CommunityMomentsExperience";
import "@/components/community/CommunityHomeView.css";

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
      <section className="nia-home" aria-label="Loading Community home" role="status">
        <div className="nia-home__intro">
          <p className="nia-home__eyebrow">Niakofa · Community</p>
          <h1 className="nia-home__title">Home</h1>
          <p className="nia-home__lede">A place to notice, share, and show up for one another.</p>
        </div>
        <div className="nia-home__loading" aria-hidden="true">
          <div className="nia-home__skeleton" />
          <div className="nia-home__skeleton" />
          <div className="nia-home__skeleton" />
        </div>
        <span className="sr-only">Loading your Hub</span>
      </section>
    );
  }

  if (hubId === null) {
    return (
      <section className="nia-home" aria-label="Community home">
        <header className="nia-home__intro">
          <p className="nia-home__eyebrow">Niakofa · Community</p>
          <h1 className="nia-home__title">Home</h1>
          <p className="nia-home__lede">Your local community, at a glance.</p>
        </header>
        <CommunityMomentsExperience
          hubId={null}
          openComposerSignal={sparkComposerSignal}
          openSparkId={openSparkId}
          compact
        />
        <div className="nia-home__empty">
          <Globe2 className="mx-auto mb-3 h-8 w-8 text-[#2866a6]" aria-hidden="true" />
          <h2 className="text-lg font-extrabold">Choose a Hub to find your people</h2>
          <p>Join a Hub in Diaspora to see neighborhood posts and shared updates here.</p>
          <Link
            href="/diaspora"
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-[#2866a6] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#1f568e]"
          >
            Explore Diaspora
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="nia-home" aria-label="Community home">
      <header className="nia-home__intro">
        <p className="nia-home__eyebrow">Niakofa · Community</p>
        <h1 className="nia-home__title">Home</h1>
        <p className="nia-home__lede">Your local community, at a glance. Moments, updates, and small ways to show up.</p>
        <div className="nia-home__rule" aria-hidden="true">From your Hub</div>
      </header>
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