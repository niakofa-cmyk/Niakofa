import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowLeft, ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Cloud,
  Copy, FileImage, Film, ImagePlus, LockKeyhole, Music2, Pause, Play, Plus, RotateCcw,
  ShieldCheck, Sparkles, Sticker, Type, Upload, UsersRound, Volume2,
  X, Camera, SwitchCamera, Flashlight, Trash2, AtSign, Palette, Timer,
} from "lucide-react";
import "./_redesign.css";

type StudioStep = "source" | "edit" | "audience";
type MediaItem = {
  id: string;
  name: string;
  src: string;
  type: "image" | "video";
  alt: string;
  duration?: number;
  vtt?: string;
  sample?: boolean;
};
type OverlayItem = { id: string; type: "text" | "sticker" | "mention"; text: string; x: number; y: number };
type Tool = "text" | "stickers" | "draw" | "effects" | "templates" | "mentions" | "music";
type CameraMode = "photo" | "video";

const sampleImage = "/__mockup/images/spark-herbs.jpg";
const starterAlt = "Fresh herbs gathered in a paper-lined basket on a community garden table.";
const defaultCaption = "Fresh herbs from the garden are free for neighbors. Take what you need.";
const toolItems: Array<{ id: Tool; label: string; icon: typeof Type }> = [
  { id: "text", label: "Text", icon: Type },
  { id: "stickers", label: "Stickers", icon: Sticker },
  { id: "draw", label: "Draw", icon: Palette },
  { id: "effects", label: "Effects", icon: Sparkles },
  { id: "templates", label: "Templates", icon: Copy },
  { id: "mentions", label: "Mention", icon: AtSign },
  { id: "music", label: "Audio", icon: Volume2 },
];
const starterItems: MediaItem[] = [{
  id: "sample-herbs",
  name: "garden-herbs.jpg",
  src: sampleImage,
  type: "image",
  alt: starterAlt,
  sample: true,
}];

function loadDraft() {
  try {
    const value = localStorage.getItem("niakofa-spark-studio-redesign-v1");
    if (!value) return null;
    const parsed = JSON.parse(value) as { caption?: string; audience?: "community" | "hub"; tags?: string; overlays?: OverlayItem[] };
    return parsed;
  } catch {
    return null;
  }
}

function isVideo(file: File) {
  return file.type.startsWith("video/");
}

export function Redesign() {
  const [step, setStep] = useState<StudioStep>("source");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [activeMedia, setActiveMedia] = useState(0);
  const [caption, setCaption] = useState(defaultCaption);
  const [textOnly, setTextOnly] = useState("");
  const [audience, setAudience] = useState<"community" | "hub">("community");
  const [hubAvailable, setHubAvailable] = useState(true);
  const [keepArchive, setKeepArchive] = useState(false);
  const [allowResponses, setAllowResponses] = useState(false);
  const [momentTags, setMomentTags] = useState("garden, sharing");
  const [overlays, setOverlays] = useState<OverlayItem[]>([]);
  const [selectedOverlay, setSelectedOverlay] = useState("");
  const [activeTool, setActiveTool] = useState<Tool | null>(null);
  const [effect, setEffect] = useState("none");
  const [mention, setMention] = useState("@Mara");
  const [overlayText, setOverlayText] = useState("Take what you need");
  const [musicName, setMusicName] = useState("");
  const [musicRights, setMusicRights] = useState<"original" | "licensed">("original");
  const [musicLicense, setMusicLicense] = useState("");
  const [musicRightsConfirmed, setMusicRightsConfirmed] = useState(false);
  const [musicVolume, setMusicVolume] = useState(60);
  const [savedTemplates, setSavedTemplates] = useState<Array<{ name: string; caption: string; overlayText: string }>>([]);
  const [templateName, setTemplateName] = useState("A little help");
  const [showAccessibility, setShowAccessibility] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [notice, setNotice] = useState("");
  const [validation, setValidation] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [progressMessage, setProgressMessage] = useState("");
  const [processing, setProcessing] = useState(false);
  const [complete, setComplete] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraMode, setCameraMode] = useState<CameraMode>("video");
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");
  const [cameraTorch, setCameraTorch] = useState(false);
  const [cameraCountdown, setCameraCountdown] = useState(0);
  const [countdownChoice, setCountdownChoice] = useState(0);
  const [cameraRecording, setCameraRecording] = useState(false);
  const [cameraPaused, setCameraPaused] = useState(false);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const [clipCount, setClipCount] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(30);
  const [coverTime, setCoverTime] = useState(0);
  const [drawPaths, setDrawPaths] = useState<Array<{ id: string; points: string }>>([]);
  const galleryInput = useRef<HTMLInputElement>(null);
  const vttInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const cameraVideo = useRef<HTMLVideoElement>(null);
  const videoPreview = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunks = useRef<Blob[]>([]);
  const secondsRef = useRef(0);
  const recordTimer = useRef<number | null>(null);
  const countdownTimer = useRef<number | null>(null);
  const progressTimer = useRef<number | null>(null);
  const clipStartSeconds = useRef(0);
  const drawStart = useRef<{ id: string; path: string } | null>(null);
  const pointerDrag = useRef<{ id: string; x: number; y: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const currentItem = items[activeMedia];
  const hasVideo = items.some((item) => item.type === "video");
  const videoDuration = items.filter((item) => item.type === "video").reduce((sum, item) => sum + (item.duration ?? 0), 0);
  const isLongVideo = videoDuration > 180;
  const [exchangeListing, setExchangeListing] = useState("");
  const [familyChoice, setFamilyChoice] = useState<"none" | "private-original" | "moment-cutdown">("none");
  const [responseContext, setResponseContext] = useState(false);
  const [challengeContext, setChallengeContext] = useState(false);
  const [draftRecovered, setDraftRecovered] = useState(false);
  const [draftSaved, setDraftSaved] = useState(true);
  const [draftError, setDraftError] = useState(false);

  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      if (typeof draft.caption === "string") setCaption(draft.caption);
      if (draft.audience === "community" || draft.audience === "hub") setAudience(draft.audience);
      if (typeof draft.tags === "string") setMomentTags(draft.tags);
      if (Array.isArray(draft.overlays)) setOverlays(draft.overlays);
      setDraftRecovered(true);
    }
    try {
      const templates = localStorage.getItem("niakofa-spark-templates-v1");
      if (templates) setSavedTemplates(JSON.parse(templates) as Array<{ name: string; caption: string; overlayText: string }>);
    } catch {
      setSavedTemplates([]);
    }
  }, []);

  useEffect(() => {
    if (step === "source") return;
    setDraftSaved(false);
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem("niakofa-spark-studio-redesign-v1", JSON.stringify({
          caption, audience, tags: momentTags, overlays,
        }));
        setDraftSaved(true);
        setDraftError(false);
      } catch {
        setDraftSaved(false);
        setDraftError(true);
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [step, caption, audience, momentTags, overlays]);

  useEffect(() => () => {
    if (recordTimer.current) window.clearInterval(recordTimer.current);
    if (countdownTimer.current) window.clearTimeout(countdownTimer.current);
    if (progressTimer.current) window.clearInterval(progressTimer.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    items.forEach((item) => { if (!item.sample && item.src.startsWith("blob:")) URL.revokeObjectURL(item.src); });
  }, []);

  useEffect(() => {
    if (!cameraVideo.current || !streamRef.current) return;
    cameraVideo.current.srcObject = streamRef.current;
    void cameraVideo.current.play().catch(() => undefined);
  }, [cameraReady, cameraOpen]);

  useEffect(() => {
    const duration = currentItem?.duration || 30;
    setTrimStart(0);
    setTrimEnd(Math.min(duration, 30));
    setCoverTime(0);
  }, [currentItem?.id, currentItem?.duration]);

  const inform = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3000);
  };

  const enterEditor = (nextItems: MediaItem[], nextCaption = caption) => {
    setItems(nextItems);
    setActiveMedia(0);
    setCaption(nextCaption);
    setStep("edit");
    setValidation("");
    setComplete(false);
    setExchangeListing("");
  };

  const useSample = () => enterEditor(starterItems, defaultCaption);
  const useWords = () => {
    if (!textOnly.trim()) {
      setValidation("Add a few words first. A Spark can be text-only.");
      return;
    }
    enterEditor([], textOnly.trim());
  };

  const acceptFiles = (files: File[]) => {
    if (!files.length) return;
    if (files.length + items.length > 6) {
      setValidation("A Spark can include up to six photos or video clips.");
      return;
    }
    const supported = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"]);
    const unsupported = files.find((file) => !supported.has(file.type));
    if (unsupported) {
      setValidation(`${unsupported.name}: choose a JPG, PNG, WebP, GIF, MP4, or WebM file.`);
      return;
    }
    const newItems: MediaItem[] = files.slice(0, 6 - items.length).map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${Date.now()}-${index}`,
      name: file.name,
      src: URL.createObjectURL(file),
      type: isVideo(file) ? "video" : "image",
      alt: "",
      duration: isVideo(file) ? 0 : undefined,
    }));
    setItems((current) => [...current, ...newItems]);
    setStep("edit");
    setValidation("");
    setComplete(false);
    setActiveMedia(items.length);
    newItems.forEach((item) => {
      if (item.type !== "video") return;
      const video = document.createElement("video");
      video.preload = "metadata";
      video.src = item.src;
      video.onloadedmetadata = () => setItems((current) => current.map((currentItem) =>
        currentItem.id === item.id ? { ...currentItem, duration: Number.isFinite(video.duration) ? video.duration : 0 } : currentItem,
      ));
      video.onerror = () => setValidation(`${item.name} could not be inspected. Try another video file.`);
    });
    setActiveMedia((current) => current + newItems.length);
  };

  const onGalleryChange = (event: ChangeEvent<HTMLInputElement>) => {
    acceptFiles(Array.from(event.currentTarget.files ?? []));
    event.currentTarget.value = "";
  };

  const removeMedia = (itemId: string) => {
    const index = items.findIndex((item) => item.id === itemId);
    if (index < 0) return;
    const removed = items[index];
    if (!removed.sample && removed.src.startsWith("blob:")) URL.revokeObjectURL(removed.src);
    const next = items.filter((item) => item.id !== itemId);
    setItems(next);
    setActiveMedia(Math.max(0, Math.min(activeMedia > index ? activeMedia - 1 : activeMedia, next.length - 1)));
    if (next.every((item) => item.type !== "video")) setExchangeListing("");
  };

  const moveMedia = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const reordered = items.slice();
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    setItems(reordered);
    setActiveMedia(nextIndex);
  };

  const addOverlay = (type: OverlayItem["type"], text: string) => {
    const next: OverlayItem = { id: `overlay-${Date.now()}`, type, text, x: 50, y: type === "sticker" ? 36 : 43 };
    setOverlays((current) => [...current, next]);
    setSelectedOverlay(next.id);
    setActiveTool(null);
  };

  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>, overlay: OverlayItem) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    pointerDrag.current = { id: overlay.id, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedOverlay(overlay.id);
  };

  const handleDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointerDrag.current || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const drag = pointerDrag.current;
    const dx = ((event.clientX - drag.x) / rect.width) * 100;
    const dy = ((event.clientY - drag.y) / rect.height) * 100;
    pointerDrag.current = { ...drag, x: event.clientX, y: event.clientY };
    setOverlays((current) => current.map((overlay) => overlay.id === drag.id ? {
      ...overlay, x: Math.max(5, Math.min(95, overlay.x + dx)), y: Math.max(5, Math.min(95, overlay.y + dy)),
    } : overlay));
  };

  const handleDrawStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activeTool !== "draw" || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const point = `${((event.clientX - rect.left) / rect.width) * 100},${((event.clientY - rect.top) / rect.height) * 100}`;
    const id = `draw-${Date.now()}`;
    drawStart.current = { id, path: point };
    setDrawPaths((current) => [...current, { id, points: point }]);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDrawMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawStart.current || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const point = `${((event.clientX - rect.left) / rect.width) * 100},${((event.clientY - rect.top) / rect.height) * 100}`;
    const path = `${drawStart.current.path} ${point}`;
    drawStart.current = { ...drawStart.current, path };
    setDrawPaths((current) => current.map((line) => line.id === drawStart.current?.id ? { ...line, points: path } : line));
  };

  const enableCamera = async (facing = cameraFacing) => {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is not available in this browser. You can still choose media from your device.");
      return;
    }
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing } }, audio: true });
      streamRef.current = stream;
      setCameraFacing(facing);
      setCameraReady(true);
      setCameraError("");
      if (cameraVideo.current) {
        cameraVideo.current.srcObject = stream;
        void cameraVideo.current.play().catch(() => undefined);
      }
    } catch {
      setCameraError("Camera access was not granted. You can retry or pick media from your device.");
    }
  };

  const closeCamera = () => {
    if (recorderRef.current?.state === "recording" || recorderRef.current?.state === "paused") recorderRef.current.stop();
    if (recordTimer.current) window.clearInterval(recordTimer.current);
    if (countdownTimer.current) window.clearTimeout(countdownTimer.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
    setCameraReady(false);
    setCameraRecording(false);
    setCameraPaused(false);
    setCameraCountdown(0);
  };

  const capturePhoto = () => {
    const video = cameraVideo.current;
    if (!video || !video.videoWidth) {
      setCameraError("Wait for the camera preview to appear, then try again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return setCameraError("This photo could not be captured. Please try again.");
      const file = new File([blob], `spark-photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      acceptFiles([file]);
      closeCamera();
    }, "image/jpeg", .92);
  };

  const stopRecording = () => {
    if (recordTimer.current) window.clearInterval(recordTimer.current);
    recordTimer.current = null;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    setCameraRecording(false);
    setCameraPaused(false);
  };

  const startRecording = () => {
    if (!streamRef.current || clipCount >= 6 || items.length >= 6 || secondsRef.current >= 180) {
      setCameraError("This Spark has reached its six-clip or three-minute camera limit.");
      return;
    }
    const start = () => {
      try {
        clipStartSeconds.current = secondsRef.current;
        const recorder = new MediaRecorder(streamRef.current!);
        recorderChunks.current = [];
        recorderRef.current = recorder;
        recorder.ondataavailable = (event) => { if (event.data.size) recorderChunks.current.push(event.data); };
        recorder.onstop = () => {
          if (!recorderChunks.current.length) return;
          const file = new File(recorderChunks.current, `spark-clip-${Date.now()}.webm`, { type: recorder.mimeType || "video/webm" });
          const clip = {
            id: `camera-${Date.now()}`, name: file.name, src: URL.createObjectURL(file), type: "video" as const,
            alt: "", duration: Math.max(1, secondsRef.current - clipStartSeconds.current),
          };
          setItems((current) => [...current, clip]);
          setActiveMedia(items.length);
          setClipCount((current) => current + 1);
          inform("Clip added to your Spark. Record another or continue editing.");
        };
        recorder.start(250);
        setCameraRecording(true);
        setCameraPaused(false);
        setCameraError("");
        recordTimer.current = window.setInterval(() => {
          secondsRef.current += 1;
          setRecordedSeconds(secondsRef.current);
          if (secondsRef.current >= 180) stopRecording();
        }, 1000);
      } catch {
        setCameraError("Video recording is not supported on this device. Try a shorter clip from your gallery.");
      }
    };
    if (countdownChoice > 0) {
      setCameraCountdown(countdownChoice);
      let remaining = countdownChoice;
      countdownTimer.current = window.setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          if (countdownTimer.current) window.clearInterval(countdownTimer.current);
          setCameraCountdown(0);
          start();
        } else setCameraCountdown(remaining);
      }, 1000);
    } else start();
  };

  const pauseRecording = () => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.pause();
      if (recordTimer.current) window.clearInterval(recordTimer.current);
      setCameraPaused(true);
    } else if (recorderRef.current?.state === "paused") {
      recorderRef.current.resume();
      setCameraPaused(false);
      recordTimer.current = window.setInterval(() => {
        secondsRef.current += 1;
        setRecordedSeconds(secondsRef.current);
        if (secondsRef.current >= 180) stopRecording();
      }, 1000);
    }
  };

  const flipCamera = () => {
    const next = cameraFacing === "environment" ? "user" : "environment";
    void enableCamera(next);
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    const capabilities = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean } | undefined;
    if (!track || !capabilities?.torch) {
      setCameraError("Torch controls are not available on this camera.");
      return;
    }
    try {
      await track.applyConstraints({ advanced: [{ torch: !cameraTorch } as MediaTrackConstraintSet] });
      setCameraTorch((value) => !value);
    } catch {
      setCameraError("The camera could not change its torch setting.");
    }
  };

  const retakeLastClip = () => {
    const lastVideo = items.map((item, index) => ({ item, index })).filter(({ item }) => item.id.startsWith("camera-")).at(-1);
    if (!lastVideo) return;
    removeMedia(lastVideo.item.id);
    setClipCount((count) => Math.max(0, count - 1));
  };

  const toggleTool = (tool: Tool) => setActiveTool((active) => active === tool ? null : tool);

  const saveTemplate = () => {
    const template = { name: templateName.trim() || "Untitled template", caption, overlayText };
    const next = [template, ...savedTemplates.filter((item) => item.name !== template.name)].slice(0, 8);
    setSavedTemplates(next);
    try { localStorage.setItem("niakofa-spark-templates-v1", JSON.stringify(next)); } catch { inform("Template preview is ready, but local storage is unavailable."); return; }
    inform("Template saved on this device — media is not included.");
  };

  const loadTemplate = (template: { name: string; caption: string; overlayText: string }) => {
    setCaption(template.caption);
    setOverlayText(template.overlayText);
    setOverlays((current) => current.filter((item) => item.type !== "text"));
    setActiveTool(null);
    inform(`${template.name} applied. Your selected media stays as-is.`);
  };

  const setAlt = (itemId: string, alt: string) => setItems((current) => current.map((item) => item.id === itemId ? { ...item, alt } : item));
  const setVtt = (itemId: string, vtt: string) => setItems((current) => current.map((item) => item.id === itemId ? { ...item, vtt } : item));
  const handleVttFile = (event: ChangeEvent<HTMLInputElement>, itemId: string) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (file.size > 64 * 1024) {
      setValidation("WebVTT captions must be 64 KiB or smaller.");
      event.currentTarget.value = "";
      return;
    }
    void file.text().then((text) => {
      if (!text.trim().startsWith("WEBVTT")) {
        setValidation("This file does not start with a WEBVTT header.");
        return;
      }
      setVtt(itemId, text);
      setValidation("");
      inform("WebVTT captions added to the selected video.");
    });
    event.currentTarget.value = "";
  };

  const validateBeforeContinue = () => {
    const storyText = caption.trim();
    if (!items.length && !storyText) return "Add a photo, video, or a few words to continue.";
    const missingAlt = items.findIndex((item) => !item.alt.trim());
    if (missingAlt >= 0) {
      setActiveMedia(missingAlt);
      setShowAccessibility(true);
      return `Add alternative text for media ${missingAlt + 1}. A short, plain description helps neighbors who cannot see the image.`;
    }
    if (items.length > 6) return "A Spark can include up to six media items.";
    const tags = momentTags.split(",").map((tag) => tag.trim().replace(/^#/, "").toLowerCase()).filter(Boolean);
    if (tags.length > 10 || tags.some((tag) => tag.length > 30 || !/^[a-z0-9][a-z0-9-]*$/.test(tag)) || new Set(tags).size !== tags.length) {
      return "Moment tags are optional: use up to 10 unique tags, each 1–30 letters, numbers, or hyphens.";
    }
    for (const item of items) {
      if (item.type !== "video" || !item.vtt?.trim()) continue;
      const normalized = item.vtt.replace(/\r\n?/g, "\n").trim();
      if (new TextEncoder().encode(normalized).byteLength > 64 * 1024) return "Video captions must be 64 KiB or smaller.";
      if (!/^WEBVTT(?:\n\n|\n(?=\d{2}:)|$)/.test(normalized)) return "Video captions need a WEBVTT header.";
      const cues = normalized.replace(/^WEBVTT(?:[^\n]*)\n?/, "").trim().split(/\n{2,}/).filter(Boolean);
      if (!cues.length || cues.length > 100) return "Add between 1 and 100 WebVTT caption cues.";
      const maxTime = Math.min(180, item.duration || 180);
      for (const cue of cues) {
        const lines = cue.split("\n");
        const timing = /^((?:\d{2,}:)?[0-5]\d:[0-5]\d\.\d{3}) --> ((?:\d{2,}:)?[0-5]\d:[0-5]\d\.\d{3})$/.exec(lines.shift() ?? "");
        if (!timing || !lines.length || !lines.join("\n").trim()) return "Each WebVTT cue needs valid start and end times plus caption text.";
        const seconds = (value: string) => {
          const match = /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/.exec(value);
          return match ? Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000 : null;
        };
        const start = seconds(timing[1]);
        const end = seconds(timing[2]);
        if (start === null || end === null || end <= start || end > maxTime) return "WebVTT cue times must increase and stay within this video (up to 180 seconds).";
      }
    }
    if (isLongVideo && familyChoice === "none") {
      return "Choose how to handle this eligible long video: a private Family Story original with a Moment cutdown, or a cutdown only.";
    }
    if (isLongVideo && familyChoice !== "none" && trimEnd > 180) {
      return "Set a Moment cutdown of 180 seconds or less before continuing.";
    }
    if (musicName && !musicRightsConfirmed) return "Confirm that you created the audio or have permission to use it.";
    if (musicName && musicRights === "licensed" && !/^https:\/\/\S+$/i.test(musicLicense)) return "Add an HTTPS link for the music license or source.";
    return "";
  };

  const goAudience = () => {
    const error = validateBeforeContinue();
    if (error) {
      setValidation(error);
      return;
    }
    setValidation("");
    setStep("audience");
  };

  const beginPublishPreview = () => {
    const error = validateBeforeContinue();
    if (error) {
      setStep("edit");
      setValidation(error);
      return;
    }
    if (exchangeListing && (items.length !== 1 || items[0]?.type !== "video")) {
      setValidation("An Exchange-linked Spark uses one video only. Remove other media to continue.");
      return;
    }
    setValidation("");
    setComplete(false);
    setProcessing(false);
    setProgress(0);
    setProgressMessage("Preview-only upload simulation");
    let value = 0;
    progressTimer.current = window.setInterval(() => {
      value += 13;
      if (value >= 100) {
        if (progressTimer.current) window.clearInterval(progressTimer.current);
        progressTimer.current = null;
        setProgress(100);
        setProgressMessage("Reviewing the preview");
        setProcessing(true);
        window.setTimeout(() => {
          setProcessing(false);
          setComplete(true);
          setProgressMessage("Preview complete");
        }, 1250);
      } else {
        setProgress(value);
        setProgressMessage(`Preparing preview · ${Math.min(value, 99)}%`);
      }
    }, 240);
  };

  const cancelPublish = () => {
    if (progressTimer.current) window.clearInterval(progressTimer.current);
    progressTimer.current = null;
    setProgress(null);
    setProcessing(false);
    setComplete(false);
    setProgressMessage("");
    inform("Preview upload cancelled. Your local draft is still here.");
  };

  const setContext = (kind: "response" | "challenge") => {
    if (kind === "response") {
      if (!hasVideo) {
        inform("Video responses use video clips. Add a video before choosing this context.");
        return;
      }
      setResponseContext((value) => !value);
      setChallengeContext(false);
      setAudience("community");
    } else {
      setChallengeContext((value) => !value);
      setResponseContext(false);
    }
  };

  const toggleHubAvailability = () => {
    setHubAvailable((available) => {
      const next = !available;
      if (!next && audience === "hub") setAudience("community");
      return next;
    });
  };

  const toolPanel = () => {
    if (!activeTool) return null;
    return <section className="sr-panel" aria-label={`${activeTool} controls`}>
      <div className="sr-panel-head">
        <div><strong>{activeTool === "music" ? "Background music" : activeTool === "templates" ? "Saved templates" : activeTool === "effects" ? "A little atmosphere" : activeTool === "draw" ? "Draw on your moment" : activeTool === "mentions" ? "Mention a neighbor" : activeTool === "stickers" ? "Add a sticker" : "Text overlay"}</strong>
          <p>{activeTool === "music" ? "Video only. Rights are yours to confirm." : activeTool === "templates" ? "Templates keep style and words, never media." : activeTool === "draw" ? "Draw directly over the preview with your pointer or touch." : "Changes stay in this preview."}</p>
        </div>
        <button className="sr-icon-button" type="button" onClick={() => setActiveTool(null)} aria-label="Close editing tool"><X size={15} /></button>
      </div>
      {activeTool === "text" && <>
        <label>Overlay words<input className="sr-input" value={overlayText} onChange={(event) => setOverlayText(event.target.value)} /></label>
        <button className="sr-secondary" type="button" onClick={() => addOverlay("text", overlayText || "A little moment")}>Add draggable text</button>
      </>}
      {activeTool === "stickers" && <div className="sr-chip-row">
        {["Free to take", "Garden find", "Neighbor tip"].map((label) => <button key={label} type="button" className="sr-chip" onClick={() => addOverlay("sticker", label)}>{label}</button>)}
      </div>}
      {activeTool === "draw" && <><p className="sr-micro">Draw over the photo with a pointer or finger. Add a few strokes, or clear the marks to start fresh.</p><button className="sr-secondary" type="button" onClick={() => setDrawPaths([])}><RotateCcw size={14} /> Clear drawing</button></>}
      {activeTool === "effects" && <div className="sr-chip-row">
        {[["none", "Natural"], ["warm", "Garden warmth"], ["soft", "Soft light"], ["mono", "Quiet monochrome"]].map(([id, label]) => <button key={id} type="button" className={`sr-chip ${effect === id ? "is-on" : ""}`} onClick={() => setEffect(id)}>{label}</button>)}
      </div>}
      {activeTool === "templates" && <>
        <label>Template name<input className="sr-input" value={templateName} onChange={(event) => setTemplateName(event.target.value)} /></label>
        <button className="sr-secondary" type="button" onClick={saveTemplate}><Plus size={14} /> Save this look</button>
        {savedTemplates.length > 0 && <div className="sr-chip-row">{savedTemplates.map((template) => <button className="sr-chip" key={template.name} type="button" onClick={() => loadTemplate(template)}>{template.name}</button>)}</div>}
        <span className="sr-micro">Saved to this device. Photos and videos are never part of a template.</span>
      </>}
      {activeTool === "mentions" && <>
        <label>Neighbor name<input className="sr-input" value={mention} onChange={(event) => setMention(event.target.value)} /></label>
        <button className="sr-secondary" type="button" onClick={() => addOverlay("mention", mention.startsWith("@") ? mention : `@${mention}`)}>Place mention on preview</button>
      </>}
      {activeTool === "music" && <>
        <label>Music file<input className="sr-input" type="file" accept=".mp3,.ogg,.wav,audio/mpeg,audio/ogg,audio/wav" onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) {
            if (!file.type.startsWith("audio/")) setValidation("Choose an MP3, OGG, or WAV music file.");
            else { setMusicName(file.name); setMusicRightsConfirmed(false); setValidation(""); }
          }
          event.currentTarget.value = "";
        }} /></label>
        {musicName && <>
          <div className="sr-info-box"><Music2 size={15} /> {musicName} · {hasVideo ? "Ready to preview" : "Add a video before using music"}</div>
          <label>Rights basis<select className="sr-select" value={musicRights} onChange={(event) => { setMusicRights(event.target.value as "original" | "licensed"); setMusicRightsConfirmed(false); }}><option value="original">I created this recording</option><option value="licensed">I have a license to use it</option></select></label>
          {musicRights === "licensed" && <label>License or source URL<input className="sr-input" type="url" placeholder="https://…" value={musicLicense} onChange={(event) => setMusicLicense(event.target.value)} /></label>}
          <label className="sr-inline"><input type="checkbox" checked={musicRightsConfirmed} onChange={(event) => setMusicRightsConfirmed(event.target.checked)} /> I created this or have rights to reproduce and distribute it.</label>
          <label className="sr-inline">Music volume <input type="range" min="0" max="100" value={musicVolume} onChange={(event) => setMusicVolume(Number(event.target.value))} /> {musicVolume}%</label>
          <button className="sr-quiet" type="button" onClick={() => { setMusicName(""); setMusicRightsConfirmed(false); }}>Remove music</button>
          {exchangeListing && <div className="sr-validation">Background music is not supported for Exchange-linked video Sparks.</div>}
        </>}
      </>}
    </section>;
  };

  return <div className="spark-redesign">
    <header className="sr-topbar">
      <div className="sr-brand"><span className="sr-mark" aria-hidden="true">N</span><span className="sr-brand-copy"><b>Niakofa Studio</b><span>A moment for your neighbors</span></span></div>
      <ol className="sr-steps" aria-label="Spark creation steps">
        {(["source", "edit", "audience"] as const).map((item, index) => {
          const active = step === item;
          const done = (["source", "edit", "audience"].indexOf(step) > index);
          return <li key={item} className={`sr-step ${active ? "is-active" : ""} ${done ? "is-done" : ""}`}>
            <span className="sr-step__dot">{done ? <Check size={12} /> : index + 1}</span>
            {item === "source" ? "Start" : item === "edit" ? "Make it yours" : "Audience"}
          </li>;
        })}
      </ol>
      <div className="sr-top-actions"><span className="sr-saved" role="status">{draftError ? <><Cloud size={14} /> Draft details unavailable</> : draftSaved ? <><Cloud size={14} /> {draftRecovered ? "Draft details restored" : "Draft details saved"}</> : <><Cloud size={14} /> Saving draft details…</>}</span><span className="sr-avatar" aria-label="Your profile">M</span></div>
    </header>

    <main className="sr-workspace">
      <div className="sr-pagehead">
        <div>
          <p className="sr-eyebrow">A small moment, shared well</p>
          <h1>{step === "source" ? "What would you like to share?" : step === "edit" ? "Make this Spark yours." : "Choose where it belongs."}</h1>
          <p>{step === "source" ? "No need to make a big thing of it. Pick a starting point, and you can come back to this draft." : step === "edit" ? "A photo, a few words, a useful bit of help. Keep it true to the moment." : "Your Spark stays within the people and places you choose."}</p>
        </div>
        {(responseContext || challengeContext) && <span className="sr-context"><Sparkles size={14} /> {responseContext ? "Video response · Community" : "This week’s community challenge"}</span>}
      </div>

      {step === "source" ? <section className="sr-card sr-source-card">
        <h2>Start with what you have.</h2>
        <p>Choose a way in. Your camera stays off until you choose to use it.</p>
        <div className="sr-source-grid">
          <button className="sr-source-option sr-source-option--featured" type="button" onClick={() => { setCameraOpen(true); setCameraError(""); }}>
            <span className="sr-option-icon"><Camera size={19} /></span>
            <span className="sr-option-copy"><strong>Take a photo or video</strong><small>Use your camera · up to 6 clips, 3 minutes total</small></span>
          </button>
          <button className="sr-source-option" type="button" onClick={() => galleryInput.current?.click()}>
            <span className="sr-option-icon"><ImagePlus size={19} /></span>
            <span className="sr-option-copy"><strong>Choose from device</strong><small>Select several photos or videos in the order you like</small></span>
          </button>
          <button className="sr-source-option" type="button" onClick={() => { document.getElementById("sr-start-words")?.focus(); }}>
            <span className="sr-option-icon"><Type size={19} /></span>
            <span className="sr-option-copy"><strong>Start with words</strong><small>Write a quick note. No photo needed.</small></span>
          </button>
        </div>
        <div className="sr-source-bottom">
          <div className="sr-text-start">
            <input id="sr-start-words" className="sr-input" placeholder="A few words for your neighbors…" value={textOnly} onChange={(event) => setTextOnly(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") useWords(); }} />
            <button className="sr-primary" type="button" onClick={useWords}>Start with words <ArrowRight size={15} /></button>
          </div>
          <button className="sr-quiet" type="button" onClick={useSample}>Try a sample moment <ChevronRight size={14} /></button>
        </div>
        {validation && <p className="sr-validation" role="alert">{validation}</p>}
        <div className="sr-source-note"><ShieldCheck size={16} /><span>Sparks are for approved neighbors, not a public audience. You’ll choose a Community or Hub before sharing.</span></div>
      </section> : step === "edit" ? <div className="sr-layout">
        <section className="sr-stage">
          <div className="sr-card sr-preview-card">
            <div className="sr-preview-top">
              <div><strong>Your Spark preview</strong><br /><span>{items.length ? `${items.length} of 6 media items · item ${activeMedia + 1}` : "Text-only moment"}</span></div>
              <div className="sr-preview-actions">
                <button className="sr-icon-button" type="button" onClick={() => setActiveMedia((index) => Math.max(0, index - 1))} aria-label="Previous media" disabled={!items.length || activeMedia === 0}><ChevronLeft size={16} /></button>
                <button className="sr-icon-button" type="button" onClick={() => setActiveMedia((index) => Math.min(items.length - 1, index + 1))} aria-label="Next media" disabled={activeMedia >= items.length - 1}><ChevronRight size={16} /></button>
                <button className="sr-icon-button" type="button" onClick={() => currentItem && removeMedia(currentItem.id)} aria-label="Remove selected media" disabled={!currentItem}><Trash2 size={15} /></button>
              </div>
            </div>
            <div className={`sr-media-canvas ${effect === "warm" ? "sr-media-canvas--warm" : effect === "soft" ? "sr-media-canvas--soft" : effect === "mono" ? "sr-media-canvas--mono" : ""} ${activeTool === "draw" ? "sr-drag-mode" : ""}`}
              ref={stageRef} onPointerDown={handleDrawStart} onPointerMove={handleDrawMove} onPointerUp={() => { drawStart.current = null; }}>
              {currentItem ? currentItem.type === "video" ? <video ref={videoPreview} key={currentItem.id} src={currentItem.src} controls playsInline aria-label={currentItem.alt || "Video preview"} onLoadedMetadata={(event) => { event.currentTarget.currentTime = trimStart; }} onTimeUpdate={(event) => {
                if (event.currentTarget.currentTime >= trimEnd) {
                  event.currentTarget.pause();
                  event.currentTarget.currentTime = trimStart;
                }
              }} /> : <img src={currentItem.src} alt={currentItem.alt || "Selected Spark photo preview"} /> :
                <div className="sr-text-visual"><div className="sr-preview-copy"><span>Niakofa / Spark</span><strong>{caption || "Your words belong here."}</strong><small>Shared with care, close to home.</small></div></div>}
              {currentItem && <div className="sr-media-tint" />}
              {currentItem && <div className="sr-preview-copy"><span>Maplewood · Community</span><strong>{caption.trim() || "A moment from today."}</strong><small>Only for approved neighbors</small></div>}
              <svg className="sr-drawing" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Drawing overlay">
                {drawPaths.map((path) => <polyline key={path.id} points={path.points} fill="none" stroke="#fff4bc" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
              </svg>
              {overlays.map((overlay) => <div key={overlay.id} className={`sr-overlay sr-overlay--${overlay.type} ${selectedOverlay === overlay.id ? "is-selected" : ""}`}
                style={{ left: `${overlay.x}%`, top: `${overlay.y}%` }} onPointerDown={(event) => handleDragStart(event, overlay)} onPointerMove={handleDragMove}
                onPointerUp={() => { pointerDrag.current = null; }} onKeyDown={(event) => {
                  if (event.key === "Delete" || event.key === "Backspace") setOverlays((all) => all.filter((item) => item.id !== overlay.id));
                  const deltas: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
                  const delta = deltas[event.key];
                  if (delta) setOverlays((all) => all.map((item) => item.id === overlay.id ? { ...item, x: item.x + delta[0], y: item.y + delta[1] } : item));
                }} role="button" tabIndex={0} aria-label={`Move ${overlay.type}: ${overlay.text}`}>{overlay.text}</div>)}
            </div>
            {items.length > 0 && <div className="sr-sequence" aria-label="Media in Spark order">
              {items.map((item, index) => <div key={item.id} className="sr-sequence-unit">
                <button type="button" className={`sr-thumb ${activeMedia === index ? "is-current" : ""}`} onClick={() => setActiveMedia(index)} aria-label={`Select media ${index + 1}: ${item.name}`}>
                  {item.type === "video" ? <video src={item.src} muted playsInline /> : <img src={item.src} alt="" />}<b>{index + 1}</b>
                </button>
                <span className="sr-micro sr-order-controls">
                  <button type="button" className="sr-quiet" aria-label={`Move item ${index + 1} earlier`} onClick={() => moveMedia(index, -1)} disabled={index === 0}><ChevronLeft size={12} /></button>
                  <button type="button" className="sr-quiet" aria-label={`Move item ${index + 1} later`} onClick={() => moveMedia(index, 1)} disabled={index === items.length - 1}><ChevronRight size={12} /></button>
                </span>
              </div>)}
              {items.length < 6 && <><button className="sr-add-media" type="button" onClick={() => galleryInput.current?.click()}><ImagePlus size={17} /> Add media</button><button className="sr-add-media" type="button" onClick={() => { setCameraOpen(true); setCameraError(""); }}><Camera size={17} /> Camera</button></>}
            </div>}
            <nav className="sr-tools" aria-label="Spark editing tools">
              {toolItems.map(({ id, label, icon: Icon }) => <button className={`sr-tool ${activeTool === id ? "is-active" : ""} ${exchangeListing ? "is-limited" : ""}`} type="button" key={id} onClick={() => {
                if (exchangeListing) {
                  inform("Editing overlays, effects, and audio are not available for an Exchange-linked video.");
                  return;
                }
                toggleTool(id);
              }} aria-pressed={activeTool === id} title={exchangeListing ? "Not available for Exchange-linked videos" : undefined}><Icon /><span>{label}</span></button>)}
            </nav>
            {toolPanel()}
            {currentItem?.type === "video" && <>
              <section className="sr-panel">
                <div className="sr-panel-head"><div><strong>Video trim & cover</strong><p>Set a preview cut and choose the cover moment.</p></div><Film size={17} /></div>
                <label>Trim start · {trimStart.toFixed(1)}s <input type="range" min="0" max={Math.max(0, (currentItem.duration || 30) - .1)} step=".1" value={trimStart} onChange={(event) => {
                  const start = Number(event.target.value);
                  setTrimStart(start);
                  if (trimEnd <= start) setTrimEnd(Math.min(currentItem.duration || 30, start + .1));
                }} /></label>
                <label>Trim end · {trimEnd.toFixed(1)}s <input type="range" min={Math.min(currentItem.duration || 30, trimStart + .1)} max={currentItem.duration || 30} step=".1" value={Math.min(trimEnd, currentItem.duration || 30)} onChange={(event) => setTrimEnd(Number(event.target.value))} /></label>
                <label>Cover frame · {coverTime.toFixed(1)}s <input type="range" min={trimStart} max={Math.max(trimStart, trimEnd)} step=".1" value={Math.min(coverTime, trimEnd)} onChange={(event) => setCoverTime(Number(event.target.value))} /></label>
                <div className="sr-video-edit-actions"><button className="sr-secondary" type="button" onClick={() => { if (videoPreview.current) { videoPreview.current.currentTime = trimStart; void videoPreview.current.play().catch(() => undefined); } }}>Preview trim</button><button className="sr-quiet" type="button" onClick={() => { if (videoPreview.current) videoPreview.current.currentTime = coverTime; }}>View cover frame</button></div>
                <div className="sr-micro">Clip length: {currentItem.duration ? `${Math.round(currentItem.duration)} seconds` : "duration will appear after inspection"} · Video Moments support up to 180 seconds. Cover preview {coverTime.toFixed(1)}s.</div>
              </section>
              {exchangeListing && <div className="sr-validation">Exchange-linked video capability limits: one original video and caption only; no overlays, effects, or background music. It appears in Exchange while your listing is active, not in 24-hour Moments.</div>}
            </>}
            {validation && <p className="sr-validation" role="alert">{validation}</p>}
            <div className="sr-edit-form">
              <label><span className="sr-field-label">Caption <small>{caption.length}/500</small></span><textarea className="sr-textarea" maxLength={500} value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="What would you like neighbors to know?" /></label>
              <div className="sr-caption-preview"><label className="sr-inline"><input type="checkbox" checked={showAccessibility} onChange={(event) => setShowAccessibility(event.target.checked)} /> Accessibility and Moment tags <ChevronDown size={14} /></label>
                {showAccessibility && <div className="sr-panel">
                  <label>Moment tags <small className="sr-micro">Optional · separate with commas</small><input className="sr-input" value={momentTags} onChange={(event) => setMomentTags(event.target.value)} placeholder="garden, sharing" /></label>
                  {items.map((item, index) => <div className="sr-accessibility-item" key={item.id}>
                    <label><span className="sr-field-label">Alt text · item {index + 1} <small>Required</small></span><textarea className="sr-textarea" value={item.alt} onChange={(event) => setAlt(item.id, event.target.value)} placeholder="Describe what is visible, simply and clearly." maxLength={250} /></label>
                    {item.type === "video" && <div className="sr-vtt">
                      <label>Video captions <small className="sr-micro">Optional WebVTT · up to 64 KiB</small><textarea className="sr-textarea" value={item.vtt ?? ""} onChange={(event) => setVtt(item.id, event.target.value)} placeholder={"WEBVTT\n\n00:00:00.000 --> 00:00:02.500\nAdd spoken words here."} /></label>
                      <button className="sr-quiet" type="button" onClick={() => vttInputs.current[item.id]?.click()}><Upload size={13} /> Choose a .vtt file</button>
                      <input ref={(node) => { vttInputs.current[item.id] = node; }} className="sr-hidden" type="file" accept=".vtt,text/vtt" onChange={(event) => handleVttFile(event, item.id)} aria-label={`Choose WebVTT captions for item ${index + 1}`} />
                    </div>}
                  </div>)}
                  <p className="sr-micro">Alt text is required for each photo or video. Captions are optional and help make spoken video content accessible.</p>
                </div>}
              </div>
            </div>
          </div>

          {step === "edit" && <div className="sr-actions sr-editor-actions">
            <button className="sr-quiet" type="button" onClick={() => setStep("source")}><ArrowLeft size={14} /> Start over</button>
            <button className="sr-primary" type="button" onClick={goAudience}>Choose audience <ArrowRight size={15} /></button>
          </div>}
        </section>

        <aside className="sr-side">
          {step === "edit" ? <div className="sr-card sr-side-card">
            <h2>Give it a home.</h2>
            <p>Audience comes after editing. You can adjust it before your preview.</p>
            <div className="sr-info-box"><LockKeyhole size={15} /> Nothing is public. Approved members only, for 24 hours.</div>
            <div className="sr-side-section"><span className="sr-side-label">Your context</span>
              <button className={`sr-chip ${responseContext ? "is-on" : ""}`} type="button" onClick={() => setContext("response")}>Video response</button>
              <button className={`sr-chip ${challengeContext ? "is-on" : ""}`} type="button" onClick={() => setContext("challenge")}>Weekly challenge</button>
              <button className="sr-chip" type="button" onClick={toggleHubAvailability}>{hubAvailable ? "Hub available" : "Hub unavailable"}</button>
            </div>
            {hasVideo && <div className="sr-side-section">
              <span className="sr-side-label">Optional video route</span>
              <label className="sr-check-row"><input type="checkbox" checked={!!exchangeListing} onChange={(event) => {
                const enabled = event.target.checked;
                setExchangeListing(enabled ? "garden-listing" : "");
                if (enabled) {
                  setAudience("community");
                  setOverlays([]);
                  setEffect("none");
                  setMusicName("");
                  setMusicRightsConfirmed(false);
                  setActiveTool(null);
                }
              }} /><span><b>Link active Exchange listing</b><small>Only videos · an owned, active listing is required</small></span></label>
              {exchangeListing && <div className="sr-exchange-detail">
                <label>Active listing<select className="sr-select" value={exchangeListing} onChange={(event) => setExchangeListing(event.target.value)}><option value="garden-listing">Community seedling exchange · Maplewood</option></select></label>
                <p className="sr-micro">This is distinct from a 24-hour Spark: original video and caption only. No overlays, effects, or music. It is visible in Exchange while the listing is active.</p>
              </div>}
            </div>}
            {isLongVideo && <div className="sr-side-section">
              <span className="sr-side-label">Long video · over 3 minutes</span>
              <div className="sr-info-box"><LockKeyhole size={15} /> For an eligible long video, choose a ≤180 second Moment cutdown. A full original stays private only if you choose that option.</div>
              <label className="sr-check-row"><input type="radio" name="family-copy" checked={familyChoice === "none"} onChange={() => setFamilyChoice("none")} /><span><b>No Family Story copy</b><small>Prepare a Moment cutdown only.</small></span></label>
              <label className="sr-check-row"><input type="radio" name="family-copy" checked={familyChoice === "private-original"} onChange={() => setFamilyChoice("private-original")} /><span><b>Private full original + Moment cutdown</b><small>The original remains private. Only the cutdown is for the Spark.</small></span></label>
              <label className="sr-check-row"><input type="radio" name="family-copy" checked={familyChoice === "moment-cutdown"} onChange={() => setFamilyChoice("moment-cutdown")} /><span><b>Make a Moment cutdown</b><small>Only the chosen cutdown is visible for 24 hours.</small></span></label>
              <p className="sr-micro">Choice shown for this eligible long-video example. This prototype does not copy or publish media.</p>
            </div>}
            <div className="sr-side-section">
              <span className="sr-side-label">Privacy choices</span>
              {!exchangeListing ? <>
                <label className="sr-check-row"><input type="checkbox" checked={keepArchive} onChange={(event) => setKeepArchive(event.target.checked)} /><span><b>Keep a private archive copy</b><small>Only Sparks you choose to save. Existing media is never archived automatically.</small></span></label>
                <label className="sr-check-row"><input type="checkbox" checked={allowResponses} onChange={(event) => setAllowResponses(event.target.checked)} disabled={responseContext} /><span><b>Allow video responses</b><small>Neighbors can respond with a short video in your Community.</small></span></label>
              </> : <p className="sr-micro">Private archive and video-response options do not apply to this Exchange route.</p>}
            </div>
            <details className="sr-advanced" open={showAdvanced} onToggle={(event) => setShowAdvanced(event.currentTarget.open)}>
              <summary>More about this preview</summary>
              <div>
                <label className="sr-check-row"><input type="checkbox" checked={hubAvailable} onChange={toggleHubAvailability} /><span><b>Show This Hub as available</b><small>Demo control for the optional Hub destination.</small></span></label>
                <div className="sr-info-box"><Clock3 size={15} /> Community and Hub Sparks last 24 hours. A Hub Spark is seen only by approved members of that Hub.</div>
                <button className="sr-quiet" type="button" onClick={() => { setValidation("Preview connection interrupted. Your draft remains available."); }}><CircleHelpIcon /> Simulate a review error</button>
              </div>
            </details>
            <div className="sr-actions"><button className="sr-quiet" type="button" onClick={() => setStep("edit")}><ArrowLeft size={14} /> Edit</button><button className="sr-primary" type="button" onClick={beginPublishPreview} disabled={progress !== null && !complete}>{complete ? "Preview again" : "Preview publish"} <ArrowRight size={15} /></button></div>
            <p className="sr-footer-note"><ShieldCheck size={14} /> Preview only — no upload, post, or publish request is made.</p>
            {validation && <p className="sr-validation" role="alert">{validation}</p>}
            {progress !== null && <div className="sr-side-section" role="status" aria-live="polite">
              {complete ? <div className="sr-result"><strong><Check size={15} /> Preview complete — not published</strong><p>This is only a local demonstration. Your content has not been sent anywhere.</p><button className="sr-quiet" type="button" onClick={() => { setProgress(null); setComplete(false); }}>Dismiss</button></div> :
                <><p className="sr-status">{processing ? <Clock3 size={15} /> : <Upload size={15} />}{processing ? "Reviewing the preview state…" : progressMessage}</p><div className="sr-progress"><span style={{ width: `${progress}%` }} /></div><button className="sr-quiet" type="button" onClick={cancelPublish}>Cancel preview</button></>}
            </div>}
          </div> : <div className="sr-card sr-side-card sr-source-side">
            <div className="sr-info-box"><ShieldCheck size={16} /> Your moment reaches approved members in your Community, or one Hub you belong to.</div>
            <div className="sr-side-section"><span className="sr-side-label">This Studio keeps things simple</span><div className="sr-source-fact"><FileImage size={16} /><span><b>Up to six media items</b><small>Photos and video, in the order you choose.</small></span></div><div className="sr-source-fact"><Clock3 size={16} /><span><b>Three minutes of video</b><small>Camera clips can be paused and added in sequence.</small></span></div><div className="sr-source-fact"><LockKeyhole size={16} /><span><b>Your audience, your call</b><small>Approved Community or Hub members only.</small></span></div></div>
            <p className="sr-micro">A Spark is a brief personal moment, not an influencer post.</p>
          </div>}
        </aside>
      </div> : null}

      {step === "audience" && <div className="sr-review-layout">
        <section className="sr-card sr-review-main">
          <div className="sr-review-header"><div><p className="sr-eyebrow">The final step</p><h2>Where should this Spark land?</h2><p>Choose who can see this moment before the preview is prepared.</p></div><div className="sr-review-illustration"><UsersRound size={29} /></div></div>
          {(responseContext || challengeContext) && <div className="sr-info-box">{responseContext ? "Video response to a neighbor’s Spark. It will be shared with your Community." : "Your Spark will join this week’s community challenge."}</div>}
          {exchangeListing && <div className="sr-info-box"><Film size={15} /> Exchange listing-linked video: appears in Exchange while the listing is active; not in 24-hour Moments. Original video and caption only.</div>}
          <span className="sr-side-label">Who should see it?</span>
          <div className="sr-choice-list">
            <button type="button" className={`sr-audience-choice ${audience === "community" ? "is-selected" : ""}`} onClick={() => { setAudience("community"); if (exchangeListing) setExchangeListing(""); }} disabled={!!exchangeListing}>
              <span className="sr-radio" /><UsersRound size={17} /><span><strong>Your Community</strong><small>Only approved community members can see it for 24 hours.</small></span>
            </button>
            {hubAvailable && !responseContext && <button type="button" className={`sr-audience-choice ${audience === "hub" ? "is-selected" : ""}`} onClick={() => { setAudience("hub"); setAllowResponses(false); if (exchangeListing) setExchangeListing(""); }} disabled={!!exchangeListing}>
              <span className="sr-radio" /><LockKeyhole size={17} /><span><strong>This Hub · Maplewood Garden Circle</strong><small>Only approved members of this Hub can see it for 24 hours.</small></span>
            </button>}
          </div>
          <div className="sr-review-bottom">
            <div className="sr-info-box"><Clock3 size={16} /><span><b>24-hour lifetime</b><br />Your Spark disappears from Moments after 24 hours. Private copies are only made if you choose them.</span></div>
            <div className="sr-info-box"><ShieldCheck size={16} /><span><b>Just the people you chose</b><br />This is a neighbor-to-neighbor moment within approved Community or Hub membership.</span></div>
          </div>
          <div className="sr-actions"><button className="sr-secondary" type="button" onClick={() => setStep("edit")}><ArrowLeft size={14} /> Back to editing</button><button className="sr-primary" type="button" onClick={beginPublishPreview}>Prepare preview only <ArrowRight size={15} /></button></div>
        </section>
        <aside className="sr-card sr-side-card sr-review-side">
          <span className="sr-side-label">Before you continue</span>
          <div className="sr-result"><strong>{audience === "hub" ? "This Hub" : "Your Community"}</strong><p>{exchangeListing ? "Exchange route · linked to active listing" : "Approved members · 24 hours"}</p></div>
          <div className="sr-side-section"><strong className="sr-review-caption">“{caption || "A note for your neighbors"}”</strong><p className="sr-micro">{items.length ? `${items.length} ordered ${items.length === 1 ? "attachment" : "attachments"}` : "Text-only Spark"}</p></div>
          <div className="sr-actions"><button className="sr-primary sr-full" type="button" onClick={beginPublishPreview}>Prepare preview only <ArrowRight size={15} /></button></div>
          <p className="sr-footer-note"><LockKeyhole size={14} /> Nothing leaves this browser in the prototype.</p>
          {validation && <p className="sr-validation" role="alert">{validation}</p>}
          {progress !== null && <div role="status" aria-live="polite">
            {complete ? <div className="sr-result"><strong>Preview complete — not published</strong><p>No media was uploaded and no Spark was published.</p><button className="sr-quiet" type="button" onClick={() => { setProgress(null); setComplete(false); }}>Dismiss</button></div> :
              <><p className="sr-status">{processing ? "Reviewing the preview…" : progressMessage}</p><div className="sr-progress"><span style={{ width: `${progress}%` }} /></div><button className="sr-quiet" type="button" onClick={cancelPublish}>Cancel preview</button></>}
          </div>}
        </aside>
      </div>}
      <input ref={galleryInput} className="sr-hidden" type="file" accept="image/*,video/*" multiple onChange={onGalleryChange} aria-label="Choose photos and videos from your device" />
    </main>

    {cameraOpen && <div className="sr-camera-backdrop" role="dialog" aria-modal="true" aria-label="Spark camera">
      <div className="sr-camera">
        <button className="sr-icon-button sr-camera-close" type="button" onClick={closeCamera} aria-label="Close camera"><X size={17} /></button>
        <div className="sr-camera-view">
          {cameraReady ? <video ref={cameraVideo} muted playsInline autoPlay aria-label="Spark camera preview" /> :
            <div className="sr-camera-placeholder"><div><Camera size={27} /><strong>A little moment, right here.</strong><p>Your camera is off. Turn it on only when you’re ready; device media is another easy option.</p></div></div>}
          <span className="sr-camera-status">{cameraCountdown ? `Starting in ${cameraCountdown}` : cameraRecording ? cameraPaused ? "Recording paused" : "Recording" : `Clip ${clipCount} of 6 · ${recordedSeconds}s / 180s`}</span>
        </div>
        <div className="sr-camera-controls">
          <div><p className="sr-eyebrow">Camera</p><h2>Capture at your pace.</h2><p>Camera recording supports up to six clips and three minutes total. Pause, resume, or retake before moving on.</p></div>
          <div className="sr-camera-settings">
            <span className="sr-side-label">Capture mode</span>
            <div className="sr-chip-row"><button type="button" className={`sr-chip ${cameraMode === "photo" ? "is-on" : ""}`} onClick={() => setCameraMode("photo")}>Photo</button><button type="button" className={`sr-chip ${cameraMode === "video" ? "is-on" : ""}`} onClick={() => setCameraMode("video")}>Video clip</button></div>
            <label className="sr-inline"><Timer size={14} /> Countdown <select className="sr-select" value={countdownChoice} onChange={(event) => setCountdownChoice(Number(event.target.value))}><option value="0">Off</option><option value="3">3 seconds</option><option value="10">10 seconds</option></select></label>
            <div className="sr-camera-button-row">
              {!cameraReady ? <button type="button" className="sr-primary" onClick={() => void enableCamera()}>Turn camera on</button> :
                cameraMode === "photo" ? <button type="button" className="sr-primary" onClick={capturePhoto}><Camera size={15} /> Take photo</button> :
                  !cameraRecording ? <button type="button" className="sr-primary" disabled={clipCount >= 6 || recordedSeconds >= 180} onClick={startRecording}><Play size={15} /> Record clip</button> :
                    <><button type="button" className="sr-secondary" onClick={pauseRecording}>{cameraPaused ? <Play size={14} /> : <Pause size={14} />}{cameraPaused ? "Resume" : "Pause"}</button><button type="button" className="sr-primary" onClick={stopRecording}>Finish clip</button></>}
            </div>
            <div className="sr-camera-button-row">
              <button className="sr-quiet" type="button" onClick={flipCamera} disabled={!cameraReady}><SwitchCamera size={14} /> Switch camera</button>
              <button className="sr-quiet" type="button" onClick={() => void toggleTorch()} disabled={!cameraReady}><Flashlight size={14} /> {cameraTorch ? "Torch on" : "Torch"}</button>
              <button className="sr-quiet" type="button" onClick={retakeLastClip} disabled={!clipCount}><RotateCcw size={14} /> Retake last</button>
            </div>
            {cameraError && <p className="sr-validation" role="alert">{cameraError}</p>}
            <div className="sr-info-box"><ShieldCheck size={15} /> Clips stay on your device until you choose a destination. You can add media or begin with words instead.</div>
            <div className="sr-camera-button-row"><button type="button" className="sr-secondary" onClick={() => { closeCamera(); galleryInput.current?.click(); }}><ImagePlus size={15} /> Choose device media</button>
              {items.length > 0 && <button type="button" className="sr-primary" onClick={() => { closeCamera(); setStep("edit"); }}>Use {items.length} clip{items.length === 1 ? "" : "s"} <ArrowRight size={15} /></button>}</div>
          </div>
        </div>
      </div>
    </div>}
    {notice && <div className="sr-notice" role="status">{notice}</div>}
  </div>;
}

function CircleHelpIcon() {
  return <span aria-hidden="true" style={{ display: "inline-grid", width: 15, height: 15, placeItems: "center", border: "1px solid currentColor", borderRadius: "50%", fontSize: 10 }}>?</span>;
}
