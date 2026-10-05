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
type StudioStep = "source" | "edit" | "destination";

// This is the live SparkComposerChrome from CommunityStoryVisual.tsx, copied
// into the isolated sandbox so the current UI can be compared without
// embedding the full authenticated application.
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
  step: StudioStep;
  onStep: (step: StudioStep) => void;
  canContinue: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`nia-story-composer nia-story-composer--${step}`} role="dialog" aria-modal="true" aria-label="Create a Spark">
      {step === "source" ? null : (
        <>
          <header className="nia-story-composer__header">
            <button className="nia-story-icon nia-story-icon--light" type="button" onClick={step === "destination" ? () => onStep("edit") : onClose} aria-label={step === "destination" ? "Go back to editing" : "Close Spark creator"}>
              {step === "destination" ? <ArrowLeft size={21} /> : <X size={22} />}
            </button>
            <div className="nia-story-composer__title">
              <strong>Create a Spark</strong>
              <span>{step === "edit" ? "Edit your Spark" : "Choose audience"}</span>
            </div>
            <button className="nia-story-icon nia-story-icon--light" type="button" onClick={onSettings} aria-label="Spark settings"><Settings2 size={20} /></button>
          </header>
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

export function Current() {
  const [step, setStep] = useState<StudioStep>("edit");
  const [activeTool, setActiveTool] = useState<StoryVisualTool | null>("text");
  const [caption, setCaption] = useState("Fresh herbs from the garden are free for neighbors. Take what you need.");
  const [notice, setNotice] = useState("");
  const tools: Array<{ key: StoryVisualTool; label: string; icon: ReactNode }> = [
    { key: "music", label: "Audio", icon: <Volume2 size={22} /> },
    { key: "templates", label: "Templates", icon: <Layers3 size={22} /> },
    { key: "draw", label: "Draw", icon: <Brush size={22} /> },
    { key: "stickers", label: "Stickers", icon: <Sticker size={22} /> },
    { key: "text", label: "Text", icon: <Type size={22} /> },
    { key: "effects", label: "Effects", icon: <Sparkles size={22} /> },
    { key: "mention", label: "Mention", icon: <AtSign size={22} /> },
  ];

  const inform = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  };

  return (
    <div className="spark-composer-current spark-studio-audit-frame">
      <div className="nia-story-composer-overlay">
        <div className="nia-story-composer-shell">
          <SparkComposerChrome
            step={step}
            onStep={setStep}
            canContinue={Boolean(caption.trim())}
            preview={(
              <div className="spark-current-preview" role="img" aria-label="Preview of a Spark about sharing garden herbs">
                <div className="spark-current-preview__copy">
                  <span>Maplewood · Community</span>
                  <strong>Fresh herbs,<br />free for neighbors.</strong>
                  <small>Take what you need.</small>
                </div>
              </div>
            )}
            tools={tools}
            activeTool={activeTool}
            onTool={(tool) => setActiveTool((current) => current === tool ? null : tool)}
            onClose={() => inform("The live composer saves a draft when closed.")}
            onSettings={() => setStep("destination")}
            onGallery={() => inform("The live composer opens the device media picker.")}
            onCamera={() => inform("The live composer opens the camera recorder.")}
            onPublish={() => inform("Preview only — no Spark was published.")}
            publishing={false}
            galleryCount={2}
          >
            {step === "edit" ? (
              <div className="spark-current-form">
                <p className="spark-current-form__notice" role="status">Draft saved on this device · 2 media items selected</p>
                <label>
                  Caption
                  <textarea value={caption} onChange={(event) => setCaption(event.target.value)} />
                </label>
                {activeTool === "text" && <div className="grid grid-cols-3 gap-2">
                  <label>Text color<input type="color" defaultValue="#ffffff" /></label>
                  <label>Text size<select defaultValue="18"><option>14</option><option>18</option><option>26</option></select></label>
                  <label>Alignment<select defaultValue="center"><option>left</option><option>center</option><option>right</option></select></label>
                </div>}
                <details>
                  <summary className="cursor-pointer text-xs font-bold">Accessibility and tags</summary>
                  <div className="mt-3 grid gap-2">
                    <label>Moment tags<input defaultValue="garden, sharing" /></label>
                    <label>Alternative text<input defaultValue="A basket of fresh herbs on a garden table." /></label>
                    <label>Video captions<input placeholder="Optional WebVTT captions" /></label>
                  </div>
                </details>
              </div>
            ) : (
              <div className="spark-current-destination">
                <strong>Where should this Spark land?</strong>
                <label>Your audience<select defaultValue="community"><option value="community">Community</option><option value="hub">This Hub</option></select></label>
                <label className="spark-current-destination__option"><input type="checkbox" defaultChecked={false} /> Keep a private archive copy</label>
                <label className="spark-current-destination__option"><input type="checkbox" defaultChecked={false} /> Allow video responses</label>
                <label>Connect an Exchange listing (optional)<select defaultValue=""><option value="">No listing connected</option><option>Neighborhood garden listing</option></select></label>
                <p>Community Sparks are visible to approved members for 24 hours.</p>
              </div>
            )}
          </SparkComposerChrome>
          {notice && <div className="spark-current-notice" role="status">{notice}</div>}
        </div>
      </div>
    </div>
  );
}
