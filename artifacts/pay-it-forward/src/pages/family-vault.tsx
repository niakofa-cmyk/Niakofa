/**
 * Family Vault — memories, interviews, and members for a single Family Space
 * Route: /family/:id
 *
 * Features:
 * - Photo / audio / document upload (base64 direct-upload, up to 20 MB)
 * - In-app oral history recording with guided prompts (MediaRecorder API)
 * - Nia-powered translation for memory text (Claude via /api/family/:id/memories/:memId/translate)
 * - GEDCOM family-tree import (client-side parse → backend member insert)
 * - Flash-empty prevention on network errors (hasEverLoaded + keepPreviousData pattern)
 * - Upload session-expiry detection (401 → "sign in and retry" guidance)
 * - Failed-upload retry (stores memoryId so user can re-attach file without re-entering metadata)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft, Plus, Search, Image, Mic, FileText, Video,
  BookHeart, Loader2, Calendar, MapPin,
  ChevronRight, Trash2, UserPlus, Upload, AlertCircle, RefreshCw,
  X, Square, TreePine, Languages, ChevronLeft, CheckCircle2,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "sonner";

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface Family {
  id: number;
  name: string;
  description: string | null;
  cover_image_url: string | null;
}

interface FamilyMember {
  id: number;
  display_name: string;
  role: string;
  status: string;
  user_id: number | null;
  relation_note: string | null;
}

interface Memory {
  id: number;
  title: string | null;
  description: string | null;
  story: string | null;
  memory_date: string | null;
  memory_date_precision: string;
  location_label: string | null;
  source: string;
  visibility: string;
  created_at: string;
  updated_at: string;
  primary_asset: {
    id: number;
    asset_type: string;
    storage_key: string;
    thumbnail_key: string | null;
    processing_status: string;
  } | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ORAL_HISTORY_PROMPTS = [
  "Please share your full name and where you were born.",
  "Tell me about your earliest childhood memory.",
  "Describe the home you grew up in — the sights, sounds, and smells.",
  "Who were the most important people in your early life, and why?",
  "What was it like growing up in your community or neighborhood?",
  "Tell me about your parents and grandparents — what do you know of their lives?",
  "What traditions did your family observe — holidays, food, prayer, or song?",
  "What was the hardest time in your life, and how did you get through it?",
  "How did you meet your partner, or who was the great love of your life?",
  "What wisdom or values do you most want to pass down to future generations?",
];

const TRANSLATE_LANGUAGES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  pt: "Portuguese (Brazilian)",
  ht: "Haitian Creole",
  sw: "Swahili",
  yo: "Yoruba",
  am: "Amharic",
  ar: "Arabic",
  ha: "Hausa",
  ig: "Igbo",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMemoryDate(date: string | null, precision: string) {
  if (!date) return null;
  const d = new Date(date);
  if (precision === "year")  return d.getFullYear().toString();
  if (precision === "month") return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
  if (precision === "circa") return `c. ${d.getFullYear()}`;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function sourceIcon(source: string) {
  switch (source) {
    case "interview": return <Mic   className="w-3.5 h-3.5" />;
    case "document":  return <FileText className="w-3.5 h-3.5" />;
    default:          return <Image className="w-3.5 h-3.5" />;
  }
}

function mimeToAssetType(mime: string): "photo" | "audio" | "video" | "document" {
  if (mime.startsWith("image/"))  return "photo";
  if (mime.startsWith("audio/"))  return "audio";
  if (mime.startsWith("video/"))  return "video";
  return "document";
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/** Pick the best audio MIME type MediaRecorder supports */
function getPreferredMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]) {
    try { if (MediaRecorder.isTypeSupported(t)) return t; } catch { /* ignore */ }
  }
  return "";
}

/** Convert a File/Blob to a base64 data URL */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

type TabId = "memories" | "members" | "interviews";

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FamilyVaultPage() {
  const { currentUser } = useAppContext();
  const { id, familyId: fidParam } = useParams<{ id: string; familyId: string }>();
  const [, navigate] = useLocation();
  const familyId = Number(id ?? fidParam);

  const [tab, setTab]             = useState<TabId>("memories");
  const [family, setFamily]       = useState<Family | null>(null);
  const [myRole, setMyRole]       = useState<string>("contributor");
  const [members, setMembers]     = useState<FamilyMember[]>([]);
  const [memoryCount, setMemoryCount] = useState(0);
  const [memories, setMemories]   = useState<Memory[]>([]);

  // Loading / error state — hasEverLoaded prevents empty-state flash on network errors.
  // On background refreshes we leave the previous list visible (no flash).
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState(false);
  const hasEverLoaded             = useRef(false);

  const [searchQ, setSearchQ]     = useState("");
  const [mediaFilter, setMediaFilter] = useState<"all" | "photo" | "audio" | "video" | "document">("all");
  const [showAddMemory, setShowAddMemory]     = useState(false);
  const [showInvite, setShowInvite]           = useState(false);
  const [showGedcomImport, setShowGedcomImport] = useState(false);

  // Add-memory form
  const [mTitle, setMTitle]   = useState("");
  const [mDesc, setMDesc]     = useState("");
  const [mDate, setMDate]     = useState("");
  const [mLoc, setMLoc]       = useState("");
  const [mTags, setMTags]     = useState("");
  const [mFile, setMFile]     = useState<File | null>(null);
  const [mSaving, setMSaving] = useState(false);
  const [mUploadProgress, setMUploadProgress] = useState<string | null>(null);
  // Retry state: if the memory was created but the file upload failed, store for retry
  const [pendingUpload, setPendingUpload] = useState<{ memoryId: number; file: File } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Invite form
  const [iName, setIName]     = useState("");
  const [iEmail, setIEmail]   = useState("");
  const [iRel, setIRel]       = useState("");
  const [iRole, setIRole]     = useState<"contributor" | "viewer">("contributor");
  const [iSaving, setISaving] = useState(false);

  // Translation modal
  const [translateMemory, setTranslateMemory] = useState<Memory | null>(null);

  useEffect(() => {
    if (!currentUser || !familyId) return;
    loadFamily();
    loadMemories();
  }, [currentUser, familyId]);

  async function loadFamily() {
    try {
      const res = await fetch(`/api/family/${familyId}`, { headers: authHeaders() });
      if (res.status === 403) { navigate("/diaspora/family"); return; }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFamily(data.family);
      setMyRole(data.my_role);
      setMembers(data.members ?? []);
      setMemoryCount(data.memory_count ?? 0);
    } catch {
      toast.error("Couldn't load Family Space");
      navigate("/diaspora/family");
    }
  }

  const loadMemories = useCallback(async (q?: string) => {
    // First load: show spinner. Subsequent refreshes: keep previous list (no flash).
    if (!hasEverLoaded.current) setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (q) params.set("q", q);
      const res = await fetch(`/api/family/${familyId}/memories?${params}`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMemories(data.memories ?? []);
      hasEverLoaded.current = true;
    } catch {
      setLoadError(true);
      // Do NOT clear memories — keep whatever was showing before the error
      if (hasEverLoaded.current) {
        toast.error("Couldn't refresh memories — showing last known list");
      }
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  /** Upload a file to an existing memory. Returns true on success. */
  async function uploadFileToMemory(memoryId: number, file: File): Promise<boolean> {
    setMUploadProgress(`Uploading ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)…`);
    try {
      const dataUrl   = await blobToDataUrl(file);
      const assetType = mimeToAssetType(file.type);
      const uploadRes = await fetch(
        `/api/family/${familyId}/memories/${memoryId}/assets/upload-direct`,
        {
          method:  "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl, filename: file.name, mimeType: file.type, assetType }),
        },
      );

      if (uploadRes.status === 401) {
        toast.error("Session expired — please sign in again and use the retry button.");
        setPendingUpload({ memoryId, file });
        return false;
      }
      if (!uploadRes.ok) {
        const body = await uploadRes.json().catch(() => ({}));
        toast.error(`File upload failed: ${body.error ?? uploadRes.status}. Use the retry button below.`);
        setPendingUpload({ memoryId, file });
        return false;
      }
      setPendingUpload(null);
      return true;
    } catch (err: any) {
      // Network error — likely server restart between sessions
      const msg = err?.message?.includes("fetch") || err?.name === "TypeError"
        ? "Server unavailable — memory saved. Use the retry button when the server is back."
        : `Upload failed: ${err?.message ?? "unknown error"}`;
      toast.error(msg);
      setPendingUpload({ memoryId, file });
      return false;
    } finally {
      setMUploadProgress(null);
    }
  }

  async function handleAddMemory(e: React.FormEvent) {
    e.preventDefault();
    if (!mTitle.trim() && !mDesc.trim() && !mFile) {
      toast.error("Add a title, description, or attach a file");
      return;
    }
    setMSaving(true);
    try {
      const tags = mTags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
      const res = await fetch(`/api/family/${familyId}/memories`, {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          title:          mTitle.trim()  || undefined,
          description:    mDesc.trim()   || undefined,
          memory_date:    mDate          || undefined,
          location_label: mLoc.trim()   || undefined,
          tags:           tags.length ? tags : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save memory");
      const { memory } = await res.json();

      let uploadOk = true;
      if (mFile) uploadOk = await uploadFileToMemory(memory.id, mFile);

      if (uploadOk) {
        toast.success("Memory saved!");
      } else {
        toast("Memory saved — tap 'Retry upload' to attach the file.", { icon: "⚠️" });
      }
      setShowAddMemory(false);
      setMTitle(""); setMDesc(""); setMDate(""); setMLoc(""); setMTags(""); setMFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      loadMemories(searchQ || undefined);
    } catch (err: any) {
      toast.error(err.message ?? "Couldn't save memory");
    } finally {
      setMSaving(false);
    }
  }

  async function handleRetryUpload() {
    if (!pendingUpload) return;
    const ok = await uploadFileToMemory(pendingUpload.memoryId, pendingUpload.file);
    if (ok) {
      toast.success("File uploaded successfully!");
      loadMemories(searchQ || undefined);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!iName.trim()) { toast.error("Name is required"); return; }
    setISaving(true);
    try {
      const res = await fetch(`/api/family/${familyId}/members`, {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name:  iName.trim(),
          invite_email:  iEmail.trim()  || undefined,
          relation_note: iRel.trim()   || undefined,
          role: iRole,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success(`${iName} invited!`);
      setShowInvite(false);
      setIName(""); setIEmail(""); setIRel(""); setIRole("contributor");
      loadFamily();
    } catch (err: any) {
      toast.error(err.message ?? "Couldn't invite member");
    } finally {
      setISaving(false);
    }
  }

  async function handleDeleteMemory(memoryId: number) {
    if (!confirm("Delete this memory permanently?")) return;
    try {
      const res = await fetch(`/api/family/${familyId}/memories/${memoryId}`, {
        method: "DELETE", headers: authHeaders(),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success("Memory deleted");
      setMemories(ms => ms.filter(m => m.id !== memoryId));
    } catch (err: any) {
      toast.error(err.message ?? "Couldn't delete memory");
    }
  }

  const canWrite  = ["owner", "curator", "contributor"].includes(myRole);
  const canManage = ["owner", "curator"].includes(myRole);

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Sign in to view your Family Vault</p>
      </div>
    );
  }

  // ── Memories list body ────────────────────────────────────────────────────────
  let memoriesBody: React.ReactNode;
  if (loading && !hasEverLoaded.current) {
    memoriesBody = (
      <div className="flex justify-center py-16">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  } else if (loadError && !hasEverLoaded.current) {
    memoriesBody = (
      <div className="text-center py-16 space-y-3">
        <AlertCircle className="w-10 h-10 text-destructive/60 mx-auto" />
        <p className="font-semibold">Couldn't load memories</p>
        <p className="text-sm text-muted-foreground">Check your connection and try again.</p>
        <button
          onClick={() => loadMemories(searchQ || undefined)}
          className="flex items-center gap-2 mx-auto bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium"
        >
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    );
  } else if (memories.length === 0 && hasEverLoaded.current) {
    memoriesBody = (
      <div className="text-center py-16 space-y-3">
        <BookHeart className="w-12 h-12 text-primary/40 mx-auto" />
        <p className="font-semibold">No memories yet</p>
        <p className="text-sm text-muted-foreground">
          {canWrite ? "Start preserving your family's story." : "No memories have been added yet."}
        </p>
        {canWrite && (
          <button
            onClick={() => setShowAddMemory(true)}
            className="mt-2 bg-primary text-primary-foreground px-5 py-2 rounded-xl text-sm font-medium"
          >
            Add a Memory
          </button>
        )}
      </div>
    );
  } else {
    memoriesBody = (
      <div className="space-y-3">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Refreshing…
          </div>
        )}
        {memories.filter(m => {
          if (mediaFilter === "all") return true;
          if (mediaFilter === "photo") return m.primary_asset?.asset_type === "photo";
          if (mediaFilter === "audio") return m.source === "interview" || m.primary_asset?.asset_type === "audio";
          if (mediaFilter === "video") return m.primary_asset?.asset_type === "video";
          if (mediaFilter === "document") return m.source === "document" || m.primary_asset?.asset_type === "document";
          return true;
        }).map(m => (
          <div key={m.id} className="bg-card rounded-2xl border border-border overflow-hidden">
            <button
              onClick={() => navigate(`/family/${familyId}/memory/${m.id}`)}
              className="w-full flex gap-3 p-4 text-left active:bg-muted/50"
            >
              <div className="w-14 h-14 rounded-xl flex-shrink-0 bg-muted flex items-center justify-center overflow-hidden">
                {m.primary_asset?.asset_type === "photo" ? (
                  <img
                    src={`/api/family/assets/${m.primary_asset.storage_key}`}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : m.primary_asset?.asset_type === "audio" ? (
                  <Mic className="w-6 h-6 text-muted-foreground" />
                ) : m.primary_asset?.asset_type === "video" ? (
                  <Video className="w-6 h-6 text-muted-foreground" />
                ) : (
                  <div className="text-muted-foreground">
                    {m.source === "interview" ? <Mic className="w-6 h-6" /> : <Image className="w-6 h-6" />}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm line-clamp-1">{m.title ?? "Untitled memory"}</p>
                {m.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{m.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  {m.memory_date && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {formatMemoryDate(m.memory_date, m.memory_date_precision)}
                    </span>
                  )}
                  {m.location_label && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="w-3 h-3" />
                      {m.location_label}
                    </span>
                  )}
                  <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${
                    m.visibility === "private"
                      ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                      : "bg-primary/10 text-primary"
                  }`}>
                    {sourceIcon(m.source)}
                    {m.source}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 self-center" />
            </button>

            {/* Per-card actions: translate + delete */}
            {(canWrite || (m.description || m.story)) && (
              <div className="px-4 pb-3 flex items-center justify-between gap-2 border-t border-border/50 pt-2">
                <button
                  onClick={() => setTranslateMemory(m)}
                  className="flex items-center gap-1 text-xs text-muted-foreground active:opacity-70"
                >
                  <Languages className="w-3.5 h-3.5" /> Translate
                </button>
                {canWrite && (
                  <button
                    onClick={() => handleDeleteMemory(m.id)}
                    className="flex items-center gap-1 text-xs text-destructive active:opacity-70"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/diaspora/family")} className="p-2 -ml-2 rounded-lg active:bg-muted">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold truncate">{family?.name ?? "Family Vault"}</h1>
            <p className="text-xs text-muted-foreground capitalize">{myRole} · {memoryCount} memories</p>
          </div>
          <div className="flex items-center gap-2">
            {canManage && (
              <button
                onClick={() => setShowGedcomImport(true)}
                className="p-2 rounded-lg active:bg-muted"
                title="Import family tree (GEDCOM)"
              >
                <TreePine className="w-4.5 h-4.5" />
              </button>
            )}
            {canWrite && (
              <button
                onClick={() => setShowAddMemory(true)}
                className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-medium active:opacity-80"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-lg mx-auto flex border-b border-border">
          {(["memories", "members", "interviews"] as TabId[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium capitalize transition-colors ${
                tab === t ? "text-primary border-b-2 border-primary" : "text-muted-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        {/* ── Legacy Journey Banner — connect Family Vault to actual gameplay session ── */}
        <div
          className="mb-4 rounded-xl overflow-hidden relative"
          style={{ background: "linear-gradient(135deg, #1A0F08 0%, #2A1A0F 100%)", border: "1px solid rgba(180,120,40,0.3)" }}
        >
          <div className="px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
              <BookHeart className="w-4.5 h-4.5 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-amber-300 uppercase tracking-widest">Legacy Mode</p>
              <p className="text-xs text-amber-700 truncate">Every memory enriches your family's RPG world</p>
            </div>
            <button
              onClick={() => navigate("/legacy")}
              className="flex-shrink-0 bg-amber-500 text-amber-950 font-black text-xs uppercase tracking-wide px-3 py-1.5 rounded-lg active:opacity-80 flex items-center gap-1"
            >
              Play →
            </button>
          </div>
        </div>

        {/* Pending upload retry banner */}
        {pendingUpload && (
          <div className="mb-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-3 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-orange-700 dark:text-orange-400">File not uploaded</p>
              <p className="text-xs text-orange-600 dark:text-orange-500 truncate">{pendingUpload.file.name}</p>
            </div>
            <button
              onClick={handleRetryUpload}
              className="text-xs bg-orange-500 text-white px-3 py-1.5 rounded-lg font-medium active:opacity-80 flex-shrink-0"
            >
              Retry
            </button>
            <button onClick={() => setPendingUpload(null)} className="text-orange-400 active:opacity-70">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Memories tab */}
        {tab === "memories" && (
          <>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={searchQ}
                onChange={e => {
                  setSearchQ(e.target.value);
                  if (e.target.value.length === 0 || e.target.value.length >= 2) {
                    loadMemories(e.target.value || undefined);
                  }
                }}
                placeholder="Search memories…"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                style={{ fontSize: "16px" }}
              />
            </div>
            {/* Media type filter chips */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
              {(["all","photo","audio","video","document"] as const).map(ft => {
                const counts: Record<string, number> = {
                  all: memories.length,
                  photo: memories.filter(m => m.primary_asset?.asset_type === "photo").length,
                  audio: memories.filter(m => m.source === "interview" || m.primary_asset?.asset_type === "audio").length,
                  video: memories.filter(m => m.primary_asset?.asset_type === "video").length,
                  document: memories.filter(m => m.source === "document" || m.primary_asset?.asset_type === "document").length,
                };
                const labels: Record<string,string> = { all: "All", photo: "Photos", audio: "Audio", video: "Videos", document: "Docs" };
                if (ft !== "all" && counts[ft] === 0) return null;
                return (
                  <button key={ft} onClick={() => setMediaFilter(ft)}
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${mediaFilter === ft ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {labels[ft]} {counts[ft] > 0 && <span className="opacity-60">{counts[ft]}</span>}
                  </button>
                );
              })}
            </div>
            {memoriesBody}
          </>
        )}

        {/* Members tab */}
        {tab === "members" && (
          <div className="space-y-3">
            {canManage && (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowInvite(true)}
                  className="flex-1 flex items-center justify-center gap-2 border border-dashed border-primary text-primary rounded-xl py-3 text-sm font-medium active:opacity-70"
                >
                  <UserPlus className="w-4 h-4" /> Invite member
                </button>
                <button
                  onClick={() => setShowGedcomImport(true)}
                  className="flex items-center justify-center gap-2 border border-dashed border-primary/50 text-primary/70 rounded-xl px-4 py-3 text-sm font-medium active:opacity-70"
                  title="Import family tree from GEDCOM file"
                >
                  <TreePine className="w-4 h-4" />
                </button>
              </div>
            )}
            {members.map(m => (
              <div key={m.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary">
                    {m.display_name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{m.display_name}</p>
                  <div className="flex items-center gap-2">
                    {m.relation_note && (
                      <span className="text-xs text-muted-foreground">{m.relation_note}</span>
                    )}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium capitalize ${
                      m.role === "owner" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                      {m.role}
                    </span>
                    {m.status === "invited" && (
                      <span className="text-xs text-orange-500">pending</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Interviews tab */}
        {tab === "interviews" && (
          <InterviewsTab familyId={familyId} canWrite={canWrite} />
        )}
      </div>

      {/* ── Add Memory modal ── */}
      {showAddMemory && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card rounded-2xl p-5 w-full max-w-md shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold">Add a Memory</h2>
              <button onClick={() => { setShowAddMemory(false); setMFile(null); }} className="p-1 rounded-lg active:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Preserve a photo, story, or audio recording in your family vault.</p>
            <form onSubmit={handleAddMemory} className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-1">Title</label>
                <input
                  value={mTitle}
                  onChange={e => setMTitle(e.target.value)}
                  placeholder="e.g. Grandma's birthday 1985"
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  style={{ fontSize: "16px" }}
                  maxLength={200}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Description / Story</label>
                <textarea
                  value={mDesc}
                  onChange={e => setMDesc(e.target.value)}
                  placeholder="What's the story behind this memory?"
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  style={{ fontSize: "16px" }}
                  rows={3}
                  maxLength={2000}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium block mb-1">Date</label>
                  <input
                    type="date"
                    value={mDate}
                    onChange={e => setMDate(e.target.value)}
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    style={{ fontSize: "16px" }}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Location</label>
                  <input
                    value={mLoc}
                    onChange={e => setMLoc(e.target.value)}
                    placeholder="City, country…"
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    style={{ fontSize: "16px" }}
                    maxLength={200}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Tags (comma-separated)</label>
                <input
                  value={mTags}
                  onChange={e => setMTags(e.target.value)}
                  placeholder="wedding, Nigeria, 1970s"
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  style={{ fontSize: "16px" }}
                />
              </div>

              {/* File upload */}
              <div>
                <label className="text-sm font-medium block mb-1">Attach photo, audio, or document</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-input rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 transition-colors"
                >
                  {mUploadProgress ? (
                    <div className="flex items-center gap-2 text-primary text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {mUploadProgress}
                    </div>
                  ) : mFile ? (
                    <>
                      {mFile.type.startsWith("image/") ? (
                        <img src={URL.createObjectURL(mFile)} alt="preview" className="max-h-32 rounded-lg object-contain" />
                      ) : (
                        <div className="flex items-center gap-2 text-primary">
                          {mFile.type.startsWith("audio/") ? <Mic className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                          <span className="text-sm font-medium">{mFile.name}</span>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">{(mFile.size / 1024 / 1024).toFixed(1)} MB · tap to change</p>
                    </>
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground text-center">
                        Tap to choose a photo, audio, or PDF<br />
                        <span className="text-xs">Max 20 MB</span>
                      </p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 20 * 1024 * 1024) { toast.error("File too large — max 20 MB"); return; }
                    setMFile(f);
                  }}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowAddMemory(false); setMFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  className="flex-1 border border-input rounded-lg py-2 text-sm font-medium active:opacity-70"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={mSaving}
                  className="flex-1 bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {mSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {mSaving ? (mUploadProgress ? "Uploading…" : "Saving…") : "Save Memory"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Invite modal ── */}
      {showInvite && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card rounded-2xl p-5 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">Invite a Family Member</h2>
              <button onClick={() => setShowInvite(false)} className="p-1 rounded-lg active:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleInvite} className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-1">Name *</label>
                <input
                  value={iName}
                  onChange={e => setIName(e.target.value)}
                  placeholder="Grandma Rose"
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  style={{ fontSize: "16px" }}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Relation</label>
                <input
                  value={iRel}
                  onChange={e => setIRel(e.target.value)}
                  placeholder="Grandmother on Dad's side"
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  style={{ fontSize: "16px" }}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Email (optional)</label>
                <input
                  type="email"
                  value={iEmail}
                  onChange={e => setIEmail(e.target.value)}
                  placeholder="to send an invite link later"
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  style={{ fontSize: "16px" }}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Role</label>
                <select
                  value={iRole}
                  onChange={e => setIRole(e.target.value as "contributor" | "viewer")}
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  style={{ fontSize: "16px" }}
                >
                  <option value="contributor">Contributor — can add memories &amp; comment</option>
                  <option value="viewer">Viewer — read-only access</option>
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowInvite(false)} className="flex-1 border border-input rounded-lg py-2 text-sm font-medium active:opacity-70">Cancel</button>
                <button type="submit" disabled={iSaving} className="flex-1 bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                  {iSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Invite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── GEDCOM Import modal ── */}
      {showGedcomImport && (
        <GedcomImportModal familyId={familyId} onClose={() => setShowGedcomImport(false)} onDone={() => { setShowGedcomImport(false); loadFamily(); setTab("members"); }} />
      )}

      {/* ── Translate Memory modal ── */}
      {translateMemory && (
        <TranslateMemoryModal
          familyId={familyId}
          memory={translateMemory}
          onClose={() => setTranslateMemory(null)}
        />
      )}
    </div>
  );
}

// ─── GEDCOM Import Modal ───────────────────────────────────────────────────────

function GedcomImportModal({ familyId, onClose, onDone }: { familyId: number; onClose: () => void; onDone: () => void }) {
  const [file, setFile]           = useState<File | null>(null);
  const [preview, setPreview]     = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult]       = useState<{ imported: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File) {
    setFile(f);
    setResult(null);
    const text = await f.text();
    // Client-side preview: extract first ~5 names
    const names: string[] = [];
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^1 NAME (.+)/);
      if (m) {
        const name = m[1].replace(/\//g, "").trim();
        if (name) names.push(name);
        if (names.length >= 5) break;
      }
    }
    setPreview(names);
  }

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    try {
      const gedcom = await file.text();
      const res = await fetch(`/api/family/${familyId}/members/import-gedcom`, {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ gedcom }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Import failed (${res.status})`);
      }
      const data = await res.json();
      setResult(data);
      toast.success(`Imported ${data.imported} of ${data.total} family members!`);
    } catch (err: any) {
      toast.error(err.message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
      <div className="bg-card rounded-2xl p-5 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <TreePine className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold">Import Family Tree</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg active:bg-muted"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Upload a GEDCOM (.ged) file exported from Ancestry, MyHeritage, FamilySearch, or any genealogy app. Family members will be added as invited members.
        </p>

        {!result ? (
          <>
            <div
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-input rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer hover:border-primary/50 transition-colors mb-3"
            >
              {file ? (
                <>
                  <CheckCircle2 className="w-6 h-6 text-primary" />
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB · tap to change</p>
                </>
              ) : (
                <>
                  <Upload className="w-6 h-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Tap to select a .ged file</p>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".ged,.gedcom,.txt" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

            {preview.length > 0 && (
              <div className="mb-3 bg-muted/50 rounded-xl p-3">
                <p className="text-xs font-medium mb-1.5">Preview — first {preview.length} names found:</p>
                <ul className="space-y-0.5">
                  {preview.map((n, i) => <li key={i} className="text-xs text-foreground">· {n}</li>)}
                </ul>
                <p className="text-xs text-muted-foreground mt-1.5">…and more. Duplicates will be skipped.</p>
              </div>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="flex-1 border border-input rounded-lg py-2 text-sm font-medium active:opacity-70">Cancel</button>
              <button
                onClick={handleImport}
                disabled={!file || importing}
                className="flex-1 bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TreePine className="w-4 h-4" />}
                {importing ? "Importing…" : "Import"}
              </button>
            </div>
          </>
        ) : (
          <div className="text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <p className="font-semibold">Import complete</p>
            <p className="text-sm text-muted-foreground">
              Added <span className="font-bold text-foreground">{result.imported}</span> of {result.total} individuals from the GEDCOM file.
              {result.imported < result.total && " Duplicates were skipped."}
            </p>
            <button onClick={onDone} className="w-full bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-medium">
              View Members
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Translate Memory Modal ────────────────────────────────────────────────────

function TranslateMemoryModal({ familyId, memory, onClose }: { familyId: number; memory: Memory; onClose: () => void }) {
  const [lang, setLang]           = useState("es");
  const [translating, setTranslating] = useState(false);
  const [result, setResult]       = useState<{ translated: string; langName: string } | null>(null);

  const sourceText = [memory.title, memory.description, memory.story].filter(Boolean).join("\n\n");

  async function handleTranslate() {
    if (!sourceText.trim()) { toast.error("This memory has no text to translate."); return; }
    setTranslating(true);
    setResult(null);
    try {
      const res = await fetch(`/api/family/${familyId}/memories/${memory.id}/translate`, {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: sourceText, targetLanguage: lang }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.nia_unavailable) { toast.error("Nia translation isn't configured for this deployment."); return; }
        throw new Error(body.error ?? `Translation failed (${res.status})`);
      }
      const data = await res.json();
      setResult({ translated: data.translated, langName: data.langName });
    } catch (err: any) {
      toast.error(err.message ?? "Translation failed");
    } finally {
      setTranslating(false);
    }
  }

  async function copyToClipboard() {
    if (!result) return;
    await navigator.clipboard.writeText(result.translated).catch(() => {});
    toast.success("Copied to clipboard!");
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
      <div className="bg-card rounded-2xl p-5 w-full max-w-md shadow-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Languages className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold">Translate Memory</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg active:bg-muted"><X className="w-5 h-5" /></button>
        </div>

        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
          <span className="font-medium">{memory.title ?? "Untitled"}</span>
          {memory.description ? ` — ${memory.description}` : ""}
        </p>

        <div className="flex gap-2 mb-3">
          <select
            value={lang}
            onChange={e => { setLang(e.target.value); setResult(null); }}
            className="flex-1 border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            style={{ fontSize: "16px" }}
          >
            {Object.entries(TRANSLATE_LANGUAGES).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
          <button
            onClick={handleTranslate}
            disabled={translating || !sourceText.trim()}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {translating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
            {translating ? "…" : "Translate"}
          </button>
        </div>

        {!sourceText.trim() && (
          <p className="text-sm text-muted-foreground text-center py-4">This memory has no text to translate.</p>
        )}

        {result && (
          <div className="flex-1 overflow-y-auto">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-medium text-muted-foreground">Translation → {result.langName}</p>
              <button onClick={copyToClipboard} className="text-xs text-primary active:opacity-70">Copy</button>
            </div>
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{result.translated}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Powered by Nia · Oral history translation preserves the speaker's voice
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── In-App Recording Modal ────────────────────────────────────────────────────

interface RecordInterviewModalProps {
  familyId: number;
  onClose: () => void;
  onDone: () => void;
}

function RecordInterviewModal({ familyId, onClose, onDone }: RecordInterviewModalProps) {
  const [promptIdx, setPromptIdx] = useState(0);
  const [phase, setPhase]   = useState<"idle" | "recording" | "uploading" | "done">("idle");
  const [elapsed, setElapsed]   = useState(0);
  const [error, setError]       = useState<string | null>(null);
  const [doneCount, setDoneCount] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<BlobPart[]>([]);
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef        = useRef<MediaStream | null>(null);

  // Web Audio API refs for live microphone level meter
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const rafRef       = useRef<number | null>(null);
  const [barLevels, setBarLevels] = useState<number[]>(() => Array.from({ length: 40 }, () => 0.15));

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (rafRef.current)   cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close().catch(() => {});
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Wire up Web Audio API for the live level meter
      try {
        const ActxClass = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
        const audioCtx  = new ActxClass();
        const source    = audioCtx.createMediaStreamSource(stream);
        const analyser  = audioCtx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.82;
        source.connect(analyser);
        analyserRef.current = analyser;
        audioCtxRef.current = audioCtx;
        const data     = new Uint8Array(analyser.frequencyBinCount);
        const NUM_BARS = 40;
        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(data);
          setBarLevels(
            Array.from({ length: NUM_BARS }, (_, i) => {
              const bin = Math.floor((i / NUM_BARS) * data.length);
              return Math.max(0.08, data[bin] / 255);
            }),
          );
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch { /* AudioContext unavailable — bars stay at static height */ }

      const mime = getPreferredMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(500);
      setElapsed(0);
      setPhase("recording");
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } catch (err: any) {
      setError(err?.message?.includes("Permission") || err?.name === "NotAllowedError"
        ? "Microphone access denied. Please allow microphone access in your browser settings."
        : err?.message ?? "Could not access microphone.");
    }
  }

  async function stopAndUpload() {
    const mr = mediaRecorderRef.current;
    if (!mr || phase !== "recording") return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (rafRef.current)   { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    audioCtxRef.current?.close().catch(() => {});
    analyserRef.current = null;
    setPhase("uploading");

    // Wait for all chunks to be flushed
    await new Promise<void>(resolve => {
      mr.onstop = () => resolve();
      mr.stop();
    });
    streamRef.current?.getTracks().forEach(t => t.stop());

    const mime = mr.mimeType || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mime });

    if (blob.size < 1000) {
      setError("Recording was too short — please try again.");
      setPhase("idle");
      return;
    }

    try {
      // 1. Create interview session
      const ivRes = await fetch(`/api/family/${familyId}/interviews`, {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ prompts_used: [ORAL_HISTORY_PROMPTS[promptIdx]] }),
      });
      if (!ivRes.ok) throw new Error("Failed to create interview session");
      const { interview } = await ivRes.json();

      // 2. Create a memory linked to this interview
      const memRes = await fetch(`/api/family/${familyId}/memories`, {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          title:       `Oral History — ${new Date().toLocaleDateString()}`,
          description: ORAL_HISTORY_PROMPTS[promptIdx],
          source:      "interview",
          interview_id: interview.id,
        }),
      });
      if (!memRes.ok) throw new Error("Failed to create memory");
      const { memory } = await memRes.json();

      // 3. Upload the audio recording
      const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "m4a" : "webm";
      const dataUrl = await blobToDataUrl(blob);
      const upRes = await fetch(`/api/family/${familyId}/memories/${memory.id}/assets/upload-direct`, {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          dataUrl,
          filename:  `oral-history-${Date.now()}.${ext}`,
          mimeType:  mime,
          assetType: "audio",
        }),
      });
      if (!upRes.ok) throw new Error("Memory saved, but audio upload failed");

      // 4. Transcribe via Nia Voice (Whisper STT) — wire real audio all the way through
      try {
        const transcribeForm = new FormData();
        transcribeForm.append("audio", blob, `oral-history-${Date.now()}.${ext}`);
        transcribeForm.append("familyId", String(familyId));
        const txRes = await fetch("/api/nia/voice/transcribe", {
          method: "POST",
          headers: authHeaders(),
          body: transcribeForm,
        });
        if (txRes.ok) {
          const txData = await txRes.json() as { text?: string };
          if (txData.text?.trim()) {
            // Patch the memory with the real transcript so it drives quest/dialogue generation
            await fetch(`/api/family/${familyId}/memories/${memory.id}`, {
              method:  "PATCH",
              headers: { ...authHeaders(), "Content-Type": "application/json" },
              body: JSON.stringify({ description: txData.text.slice(0, 500) }),
            }).catch(() => {});
          }
        }
      } catch { /* Transcription is best-effort — audio already saved */ }

      // 5. Mark interview as published
      await fetch(`/api/family/${familyId}/interviews/${interview.id}`, {
        method:  "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status: "published", resulting_memory_id: memory.id }),
      });

      // 6. Invalidate legacy world cache so quests regenerate with the new transcript
      fetch(`/api/legacy/reservoir/${familyId}/invalidate`, {
        method: "POST", headers: authHeaders(),
      }).catch(() => {});

      setDoneCount(prev => prev + 1);
      setPhase("done");
    } catch (err: any) {
      setError(err?.message ?? "Upload failed — please try again.");
      setPhase("idle");
    }
  }

  const prompt = ORAL_HISTORY_PROMPTS[promptIdx];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-4">
      <div className="bg-card rounded-2xl p-5 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Mic className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold">Record Oral History</h2>
          </div>
          {phase !== "uploading" && (
            <button onClick={onClose} className="p-1 rounded-lg active:bg-muted"><X className="w-5 h-5" /></button>
          )}
        </div>

        {phase === "done" ? (
          <div className="text-center space-y-4 py-4">
            <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto" />
            <p className="font-bold text-lg">Recording saved!</p>
            <p className="text-sm text-muted-foreground">
              Your oral history has been preserved in the family vault.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setPhase("idle"); setElapsed(0); }}
                className="flex-1 border border-input rounded-xl py-2.5 text-sm font-medium active:opacity-70"
              >
                Record Another
              </button>
              <button
                onClick={onDone}
                className="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-medium"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Prompt navigation */}
            <div className="bg-primary/5 rounded-2xl p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setPromptIdx(i => Math.max(0, i - 1))}
                  disabled={promptIdx === 0 || phase === "recording"}
                  className="p-1.5 rounded-lg disabled:opacity-30 active:bg-muted"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-muted-foreground font-medium">
                  Prompt {promptIdx + 1} of {ORAL_HISTORY_PROMPTS.length}
                </span>
                <button
                  onClick={() => setPromptIdx(i => Math.min(ORAL_HISTORY_PROMPTS.length - 1, i + 1))}
                  disabled={promptIdx === ORAL_HISTORY_PROMPTS.length - 1 || phase === "recording"}
                  className="p-1.5 rounded-lg disabled:opacity-30 active:bg-muted"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm font-medium text-center leading-relaxed text-foreground">
                {prompt}
              </p>
            </div>

            {/* Recording controls */}
            {phase === "idle" && (
              <button
                onClick={startRecording}
                className="w-full flex items-center justify-center gap-3 bg-red-500 hover:bg-red-600 text-white rounded-2xl py-4 text-base font-semibold active:opacity-80 transition-colors"
              >
                <Mic className="w-5 h-5" />
                Start Recording
              </button>
            )}

            {phase === "recording" && (
              <div className="space-y-3">
                {/* Live microphone level meter — driven by Web Audio AnalyserNode */}
                <div className="flex items-center justify-center gap-0.5 h-14 px-2">
                  {barLevels.map((level, i) => (
                    <div
                      key={i}
                      className="bg-primary/70 rounded-full flex-1 transition-[height] duration-75"
                      style={{ height: `${Math.max(8, level * 100)}%` }}
                    />
                  ))}
                </div>

                <div className="flex items-center justify-center gap-3">
                  <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                  <span className="font-mono text-2xl font-bold text-foreground tabular-nums">
                    {formatDuration(elapsed)}
                  </span>
                  <span className="text-muted-foreground text-sm">/ 60:00</span>
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  Recording — speak clearly and naturally
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={stopAndUpload}
                    className="flex-1 flex items-center justify-center gap-2 bg-foreground text-background rounded-2xl py-3.5 text-sm font-semibold active:opacity-80"
                  >
                    <Square className="w-4 h-4" />
                    Stop &amp; Save
                  </button>
                  <button
                    onClick={() => { setPromptIdx(i => Math.min(ORAL_HISTORY_PROMPTS.length - 1, i + 1)); }}
                    className="px-4 flex items-center justify-center gap-1.5 border border-border rounded-2xl text-sm font-medium text-muted-foreground active:opacity-70"
                    title="Next prompt (add chapter)"
                  >
                    + Chapter
                  </button>
                </div>
              </div>
            )}

            {phase === "uploading" && (
              <div className="flex flex-col items-center gap-3 py-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm font-medium">Saving your recording…</p>
                <p className="text-xs text-muted-foreground">Please don't close this window</p>
              </div>
            )}

            {error && (
              <div className="mt-3 bg-destructive/10 text-destructive rounded-xl p-3 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {doneCount > 0 && phase === "idle" && (
              <p className="text-xs text-center text-green-600 dark:text-green-400 mt-2">
                ✓ {doneCount} recording{doneCount > 1 ? "s" : ""} saved this session
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Interviews sub-component ──────────────────────────────────────────────────

function InterviewsTab({ familyId, canWrite }: { familyId: number; canWrite: boolean }) {
  const [interviews, setInterviews]   = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showRecord, setShowRecord]   = useState(false);

  useEffect(() => { loadInterviews(); }, []);

  async function loadInterviews() {
    setLoading(true);
    try {
      const res = await fetch(`/api/family/${familyId}/interviews`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setInterviews(data.interviews ?? []);
    } catch {
      toast.error("Couldn't load interviews");
    } finally {
      setLoading(false);
    }
  }

  const statusColor: Record<string, string> = {
    scheduled:    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    recording:    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    transcribing: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    review:       "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    published:    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-3">
      {canWrite && (
        <button
          onClick={() => setShowRecord(true)}
          className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-3.5 text-sm font-semibold active:opacity-80"
        >
          <Mic className="w-4 h-4" />
          Record an Oral History Interview
        </button>
      )}

      {interviews.length === 0 ? (
        <div className="text-center py-12">
          <Mic className="w-10 h-10 text-primary/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground font-medium mb-1">No interviews yet</p>
          <p className="text-xs text-muted-foreground">Capture an elder's voice before it's too late.</p>
        </div>
      ) : (
        interviews.map((iv: any) => (
          <div key={iv.id} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-medium text-sm">
                  {iv.prompts_used?.[0]
                    ? `"${iv.prompts_used[0].slice(0, 60)}${iv.prompts_used[0].length > 60 ? "…" : ""}"`
                    : `Interview #${iv.id}`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(iv.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                </p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize flex-shrink-0 ${statusColor[iv.status] ?? "bg-muted text-muted-foreground"}`}>
                {iv.status}
              </span>
            </div>
            {iv.prompts_used?.length > 1 && (
              <div className="border-t border-border pt-2 mt-1">
                <p className="text-xs text-muted-foreground mb-1">All prompts:</p>
                <ul className="text-xs text-foreground space-y-0.5">
                  {iv.prompts_used.slice(0, 3).map((p: string, i: number) => (
                    <li key={i} className="truncate">• {p}</li>
                  ))}
                  {iv.prompts_used.length > 3 && (
                    <li className="text-muted-foreground">+{iv.prompts_used.length - 3} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        ))
      )}

      {showRecord && (
        <RecordInterviewModal
          familyId={familyId}
          onClose={() => setShowRecord(false)}
          onDone={() => { setShowRecord(false); loadInterviews(); }}
        />
      )}
    </div>
  );
}
