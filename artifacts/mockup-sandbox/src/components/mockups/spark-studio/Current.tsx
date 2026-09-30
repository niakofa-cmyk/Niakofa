import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Camera, ImagePlus, Settings2, Type, X } from "lucide-react";
import "./_group.css";
import "./current.css";

type StoryVisualTool = "caption" | "sticker" | "music" | "filter" | "draw";
type StudioStep = "source" | "edit" | "destination";

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
    <div className={`nia-story-composer nia-story-composer--${step}`} role="dialog" aria-modal="true" aria-label="Create Spark studio">
      <header className="nia-story-composer__header">
        <button className="nia-story-icon nia-story-icon--light" type="button" onClick={step === "source" ? onClose : () => onStep(step === "destination" ? "edit" : "source")} aria-label={step === "source" ? "Close Spark creator" : "Go back"}>
          {step === "source" ? <X size={22} /> : <ArrowLeft size={21} />}
        </button>
        <div className="nia-story-composer__title">
          <strong>Create Spark</strong>
          <span>{step === "source" ? "01 / CHOOSE" : step === "edit" ? "02 / MAKE IT YOURS" : "03 / SHARE"}</span>
        </div>
        {step !== "source" ? <button className="nia-story-icon nia-story-icon--light" type="button" onClick={onSettings} aria-label="Spark settings"><Settings2 size={20} /></button> : <span className="nia-story-header-end" aria-hidden="true" />}
      </header>

      {step === "source" ? (
        <main className="nia-story-source">
          <div className="nia-story-source__intro"><p className="nia-story-kicker">A moment worth sharing</p><h2>What’s happening<br /><em>around you?</em></h2><p>Small moments can move a whole neighborhood.</p></div>
          <div className="nia-story-source__choices">
            <button type="button" onClick={onCamera} className="nia-story-source__choice"><span><Camera size={26} /></span><strong>Open camera</strong><small>Capture a moment now</small><ArrowRight size={20} /></button>
            <button type="button" onClick={onGallery} className="nia-story-source__choice"><span><ImagePlus size={26} /></span><strong>Choose from gallery</strong><small>Photos or short videos</small><ArrowRight size={20} /></button>
            <button type="button" onClick={() => onStep("edit")} className="nia-story-source__choice"><span><Type size={26} /></span><strong>Start with words</strong><small>A note for your neighbors</small><ArrowRight size={20} /></button>
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
            <button type="button" className="nia-story-publish" onClick={step === "edit" ? () => onStep("destination") : onPublish} disabled={publishing || (step === "edit" && !canContinue)} aria-live="polite">
              {publishing ? "Publishing…" : step === "edit" ? "Next" : "Publish Spark"} {!publishing && <ArrowRight size={18} />}
            </button>
          </footer>
        </>
      )}
    </div>
  );
}

export function Current() {
  const [step, setStep] = useState<StudioStep>("source");
  const [activeTool, setActiveTool] = useState<StoryVisualTool | null>(null);
  const [selected, setSelected] = useState(0);
  const [notice, setNotice] = useState("");
  const tools = [
    { key: "caption" as const, label: "Text", icon: <Type size={18} /> },
    { key: "sticker" as const, label: "Sticker", icon: <span aria-hidden="true">✳</span> },
    { key: "music" as const, label: "Music", icon: <span aria-hidden="true">♫</span> },
    { key: "filter" as const, label: "Filter", icon: <span aria-hidden="true">◐</span> },
    { key: "draw" as const, label: "Draw", icon: <span aria-hidden="true">✎</span> },
  ];
  const enterEdit = (message: string) => { setSelected(1); setNotice(message); setStep("edit"); };

  return (
    <div className="spark-studio-current">
      <div className="nia-story-composer-overlay">
        <div className="nia-story-composer-shell">
          <SparkComposerChrome
            step={step}
            onStep={setStep}
            preview={<div className="current-media-preview"><span>Photo preview</span><small>Selected media appears here</small></div>}
            tools={tools}
            activeTool={activeTool}
            onTool={setActiveTool}
            onClose={() => setNotice("Close Spark Studio")}
            onSettings={() => setStep("destination")}
            onGallery={() => enterEdit("Gallery picker is represented in this preview.")}
            onCamera={() => enterEdit("Camera is represented in this preview.")}
            onPublish={() => setNotice("Publish Spark")}
            publishing={false}
            galleryCount={selected}
            canContinue={selected > 0}
          >
            <div className="nia-story-composer__form">
              <label htmlFor="current-caption">Add a caption</label>
              <textarea id="current-caption" placeholder="Write a few words for your neighbors…" />
              <p>Share with your approved community</p>
            </div>
          </SparkComposerChrome>
        </div>
      </div>
      <span className="current-preview-status" aria-live="polite">{notice}</span>
    </div>
  );
}