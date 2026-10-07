import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  ImagePlus,
  Info,
  Layers3,
  LockKeyhole,
  RotateCcw,
  Settings2,
  ShieldCheck,
  SwitchCamera,
  Type,
  UsersRound,
  X,
  Zap,
  ZapOff,
  Camera,
} from "lucide-react";
import "./_group.css";
import "./camera-first.css";

type Step = "capture" | "details";
type CameraMode = "photo" | "video";
type Template = { name: string; caption: string; tone: string; note: string };

const templates: Template[] = [
  { name: "A little help", caption: "A small thing that might make today easier.", tone: "sage", note: "Warm and simple" },
  { name: "Found nearby", caption: "Found this close by. Is it yours?", tone: "clay", note: "For useful finds" },
  { name: "Good to share", caption: "There is enough to go around. Take what you need.", tone: "lemon", note: "For neighborly offers" },
];

// Kept intentionally close to the extracted SparkComposerChrome contract,
// while bringing the camera source to the front of the creation flow.
function SparkComposerChrome({
  step,
  onStep,
  onClose,
  onDetails,
  onTemplates,
  onGallery,
  onCamera,
  cameraMode,
  onCameraMode,
  facing,
  onFacing,
  flash,
  onFlash,
  timer,
  onTimer,
  audience,
  onAudience,
  cameraReady,
  captured,
  selectedFile,
  caption,
  children,
}: {
  step: Step;
  onStep: (step: Step) => void;
  onClose: () => void;
  onDetails: () => void;
  onTemplates: () => void;
  onGallery: () => void;
  onCamera: () => void;
  cameraMode: CameraMode;
  onCameraMode: (mode: CameraMode) => void;
  facing: "Rear" | "Selfie";
  onFacing: () => void;
  flash: boolean;
  onFlash: () => void;
  timer: number;
  onTimer: (seconds: number) => void;
  audience: "community" | "hub";
  onAudience: (audience: "community" | "hub") => void;
  cameraReady: boolean;
  captured: boolean;
  selectedFile: string;
  caption: string;
  children?: ReactNode;
}) {
  return (
    <div className={`cf-shell cf-shell--${step}`} role="dialog" aria-modal="true" aria-label="Create a Spark">
      <header className="cf-topbar">
        <button className="cf-icon-button" type="button" onClick={step === "details" ? () => onStep("capture") : onClose} aria-label={step === "details" ? "Back to camera" : "Close Spark creator"}>
          {step === "details" ? <ArrowLeft size={19} /> : <X size={20} />}
        </button>
        <div className="cf-brand">
          <span className="cf-brand__mark" aria-hidden="true">N</span>
          <span><strong>Spark Studio</strong><small>{step === "capture" ? "A moment for your neighbors" : "Before it reaches your community"}</small></span>
        </div>
        <div className="cf-topbar__actions">
          {step === "capture" && <button className="cf-top-action" type="button" onClick={onTemplates}><Layers3 size={16} /><span>Templates</span></button>}
          <button className="cf-top-action" type="button" onClick={onDetails}><Settings2 size={16} /><span>{step === "details" ? "Details" : "Spark details"}</span></button>
        </div>
      </header>

      {step === "capture" ? (
        <main className="cf-capture">
          <div className="cf-capture__intro">
            <span className="cf-kicker"><span className="cf-live-dot" /> Your neighborhood, in the moment</span>
            <h1>Start with<br /><em>what’s around you.</em></h1>
            <p>A quick photo, a short clip, or a kind note. Your camera stays off until you ask to use it.</p>
          </div>

          <section className={`cf-viewfinder ${cameraReady ? "cf-viewfinder--ready" : ""} ${captured || selectedFile ? "cf-viewfinder--captured" : ""}`} aria-label="Camera preview">
            <div className="cf-viewfinder__ambient" aria-hidden="true">
              <span className="cf-orbit cf-orbit--one" /><span className="cf-orbit cf-orbit--two" />
              <span className="cf-focus" />
            </div>
            <div className="cf-viewfinder__topline">
              <span className="cf-viewfinder__status"><span />{cameraReady ? "Preview ready · demo" : captured ? "Moment captured" : selectedFile ? "Media selected" : "Camera is off"}</span>
              <button type="button" className="cf-viewfinder__privacy" onClick={onDetails} aria-label="View Spark privacy details"><LockKeyhole size={14} /> Neighbors only</button>
            </div>
            <div className="cf-viewfinder__center">
              {(captured || selectedFile) ? (
                <div className="cf-takeaway" role="status">
                  <span className="cf-takeaway__check"><Check size={17} /></span>
                  <strong>{captured ? "A moment, kept." : "Your media is ready."}</strong>
                  <small>{selectedFile || "A camera capture · saved to this draft"}</small>
                  <button type="button" onClick={onCamera}><RotateCcw size={14} /> Retake</button>
                </div>
              ) : (
                <div className="cf-camera-guidance">
                  <span className="cf-guidance-mark"><Camera size={23} strokeWidth={1.6} /></span>
                  <strong>{cameraReady ? "Take a moment" : "Your viewfinder is ready"}</strong>
                  <span>{cameraReady ? "This preview is simulated. No camera is connected." : "Tap the shutter when you’re ready to use your camera."}</span>
                </div>
              )}
            </div>
            <div className="cf-viewfinder__bottomline">
              <span>LOCAL SPARK · 24 HOURS</span>
              <span>{cameraMode === "photo" ? "STILL" : "SHORT VIDEO"}</span>
            </div>
          </section>

          <div className="cf-controls">
            <div className="cf-control-row" aria-label="Camera settings">
              <button type="button" className={`cf-control ${flash ? "is-on" : ""}`} onClick={onFlash} aria-pressed={flash}>
                {flash ? <Zap size={17} /> : <ZapOff size={17} />}<span>{flash ? "Flash on" : "Flash off"}</span>
              </button>
              <label className="cf-timer-control">
                <Clock3 size={16} /><span className="cf-sr-only">Capture timer</span>
                <select value={timer} onChange={(event) => onTimer(Number(event.currentTarget.value))} aria-label="Capture timer">
                  <option value={0}>No timer</option><option value={3}>3 seconds</option><option value={10}>10 seconds</option>
                </select><ChevronDown size={13} />
              </label>
              <button type="button" className="cf-control" onClick={onFacing} aria-label={`Switch camera, currently ${facing.toLowerCase()}`}>
                <SwitchCamera size={17} /><span>{facing}</span>
              </button>
            </div>
            <div className="cf-shutter-row">
              <button type="button" className="cf-gallery-button" onClick={onGallery}>
                <span className="cf-gallery-button__icon"><ImagePlus size={20} /></span>
                <span>Choose media<small>From this device</small></span>
              </button>
              <div className="cf-shutter-stack">
                <div className="cf-mode-switch" role="group" aria-label="Capture mode">
                  <button type="button" className={cameraMode === "photo" ? "is-selected" : ""} onClick={() => onCameraMode("photo")} aria-pressed={cameraMode === "photo"}>Photo</button>
                  <button type="button" className={cameraMode === "video" ? "is-selected" : ""} onClick={() => onCameraMode("video")} aria-pressed={cameraMode === "video"}>Video</button>
                </div>
                <button type="button" className={`cf-shutter ${captured ? "cf-shutter--retake" : ""}`} onClick={onCamera} aria-label={cameraReady ? captured ? "Retake capture" : `Capture ${cameraMode}` : "Set up camera"}>
                  <span>{cameraReady && !captured ? <span className={cameraMode === "video" ? "cf-shutter__video" : "cf-shutter__still"} /> : captured ? <RotateCcw size={20} /> : <Camera size={23} />}</span>
                </button>
              </div>
              <button className="cf-next-button" type="button" onClick={() => onStep("details")} disabled={!captured && !selectedFile && !caption.trim()}>
                Next <ArrowRight size={16} />
              </button>
            </div>
            <p className="cf-safety-note"><ShieldCheck size={14} /> Only approved neighbors can see a Community Spark.</p>
          </div>
        </main>
      ) : (
        <main className="cf-detail-layout">
          <section className="cf-detail-preview">
            <div className={`cf-mini-preview ${captured || selectedFile ? "cf-mini-preview--media" : ""}`} aria-label="Spark preview" role="img">
              <span className="cf-mini-preview__sun" />
              <div className="cf-mini-preview__copy">
                <span>MAPLEWOOD · COMMUNITY</span>
                <strong>{caption || "A small moment, shared nearby."}</strong>
                <small>{selectedFile ? "Media from your device" : captured ? "A camera capture" : "A note for your neighbors"}</small>
              </div>
            </div>
            <div className="cf-preview-note"><ShieldCheck size={15} /><span>Your Spark stays within the audience you choose.</span></div>
          </section>
          <section className="cf-details-panel" aria-label="Spark details and audience">
            <div className="cf-details-heading">
              <span className="cf-kicker">A little context</span>
              <h1>Make it yours.</h1>
              <p>Say what matters, then choose who should see it.</p>
            </div>
            {children}
            <div className="cf-audience-block">
              <div className="cf-field-heading"><UsersRound size={16} /><span>Who can see this?</span></div>
              <label className="cf-select-wrap">
                <select aria-label="Spark audience" value={audience} onChange={(event) => onAudience(event.currentTarget.value as "community" | "hub")}>
                  <option value="community">My neighborhood · approved members</option>
                  <option value="hub">A local Hub · approved members</option>
                </select><ChevronDown size={15} />
              </label>
              <p className="cf-privacy-copy"><LockKeyhole size={14} /> {audience === "community" ? "Community Sparks are visible to approved members for 24 hours." : "Hub Sparks stay with approved members of that local Hub."}</p>
              <label className="cf-check-option"><input type="checkbox" /> <span>Keep a private archive copy<small>Only you can see the archived version.</small></span></label>
              <label className="cf-check-option"><input type="checkbox" /> <span>Allow video responses<small>Neighbors can reply with a short video.</small></span></label>
            </div>
            <div className="cf-detail-actions">
              <button type="button" className="cf-secondary-button" onClick={() => onStep("capture")}>Back to camera</button>
              <button type="button" className="cf-publish-button" onClick={onClose}>Save draft <Check size={16} /></button>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

export function CameraFirst() {
  const [step, setStep] = useState<Step>("capture");
  const [cameraReady, setCameraReady] = useState(false);
  const [permissionOpen, setPermissionOpen] = useState(false);
  const [captured, setCaptured] = useState(false);
  const [selectedFile, setSelectedFile] = useState("");
  const [cameraMode, setCameraMode] = useState<CameraMode>("photo");
  const [facing, setFacing] = useState<"Rear" | "Selfie">("Rear");
  const [flash, setFlash] = useState(false);
  const [timer, setTimer] = useState(0);
  const [caption, setCaption] = useState("");
  const [tags, setTags] = useState("");
  const [altText, setAltText] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [templateTone, setTemplateTone] = useState("sage");
  const inputRef = useRef<HTMLInputElement>(null);
  const [audience, setAudience] = useState<"community" | "hub">("community");

  const inform = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };

  const cameraAction = () => {
    if (!cameraReady) {
      setPermissionOpen(true);
      return;
    }
    setCaptured(true);
    setSelectedFile("");
    inform(timer ? `Capture ready · ${timer}-second timer selected for this demo.` : "Capture added to your local Spark draft.");
  };

  const pickMedia = () => inputRef.current?.click();
  const handleMedia = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setSelectedFile(file.name);
    setCaptured(false);
    inform(`${file.name} added to this local preview.`);
    event.currentTarget.value = "";
  };

  const applyTemplate = (template: Template) => {
    setCaption(template.caption);
    setTemplateTone(template.tone);
    setTemplateOpen(false);
    inform(`${template.name} added to your Spark.`);
  };

  return (
    <div className={`spark-camera-first spark-camera-first--${templateTone}`}>
      <SparkComposerChrome
        step={step}
        onStep={setStep}
        onClose={() => inform("Draft saved in this preview. Nothing was published.")}
        onDetails={() => setStep("details")}
        onTemplates={() => setTemplateOpen(true)}
        onGallery={pickMedia}
        onCamera={cameraAction}
        cameraMode={cameraMode}
        onCameraMode={setCameraMode}
        facing={facing}
        onFacing={() => setFacing((value) => value === "Rear" ? "Selfie" : "Rear")}
        flash={flash}
        onFlash={() => setFlash((value) => !value)}
        timer={timer}
        onTimer={setTimer}
        audience={audience}
        onAudience={setAudience}
        cameraReady={cameraReady}
        captured={captured}
        selectedFile={selectedFile}
        caption={caption}
      >
        <div className="cf-edit-fields">
          <label className="cf-caption-field">
            <span className="cf-field-heading"><Type size={16} /> Add a note <small>{caption.length}/180</small></span>
            <textarea value={caption} maxLength={180} onChange={(event) => setCaption(event.currentTarget.value)} placeholder="A few words for the people nearby…" />
          </label>
          <label className="cf-label">
            Moment tags <span className="cf-optional">Optional</span>
            <input value={tags} onChange={(event) => setTags(event.currentTarget.value)} placeholder="garden, sharing" />
          </label>
          <details className="cf-accessibility">
            <summary><Info size={15} /> Accessibility and tags</summary>
            <label className="cf-label">Describe your media<input value={altText} onChange={(event) => setAltText(event.currentTarget.value)} placeholder="A short description for neighbors who use a screen reader" /></label>
            <p>Plain descriptions help everyone take part in the moment.</p>
          </details>
          <div className="cf-local-save"><Check size={14} /> Changes stay in this local preview.</div>
          <div className="cf-current-audience"><LockKeyhole size={14} /> {audience === "community" ? "Approved neighborhood members" : "Approved members of your Hub"}</div>
        </div>
      </SparkComposerChrome>

      <input ref={inputRef} className="cf-file-input" type="file" accept="image/*,video/*" onChange={handleMedia} aria-label="Choose a photo or video from your device" />

      {permissionOpen && (
        <div className="cf-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPermissionOpen(false); }}>
          <section className="cf-permission-card" role="dialog" aria-modal="true" aria-labelledby="cf-permission-title">
            <button type="button" className="cf-modal-close" onClick={() => setPermissionOpen(false)} aria-label="Close camera setup"><X size={19} /></button>
            <span className="cf-permission-icon"><Camera size={24} /></span>
            <span className="cf-kicker">Your choice, always</span>
            <h2 id="cf-permission-title">Ready to use your camera?</h2>
            <p>Niakofa only asks when you tap the shutter. This prototype will show a simulated preview and will not turn on a real camera.</p>
            <div className="cf-permission-privacy"><LockKeyhole size={15} /> You can choose media from your device instead.</div>
            <button type="button" className="cf-publish-button cf-full" onClick={() => { setPermissionOpen(false); setCameraReady(true); inform("Simulated camera preview is ready. No camera has been accessed."); }}>Continue to camera preview <ArrowRight size={16} /></button>
            <button type="button" className="cf-secondary-button cf-full" onClick={() => { setPermissionOpen(false); pickMedia(); }}>Choose media instead <ImagePlus size={16} /></button>
          </section>
        </div>
      )}

      {templateOpen && (
        <div className="cf-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTemplateOpen(false); }}>
          <section className="cf-template-modal" role="dialog" aria-modal="true" aria-labelledby="cf-template-title">
            <div className="cf-template-header">
              <div><span className="cf-kicker">A starting point</span><h2 id="cf-template-title">Choose a template</h2><p>Keep the words personal. You can change them any time.</p></div>
              <button type="button" className="cf-modal-close" onClick={() => setTemplateOpen(false)} aria-label="Close templates"><X size={19} /></button>
            </div>
            <div className="cf-template-list">
              {templates.map((template) => (
                <button type="button" key={template.name} className={`cf-template-card cf-template-card--${template.tone}`} onClick={() => applyTemplate(template)}>
                  <span className="cf-template-card__motif" aria-hidden="true"><span /><span /><span /></span>
                  <span className="cf-template-card__copy"><small>{template.note}</small><strong>{template.name}</strong><span>{template.caption}</span></span>
                  <ArrowRight size={17} />
                </button>
              ))}
            </div>
            <p className="cf-template-foot"><ShieldCheck size={15} /> Templates add words only. They never include someone else’s media.</p>
          </section>
        </div>
      )}

      {notice && <div className="cf-toast" role="status" aria-live="polite">{notice}</div>}
    </div>
  );
}
