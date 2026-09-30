import {
  AtSign,
  ArrowLeft,
  ArrowRight,
  Brush,
  Camera,
  ChevronLeft,
  Heart,
  ImagePlus,
  Layers3,
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
  | "templates"
  | "draw"
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
          Create Spark
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
          <span>Create Spark</span>
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
          <div className="nia-story-rail__skeleton" role="status" aria-label="Loading Moments"><span /><span /><span /><span /></div>
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
          <button type="button" className="nia-story-round" onClick={onReact} aria-label="React to Spark"><Heart size={20} /></button>
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

export function SparkComposerChrome({
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
  step,
  onStep,
  canContinue,
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
  step: "source" | "edit" | "destination";
  onStep: (step: "source" | "edit" | "destination") => void;
  canContinue: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`nia-story-composer nia-story-composer--${step}`} role="dialog" aria-modal="true" aria-label="Spark Studio">
      <header className="nia-story-composer__header">
        <button className="nia-story-icon nia-story-icon--light" type="button" onClick={step === "source" ? onClose : () => onStep(step === "destination" ? "edit" : "source")} aria-label={step === "source" ? "Close Spark creator" : "Go back"}>
          {step === "source" ? <X size={22} /> : <ArrowLeft size={21} />}
        </button>
        <div className="nia-story-composer__title">
          <strong>Spark Studio</strong>
          <span>{step === "source" ? "01 / CHOOSE" : step === "edit" ? "02 / MAKE IT YOURS" : "03 / SHARE"}</span>
        </div>
        {step !== "source" ? <button className="nia-story-icon nia-story-icon--light" type="button" onClick={onSettings} aria-label="Spark settings"><Settings2 size={20} /></button> : <span className="nia-story-header-end" aria-hidden="true" />}
      </header>

      {step === "source" ? (
        <main className="nia-story-source">
          <div className="nia-story-source__intro"><p className="nia-story-kicker">Spark Studio</p><h2>What’s happening<br /><em>around you?</em></h2><p>Capture a photo or video, or start with a few words.</p></div>
          <div className="nia-story-source__choices">
            <button type="button" onClick={onCamera} className="nia-story-source__choice" data-testid="button-spark-camera"><span><Camera size={26} /></span><strong>Take a photo or video</strong><small>Capture a moment now</small><ArrowRight size={20} /></button>
            <button type="button" onClick={onGallery} className="nia-story-source__choice" data-testid="button-spark-gallery"><span><ImagePlus size={26} /></span><strong>Choose photos or videos</strong><small>Pick from your gallery</small><ArrowRight size={20} /></button>
            <button type="button" onClick={() => onStep("edit")} className="nia-story-source__choice" data-testid="button-spark-text"><span><Type size={26} /></span><strong>Start with words</strong><small>A note for your neighbors</small><ArrowRight size={20} /></button>
          </div>
          {galleryCount ? <button type="button" className="nia-story-source__resume" onClick={() => onStep("edit")}>Continue with {galleryCount} selected item{galleryCount === 1 ? "" : "s"} <ArrowRight size={17} /></button> : null}
          <p className="nia-story-source__foot">Your Spark is shared only with the audience you choose.</p>
        </main>
      ) : (
        <>
          {step === "edit" && <main className="nia-story-composer__canvas">{preview}</main>}
          {children && <section className="nia-story-composer__details">{children}</section>}
          {step === "edit" && <div className="nia-story-composer__gallery-actions">
            <button type="button" className="nia-story-gallery-button" onClick={onGallery}><ImagePlus size={17} /> Media {galleryCount ? `(${galleryCount})` : ""}</button>
            <button type="button" className="nia-story-gallery-button" onClick={onCamera}><Camera size={17} /> Camera</button>
          </div>}
          {step === "edit" && <nav className="nia-story-tool-dock" aria-label="Spark editing tools">{tools.map((tool) => (
            <button key={tool.key} type="button" className={activeTool === tool.key ? "nia-story-tool nia-story-tool--active" : "nia-story-tool"} onClick={() => onTool(tool.key)} aria-pressed={activeTool === tool.key}><span>{tool.icon}</span><small>{tool.label}</small></button>
          ))}</nav>}
          <footer className="nia-story-composer__footer">
            <span>{step === "edit" ? "Make it yours" : "Ready for your neighbors?"}</span>
            <button type="button" className="nia-story-publish" onClick={step === "edit" ? () => onStep("destination") : onPublish} disabled={publishing || (step === "edit" && !canContinue)} aria-live="polite" data-testid="button-spark-continue">
              {publishing ? "Publishing…" : step === "edit" ? "Next" : "Publish Spark"} {!publishing && <ArrowRight size={18} />}
            </button>
          </footer>
        </>
      )}
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
          <strong>Your media</strong>
          <span>{selected.length ? `${selected.length} selected for your Spark` : "Choose Spark media"}</span>
        </div>
        <div className="nia-story-gallery__header-actions">
          <button type="button" className="nia-story-multiple" onClick={onMultiple}>
            Select multiple
          </button>
          {onChooseFiles && <button type="button" className="nia-story-multiple" onClick={onChooseFiles}>Add media</button>}
        </div>
      </header>

       {!thumbnails.length && <div className="nia-story-gallery__empty"><ImagePlus size={32} /><strong>No media selected yet</strong><p>Choose photos or videos from your device. Niakofa cannot browse your camera roll until you pick them.</p><button type="button" onClick={onChooseFiles}>Choose from device</button></div>}
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
               aria-label={`${isSelected ? "Remove" : "Select"} media ${Number(item.id) + 1}`}
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
           {onDone && <button type="button" className="nia-story-gallery__footer-button nia-story-gallery__footer-button--primary" onClick={onDone}>Continue{selected.length ? ` (${selected.length})` : ""}</button>}
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
      <Layers3 size={22} />
      <Brush size={22} />
      <Sticker size={22} />
      <Type size={22} />
      <Sparkles size={22} />
      <AtSign size={22} />
    </>
  );
}
