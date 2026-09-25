import {
  AtSign,
  Camera,
  ChevronLeft,
  ImagePlus,
  MoreHorizontal,
  Music2,
  Play,
  Search,
  Send,
  Settings2,
  Share2,
  Sparkles,
  Sticker,
  Type,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import "./community-story-visual.css";

export type StoryVisualAuthor = {
  id: number;
  name: string;
  avatarUrl?: string | null;
  seen?: boolean;
  contextLabel?: string;
};

export type StoryVisualTool =
  | "music"
  | "stickers"
  | "text"
  | "effects"
  | "mention";

export function StoryVisualRail({
  authors,
  onCreate,
  onOpen,
  emptyLabel = "Be the first neighbor to share a Spark.",
  loading = false,
}: {
  authors: StoryVisualAuthor[];
  onCreate: () => void;
  onOpen: (authorIndex: number) => void;
  emptyLabel?: string;
  loading?: boolean;
}) {
  return (
    <section className="nia-story-rail" aria-label="Community Moments">
      <div className="nia-story-rail__header">
        <div>
          <p className="nia-story-kicker">Moments</p>
          <h2>Share what is happening now.</h2>
        </div>
        <button className="nia-story-pill" type="button" onClick={onCreate}>
          <Camera size={16} />
          Create
        </button>
      </div>

      <div className="nia-story-scroller">
        <button
          className="nia-story-author nia-story-author--create"
          type="button"
          onClick={onCreate}
          aria-label="Create a Spark"
        >
          <span className="nia-story-avatar nia-story-avatar--create">
            <Camera size={22} />
          </span>
          <span>Your Sparks</span>
        </button>

        {authors.map((author, index) => (
          <button
            className="nia-story-author"
            type="button"
            key={author.id}
            onClick={() => onOpen(index)}
            aria-label={`Open ${author.name}'s Sparks`}
          >
            <span
              className={[
                "nia-story-avatar",
                author.seen ? "nia-story-avatar--seen" : "nia-story-avatar--unseen",
              ].join(" ")}
            >
              {author.avatarUrl ? (
                <img src={author.avatarUrl} alt="" />
              ) : (
                <span aria-hidden="true">{author.name.slice(0, 1).toUpperCase()}</span>
              )}
            </span>
            <span className="nia-story-author__name">{author.name}</span>
            {author.contextLabel && (
              <span className="nia-story-author__context">{author.contextLabel}</span>
            )}
          </button>
        ))}
        {loading ? (
          <p className="nia-story-rail__empty" role="status" aria-live="polite">Loading Moments…</p>
        ) : !authors.length ? (
          <p className="nia-story-rail__empty">{emptyLabel}</p>
        ) : null}
      </div>
    </section>
  );
}

export function StoryViewerChrome({
  author,
  progress,
  onPrevious,
  onNext,
  onClose,
  onMore,
  onReact,
  onReply,
  onShare,
  onSwipe,
  onHoldChange,
  children,
  replyPlaceholder = "Reply to this Spark…",
  replyDisabled = false,
}: {
  author: StoryVisualAuthor;
  progress: number;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
  onMore: () => void;
  onReact: () => void;
  onReply: (value: string) => void;
  onShare: () => void;
  onSwipe?: (direction: "next" | "previous" | "close") => void;
  onHoldChange?: (paused: boolean) => void;
  children: ReactNode;
  replyPlaceholder?: string;
  replyDisabled?: boolean;
}) {
  return (
    <div className="nia-story-viewer">
      <div className="nia-story-viewer__progress" aria-label="Spark progress">
        <span style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }} />
      </div>

      <header className="nia-story-viewer__top">
        <button className="nia-story-icon" type="button" onClick={onPrevious} aria-label="Previous Spark">
          <ChevronLeft size={21} />
        </button>
        <div className="nia-story-viewer__identity">
          <span className="nia-story-viewer__avatar">
            {author.avatarUrl ? <img src={author.avatarUrl} alt="" /> : author.name.slice(0, 1)}
          </span>
          <span>
            <strong>{author.name}</strong>
            {author.contextLabel && <small>{author.contextLabel}</small>}
          </span>
        </div>
        <div className="nia-story-viewer__actions">
          <button className="nia-story-icon" type="button" onClick={onMore} aria-label="Spark options">
            <MoreHorizontal size={21} />
          </button>
          <button className="nia-story-icon" type="button" onClick={onClose} aria-label="Close Spark">
            <X size={22} />
          </button>
        </div>
      </header>

      <button className="nia-story-viewer__tap nia-story-viewer__tap--left" type="button" onClick={onPrevious} aria-label="Previous frame" />
      <div
        className="nia-story-viewer__media"
        onPointerDown={(event) => {
          if (!onSwipe && !onHoldChange) return;
          const target = event.currentTarget;
          const startX = event.clientX;
          const startY = event.clientY;
          let held = false;
          const holdTimer = window.setTimeout(() => {
            held = true;
            onHoldChange?.(true);
          }, 220);
          const finish = (endX: number, endY: number) => {
            window.clearTimeout(holdTimer);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", cancel);
            if (held) {
              onHoldChange?.(false);
              return;
            }
            const deltaX = endX - startX;
            const deltaY = endY - startY;
            if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY > 70) {
              onSwipe?.("close");
            } else if (Math.abs(deltaX) > 70) {
              onSwipe?.(deltaX < 0 ? "next" : "previous");
            }
          };
          const move = (moveEvent: PointerEvent) => {
            if (Math.abs(moveEvent.clientX - startX) > 12 || Math.abs(moveEvent.clientY - startY) > 12) {
              window.clearTimeout(holdTimer);
            }
          };
          const up = (upEvent: PointerEvent) => finish(upEvent.clientX, upEvent.clientY);
          const cancel = () => finish(startX, startY);
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
          window.addEventListener("pointercancel", cancel);
          target.setPointerCapture?.(event.pointerId);
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        {children}
      </div>
      <button className="nia-story-viewer__tap nia-story-viewer__tap--right" type="button" onClick={onNext} aria-label="Next frame" />

      <div className="nia-story-viewer__scrim" aria-hidden="true" />

      <footer className="nia-story-viewer__bottom">
        <div className="nia-story-viewer__reactions">
          <button type="button" className="nia-story-round" onClick={onReact} aria-label="React to Spark">💙</button>
          <button type="button" className="nia-story-round" onClick={onShare} aria-label="Share Spark"><Share2 size={18} /></button>
        </div>
        <form
          className="nia-story-reply"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const input = form.elements.namedItem("reply") as HTMLInputElement | null;
            const value = input?.value.trim() ?? "";
            if (!value) return;
            onReply(value);
            if (input) input.value = "";
          }}
        >
          <input name="reply" placeholder={replyPlaceholder} aria-label="Reply to Spark" disabled={replyDisabled} />
          <button type="submit" aria-label="Send reply" disabled={replyDisabled}><Send size={18} /></button>
        </form>
      </footer>
    </div>
  );
}

export function StoryComposerChrome({
  preview,
  tools,
  activeTool,
  onTool,
  onClose,
  onSettings,
  onGallery,
  onCamera,
  onPublish,
  publishing,
  galleryCount,
  children,
}: {
  preview: ReactNode;
  tools: Array<{ key: StoryVisualTool; label: string; icon?: ReactNode }>;
  activeTool: StoryVisualTool | null;
  onTool: (tool: StoryVisualTool) => void;
  onClose: () => void;
  onSettings: () => void;
  onGallery: () => void;
  onCamera: () => void;
  onPublish: () => void;
  publishing?: boolean;
  galleryCount?: number;
  children?: ReactNode;
}) {
  return (
    <div className="nia-story-composer">
      <header className="nia-story-composer__header">
        <button className="nia-story-icon nia-story-icon--light" type="button" onClick={onClose} aria-label="Close Spark creator">
          <X size={23} />
        </button>
        <div className="nia-story-composer__title">
          <strong>Create a Spark</strong>
          <span>Share a Spark with your community</span>
        </div>
        <button className="nia-story-icon nia-story-icon--light" type="button" onClick={onSettings} aria-label="Spark settings">
          <Settings2 size={21} />
        </button>
      </header>

      <main className="nia-story-composer__canvas">{preview}</main>
      {children && <section className="nia-story-composer__details">{children}</section>}

      <div className="nia-story-composer__gallery-actions">
        <button type="button" className="nia-story-gallery-button" onClick={onGallery}>
          <ImagePlus size={18} />
          Gallery
          {galleryCount ? <b>{galleryCount}</b> : null}
        </button>
        <button type="button" className="nia-story-gallery-button" onClick={onCamera}>
          <Camera size={18} />
          Camera
        </button>
      </div>

      <nav className="nia-story-tool-dock" aria-label="Spark editing tools">
        {tools.map((tool) => (
          <button
            key={tool.key}
            type="button"
            className={activeTool === tool.key ? "nia-story-tool nia-story-tool--active" : "nia-story-tool"}
            onClick={() => onTool(tool.key)}
          >
            <span>{tool.icon}</span>
            <small>{tool.label}</small>
          </button>
        ))}
      </nav>

      <button
        type="button"
        className="nia-story-publish"
        onClick={onPublish}
        disabled={publishing}
        aria-live="polite"
      >
        {publishing ? "Publishing…" : "Post Spark"}
      </button>
    </div>
  );
}

export function StoryGalleryChrome({
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
  onCamera?: () => void;
  onChooseFiles?: () => void;
  onDone?: () => void;
}) {
  return (
    <div className="nia-story-gallery">
      <header className="nia-story-gallery__header">
        <button className="nia-story-icon nia-story-icon--light" type="button" onClick={onClose} aria-label="Close gallery">
          <X size={23} />
        </button>
        <div>
          <strong>Gallery</strong>
          <span>{selected.length ? `${selected.length} selected` : "Choose Spark media"}</span>
        </div>
        <div className="nia-story-gallery__header-actions">
          <button type="button" className="nia-story-multiple" onClick={onMultiple}>
            Select multiple
          </button>
          {onChooseFiles && <button type="button" className="nia-story-multiple" onClick={onChooseFiles}>Add media</button>}
        </div>
      </header>

      <div className="nia-story-gallery__grid">
        {thumbnails.map((item) => {
          const index = selected.indexOf(item.id);
          const isSelected = index >= 0;
          return (
            <button
              key={item.id}
              type="button"
              className="nia-story-gallery__item"
              onClick={() => onSelect(item.id)}
              aria-label={`${isSelected ? "Remove" : "Select"} media`}
            >
              {item.type === "video" ? (
                <video src={item.src} muted playsInline preload="metadata" aria-hidden="true" />
              ) : (
                <img src={item.src} alt="" />
              )}
              {item.type === "video" && <span className="nia-story-gallery__video"><Play size={13} fill="currentColor" /></span>}
              {isSelected && <span className="nia-story-gallery__selected">{index + 1}</span>}
            </button>
          );
        })}
      </div>
      {(onCamera || onDone) && (
        <footer className="nia-story-gallery__footer">
          {onCamera && <button type="button" className="nia-story-gallery__footer-button" onClick={onCamera}><Camera size={18} /> Camera</button>}
          {onDone && <button type="button" className="nia-story-gallery__footer-button nia-story-gallery__footer-button--primary" onClick={onDone}>Done{selected.length ? ` (${selected.length})` : ""}</button>}
        </footer>
      )}
    </div>
  );
}

export function StoryMusicChrome({
  query,
  onQuery,
  tab,
  onTab,
  tracks,
  onPlay,
}: {
  query: string;
  onQuery: (value: string) => void;
  tab: "for-you" | "trending";
  onTab: (tab: "for-you" | "trending") => void;
  tracks: Array<{ id: string | number; title: string; artist: string; artwork?: string; explicit?: boolean }>;
  onPlay: (id: string | number) => void;
}) {
  return (
    <section className="nia-story-music" aria-label="Spark music">
      <div className="nia-story-music__search">
        <Search size={18} />
        <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search music" />
      </div>
      <div className="nia-story-music__tabs">
        <button className={tab === "for-you" ? "active" : ""} type="button" onClick={() => onTab("for-you")}>For you</button>
        <button className={tab === "trending" ? "active" : ""} type="button" onClick={() => onTab("trending")}>Trending</button>
      </div>
      <div className="nia-story-music__list">
        {tracks.map((track) => (
          <button className="nia-story-music__track" type="button" key={track.id} onClick={() => onPlay(track.id)}>
            <span className="nia-story-music__art">
              {track.artwork ? <img src={track.artwork} alt="" /> : <Music2 size={20} />}
            </span>
            <span className="nia-story-music__meta">
              <strong>{track.title}</strong>
              <small>{track.artist}{track.explicit ? " · E" : ""}</small>
            </span>
            <Play size={18} />
          </button>
        ))}
      </div>
    </section>
  );
}

export function StoryToolIcons() {
  return (
    <>
      <Music2 size={22} />
      <Sticker size={22} />
      <Type size={22} />
      <Sparkles size={22} />
      <AtSign size={22} />
    </>
  );
}
