import { StoryMediaPlayer } from "./StoryMediaPlayer";
import { StoryShareSheet } from "./StoryShareSheet";
import type { CommunityStory, StoryAuthor, StoryMedia } from "./story-rail-types";
import {
  StoryGalleryChrome,
  StoryViewerChrome,
} from "./CommunityStoryVisual";

export function CommunityStoryViewerOverlay({
  author,
  story,
  media,
  playerMedia,
  reelStatus,
  reelFailureCode,
  reelPlaybackError,
  onRetryReel,
  onPlaybackError,
  playbackAttempt,
  progress,
  paused,
  onProgress,
  onPrevious,
  onNext,
  onClose,
  onMore,
  onReact,
  onReply,
  onShare,
  onSwipe,
  onHoldChange,
}: {
  author: StoryAuthor;
  story: CommunityStory;
  media: StoryMedia | null;
  playerMedia: StoryMedia | null;
  reelStatus?: string | null;
  reelFailureCode?: string | null;
  reelPlaybackError?: string | null;
  onRetryReel?: () => void;
  onPlaybackError?: () => void;
  playbackAttempt?: number;
  progress: number;
  paused: boolean;
  onProgress: (progress: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
  onMore: () => void;
  onReact: () => void;
  onReply: (body: string) => void;
  onShare: () => void;
  onSwipe: (direction: "next" | "previous" | "close") => void;
  onHoldChange: (paused: boolean) => void;
}) {
  return (
    <div className="nia-story-viewer-overlay" role="dialog" aria-modal="true" aria-label={`${author.author.name}'s Spark`}>
      <StoryViewerChrome
        author={{
          id: author.author_user_id,
          name: author.author.name,
          avatarUrl: author.author.avatar_url,
          contextLabel: story.hub_id ? "Hub Spark" : "Community",
        }}
        progress={progress}
        onPrevious={onPrevious}
        onNext={onNext}
        onClose={onClose}
        onMore={onMore}
        onReact={onReact}
        onSwipe={onSwipe}
        onHoldChange={onHoldChange}
        onReply={onReply}
        onShare={onShare}
        replyPlaceholder={story.reply_enabled ? "Reply to this Spark…" : "Replies are off"}
        replyDisabled={!story.reply_enabled}
      >
        <div className="nia-story-viewer__player-shell">
          <StoryMediaPlayer
            media={playerMedia}
            elements={story.elements}
            fallbackText={reelStatus && reelStatus !== "ready"
              ? reelStatus === "failed" ? "Camera reel stitching failed." : "Camera reel is being stitched."
              : story.moment_video && reelStatus === "ready" && !playerMedia ? "Loading camera reel…"
              : media ? "Loading Spark media…" : story.caption || "Community Spark"}
            onComplete={onNext}
            onProgress={onProgress}
            paused={paused || Boolean(reelStatus && reelStatus !== "ready" && !media)}
            onPlaybackError={reelStatus === "ready" ? onPlaybackError : undefined}
            playbackAttempt={playbackAttempt}
          />
          {reelStatus && reelStatus !== "ready" && (
            <p role={reelStatus === "failed" ? "alert" : "status"} className="absolute inset-x-4 top-1/2 z-10 -translate-y-1/2 rounded-xl bg-black/80 p-4 text-center text-sm font-semibold text-white">
              {reelStatus === "failed"
                ? `Camera reel stitching failed${reelFailureCode ? ` (${reelFailureCode})` : ""}. The original clips are still available in this Moment.`
                : "Camera reel is being stitched. The original clips remain attached to this Moment."}
            </p>
          )}
          {reelStatus === "ready" && reelPlaybackError && (
            <p role="alert" className="absolute inset-x-4 bottom-4 z-10 rounded-xl bg-black/85 p-3 text-center text-xs text-white">
              {reelPlaybackError} {onRetryReel && <button type="button" onClick={onRetryReel} className="ml-2 underline">Retry playback</button>}
            </p>
          )}
          {story.moment_video && story.media.length > 0 && (
            <span className="sr-only">
              Original clip descriptions and captions: {story.media.map((item, index) => {
                const captions = item.captions_vtt?.replace(/^WEBVTT[^\n]*\n?/m, "").replace(/^\d+\s*$/gm, "").replace(/^\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}.*$/gm, "").trim();
                return `Clip ${index + 1}: ${item.alt_text?.trim() || "No alternative text supplied."}${captions ? ` Original captions: ${captions}` : ""}`;
              }).join(" ")}
            </span>
          )}
          {story.caption && <p className="nia-story-viewer__caption">{story.caption}</p>}
        </div>
      </StoryViewerChrome>
    </div>
  );
}

export function CommunityStoryGalleryOverlay({
  thumbnails,
  selected,
  onSelect,
  onMultiple,
  onClose,
  onCamera,
  onChooseFiles,
  onDone,
}: {
  thumbnails: Array<{ id: string | number; src: string; type?: "photo" | "video" }>;
  selected: Array<string | number>;
  onSelect: (id: string | number) => void;
  onMultiple: () => void;
  onClose: () => void;
  onCamera: () => void;
  onChooseFiles: () => void;
  onDone: () => void;
}) {
  return (
    <div className="nia-story-gallery-overlay">
      <StoryGalleryChrome
        thumbnails={thumbnails}
        selected={selected}
        onSelect={onSelect}
        onMultiple={onMultiple}
        onClose={onClose}
        onCamera={onCamera}
        onChooseFiles={onChooseFiles}
        onDone={onDone}
      />
    </div>
  );
}

export function CommunityStoryShareOverlay({
  storyId,
  audience,
  hubId,
  onClose,
}: {
  storyId: number;
  audience: "community" | "hub";
  hubId: number | null;
  onClose: () => void;
}) {
  return <StoryShareSheet storyId={storyId} audience={audience} hubId={hubId} onClose={onClose} />;
}