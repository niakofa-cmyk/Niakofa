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
            fallbackText={media ? "Loading Spark media…" : story.caption || "Community Spark"}
            onComplete={onNext}
            onProgress={onProgress}
            paused={paused}
          />
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
  onClose,
}: {
  storyId: number;
  onClose: () => void;
}) {
  return <StoryShareSheet storyId={storyId} onClose={onClose} />;
}