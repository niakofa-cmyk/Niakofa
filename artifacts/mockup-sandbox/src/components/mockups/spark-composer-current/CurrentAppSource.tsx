import { useState, type ReactNode } from "react";
import {
  AtSign,
  ArrowLeft,
  ArrowRight,
  Brush,
  Camera,
  ImagePlus,
  Layers3,
  Settings2,
  Sparkles,
  Sticker,
  Type,
  Volume2,
  X,
} from "lucide-react";
import "./_group.css";

type StoryVisualTool =
  | "music"
  | "templates"
  | "draw"
  | "stickers"
  | "text"
  | "effects"
  | "mention";
type ComposerStep = "source" | "edit" | "destination";

function SparkComposerChrome({
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
    <div className={`nia-story-composer nia-story-composer--${step}`} role="dialog" aria-modal="true" aria-label="Create a Spark">
      <header className="nia-story-composer__header">
        <button className="nia-story-icon nia-story-icon--light" type="button" onClick={step === "source" ? onClose : () => onStep(step === "destination" ? "edit" : "source")} aria-label={step === "source" ? "Close Spark creator" : "Go back"}>
          {step === "source" ? <X size={22} /> : <ArrowLeft size={21} />}
        </button>
        <div className="nia-story-composer__title">
          <strong>Create a Spark</strong>
          <span>{step === "source" ? "Choose how to start" : step === "edit" ? "Edit your Spark" : "Choose audience"}</span>
        </div>
        {step !== "source" ? <button className="nia-story-icon nia-story-icon--light" type="button" onClick={onSettings} aria-label="Spark settings"><Settings2 size={20} /></button> : <span className="nia-story-header-end" aria-hidden="true" />}
      </header>

      {step === "source" ? (
        <main className="nia-story-source">
          <div className="nia-story-source__intro"><p className="nia-story-kicker">Create a Spark</p><h2>What’s happening<br /><em>around you?</em></h2><p>Capture a photo or video, or start with a few words.</p></div>
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

export function CurrentAppSource() {
  const [step, setStep] = useState<ComposerStep>("edit");
  const [activeTool, setActiveTool] = useState<StoryVisualTool | null>(null);
  const [notice, setNotice] = useState("");
  const tools = [
    { key: "music" as const, label: "Audio", icon: <Volume2 size={22} /> },
    { key: "templates" as const, label: "Templates", icon: <Layers3 size={22} /> },
    { key: "draw" as const, label: "Draw", icon: <Brush size={22} /> },
    { key: "stickers" as const, label: "Stickers", icon: <Sticker size={22} /> },
    { key: "text" as const, label: "Text", icon: <Type size={22} /> },
    { key: "effects" as const, label: "Effects", icon: <Sparkles size={22} /> },
    { key: "mention" as const, label: "Mention", icon: <AtSign size={22} /> },
  ];
  const showNotice = (message: string) => setNotice(message);

  return (
    <div className="spark-composer-current nk-community-v4">
      <div className="nia-story-composer-overlay">
        <div className="nia-story-composer-shell">
          <SparkComposerChrome
            step={step}
            onStep={setStep}
            preview={(
              <div className="nia-story-editor-surface">
                <div className="current-media-preview">
                  <div className="current-media-preview__caption">
                    <strong>A fresh start, together.</strong>
                    <span>Little moments from around the neighborhood</span>
                  </div>
                </div>
              </div>
            )}
            tools={tools}
            activeTool={activeTool}
            onTool={(tool) => setActiveTool(activeTool === tool ? null : tool)}
            onClose={() => showNotice("Close Spark creator")}
            onSettings={() => setStep("destination")}
            onGallery={() => showNotice("Gallery picker is represented in this preview.")}
            onCamera={() => showNotice("Camera is represented in this preview.")}
            onPublish={() => showNotice("Publish Spark")}
            publishing={false}
            galleryCount={1}
            canContinue
          >
            <div className="nia-story-composer__form">
              <label htmlFor="current-app-source-caption">Add a caption</label>
              <textarea id="current-app-source-caption" placeholder="Write a few words for your neighbors…" />
              <p>Share with your approved community</p>
            </div>
          </SparkComposerChrome>
        </div>
      </div>
      <span className="current-preview-status" aria-live="polite">{notice}</span>
    </div>
  );
}