/**
 * Diaspora Globe — African diaspora connection map + Griot story layer
 *
 * Uses Mapbox GL JS globe projection (already available via react-map-gl/mapbox).
 * Hub cities are rendered as colored markers; great-circle arcs connect them
 * back to Fort Worth (the home base). Griot stories layer overlays story pins.
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import Map, { Marker, Source, Layer, type MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import type mapboxgl from "mapbox-gl";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe2, Mic, MicOff, BookOpen, X, ChevronLeft, ChevronDown,
  ChevronUp, Check, Globe, MapPin, Clock, Languages, Play, Square,
  Send, ArrowLeft, Lock, Eye, Calendar, Flag, ClipboardList, RefreshCw,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { StripePaymentModal, isStripeConfigured } from "@/components/StripePaymentModal";
import { LastUpdated } from "@/components/LastUpdated";

// ── Diaspora hub definitions ───────────────────────────────────────────────
// Hubs used to be a hardcoded 10-city array. They now come from
// GET /griot/hubs (see fetchHubs below), which returns the original 10 as
// seed rows plus anything since proposed/approved, each enriched with a
// live story_count and — for hubs a community has claimed — real activity
// numbers (active helpers, requests fulfilled, pool balance).

type HubTag = "home" | "us" | "carib" | "latino" | "africa" | "europe" | string;

interface HubActivity {
  active_helpers: number;
  requests_fulfilled: number;
  pool_balance: number;
}

interface Hub {
  id: number;
  name: string;
  region: string; // mapped from the API's region_label
  lat: number;
  lng: number;
  tag: HubTag;
  note: string | null;
  community_id: number | null;
  story_count: number;
  member_count: number;
  open_requests: number;
  reserved_balance?: string | number | null;
  activity: HubActivity | null;
  is_crisis: boolean;
  crisis_message: string | null;
}

// All 15 languages i18n.ts supports — kept in sync with i18n.ts's resources
// map. Griot Globe stories should be recordable in any language the app
// itself speaks, not just English.
const STORY_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "pt", label: "Português" },
  { code: "sw", label: "Kiswahili" },
  { code: "so", label: "Soomaali" },
  { code: "am", label: "አማርኛ (Amharic)" },
  { code: "yo", label: "Yorùbá" },
  { code: "ha", label: "Hausa" },
  { code: "ig", label: "Igbo" },
  { code: "tw", label: "Twi" },
  { code: "wo", label: "Wolof" },
  { code: "ht", label: "Kreyòl Ayisyen" },
  { code: "ar", label: "العربية (Arabic)" },
  { code: "zu", label: "isiZulu" },
];

const TAG_LABEL: Record<string, string> = {
  home: "Home base", us: "US hub", carib: "Caribbean", latino: "Afro-Latino", africa: "Continental Africa", europe: "Afro-European",
};

const HUB_COLORS: Record<string, string> = {
  home: "#f59e0b", us: "#f87171", carib: "#2dd4bf",
  latino: "#4ade80", africa: "#c084fc", europe: "#60a5fa",
};
const DEFAULT_HUB_COLOR = "#94a3b8"; // slate — for any tag proposed hubs introduce later

// Safety net only: used to anchor arcs if, for some reason, no hub tagged
// "home" has loaded yet (e.g. mid-request). Not shown as a marker itself.
const FALLBACK_HOME = { lat: 32.75, lng: -97.33 };

// ── Story types ────────────────────────────────────────────────────────────

interface GriotStory {
  id: number;
  author_id: number;
  title: string | null;
  text_content: string | null;
  audio_url: string | null;
  original_language: string;
  diaspora_tag: string | null;
  hub_location: string | null;
  lat: number | null;
  lng: number | null;
  visibility: string;
  duration_seconds: number | null;
  published_at: string | null;
}

interface StoryTranslation {
  id: number;
  story_id: number;
  language: string;
  nia_draft_text: string | null;
  edited_text: string | null;
  recorder_approved: boolean;
  approved_at: string | null;
}

// ── Globe layer config ─────────────────────────────────────────────────────

// Typed as string | undefined so the missing-token guard below can catch it.
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

// Great-circle arcs from the home hub (tag === "home") to every other hub.
// Falls back to FALLBACK_HOME if no hub is tagged "home" yet (e.g. still
// loading, or a fresh DB before the seed migration's home row exists).
function buildArcs(hubs: Hub[]) {
  const home = hubs.find(h => h.tag === "home") ?? { ...FALLBACK_HOME, id: -1 };
  const features = hubs
    .filter(h => h.tag !== "home")
    .map(h => ({
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [home.lng, home.lat],
          [h.lng, h.lat],
        ],
      },
      properties: { hub: h.id },
    }));
  return { type: "FeatureCollection" as const, features };
}

// ── Translation review sub-panel ──────────────────────────────────────────

function TranslationReviewPanel({
  storyId,
  storyText,
  translations,
  onClose,
  onRefresh,
}: {
  storyId: number;
  storyText: string | null;
  translations: StoryTranslation[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [selected, setSelected] = useState<StoryTranslation | null>(null);
  const [editedText, setEditedText] = useState("");
  const [saving, setSaving] = useState(false);

  const pendingCount = translations.filter(t => !t.recorder_approved).length;

  const approve = async (lang: string, edited?: string) => {
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (edited) body.edited_text = edited;
      await fetch(`/api/griot/stories/${storyId}/translations/${lang}/approve`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast({ title: "Translation approved ✓" });
      onRefresh();
      setSelected(null);
    } catch {
      toast({ title: "Failed to approve", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const langLabel: Record<string, string> = {
    pt: "Português", es: "Español", fr: "Français", ht: "Kreyòl",
    sw: "Kiswahili", yo: "Yorùbá", ar: "العربية", de: "Deutsch",
    zh: "中文",
  };

  if (selected) {
    return (
      <div className="space-y-3">
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3 h-3" /> Back to inbox
        </button>

        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Your original · {selected.language.toUpperCase()}</p>
          <div className="bg-muted/40 rounded-xl p-3 text-[13px] leading-relaxed font-serif italic text-foreground/80">
            {storyText
              ? `\u201c${storyText}\u201d`
              : "This story was recorded as audio only — no written original was saved."}
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-2">
            Nia&apos;s draft · {langLabel[selected.language] ?? selected.language}
            <span className="normal-case tracking-normal bg-muted rounded-full px-2 py-0.5 text-[10px]">
              Pending review
            </span>
          </p>
          <textarea
            value={editedText || selected.nia_draft_text || ""}
            onChange={e => setEditedText(e.target.value)}
            rows={5}
            className="w-full bg-muted/40 border border-border rounded-xl p-3 text-[13px] leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-primary font-serif"
            placeholder="Nia's translation will appear here..."
            style={{ fontSize: "16px" }}
          />
          <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
            <Globe className="w-3 h-3" /> Publishes publicly once you approve
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => approve(selected.language, editedText || undefined)}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-1.5 bg-green-500/10 border border-green-500/30 text-green-400 rounded-xl py-2.5 text-[13px] font-bold hover:bg-green-500/20 transition-colors disabled:opacity-50"
          >
            <Check className="w-4 h-4" /> Looks right — approve
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {pendingCount > 0 ? `${pendingCount} translation${pendingCount !== 1 ? "s" : ""} waiting for your review` : "All translations reviewed ✓"}
      </p>
      {translations.map(t => (
        <button
          key={t.id}
          onClick={() => { setSelected(t); setEditedText(""); }}
          className="w-full flex items-center justify-between p-3 bg-muted/40 border border-border rounded-xl text-left hover:bg-muted/60 transition-colors"
        >
          <div>
            <p className="text-[13px] font-medium">{t.recorder_approved ? "✓ " : ""}{langLabel[t.language] ?? t.language}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {t.recorder_approved ? "Approved" : "Pending review"}
            </p>
          </div>
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${t.recorder_approved ? "bg-green-500/10 text-green-400" : "bg-amber-500/10 text-amber-400"}`}>
            {t.recorder_approved ? "Done" : "Review"}
          </span>
        </button>
      ))}
      <button
        onClick={onClose}
        className="w-full text-[12px] text-muted-foreground hover:text-foreground py-2 transition-colors"
      >
        Close
      </button>
    </div>
  );
}

// ── Griot story card ───────────────────────────────────────────────────────

function GriotStoryCard({ story, onRequestHelp }: { story: GriotStory; onRequestHelp?: (story: GriotStory) => void }) {
  const { currentUser } = useAppContext();
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [reporting, setReporting] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const total = story.duration_seconds ?? 120;

  const submitReport = async () => {
    if (!currentUser || reportReason.trim().length < 10) {
      toast({ title: "Please describe the issue in at least 10 characters", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          reporter_id: currentUser.id,
          reported_griot_story_id: story.id,
          type: "other",
          description: reportReason.trim(),
        }),
      });
      if (!res.ok) throw new Error("failed");
      setReportSent(true);
      setReporting(false);
      toast({ title: "Report submitted — an admin will review this story" });
    } catch {
      toast({ title: "Couldn't submit report, try again", variant: "destructive" });
    }
  };

  const togglePlay = () => {
    if (playing) {
      clearInterval(timerRef.current!);
      setPlaying(false);
    } else {
      setPlaying(true);
      timerRef.current = setInterval(() => {
        setElapsed(e => {
          if (e >= total - 1) {
            clearInterval(timerRef.current!);
            setPlaying(false);
            return 0;
          }
          return e + 1;
        });
      }, 1000);
    }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const LANG_NAMES: Record<string, string> = {
    en: "English", es: "Español", fr: "Français", pt: "Português",
    ht: "Kreyòl", sw: "Kiswahili", yo: "Yorùbá", ar: "العربية",
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button
        className="w-full text-left p-4 flex items-start gap-3"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
          <BookOpen className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-[14px] leading-snug line-clamp-2">
            {story.title ?? "Untitled story"}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <MapPin className="w-3 h-3" />
            {story.hub_location ?? "Diaspora community"}
            <span className="ml-1 px-1.5 py-0 bg-muted rounded-full">
              {LANG_NAMES[story.original_language] ?? story.original_language}
            </span>
          </p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              {/* Audio player */}
              {story.audio_url && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={togglePlay}
                    className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0"
                    aria-label={playing ? "Pause" : "Play"}
                  >
                    {playing ? <Square className="w-4 h-4 text-primary-foreground fill-primary-foreground" /> : <Play className="w-4 h-4 text-primary-foreground fill-primary-foreground ml-0.5" />}
                  </button>
                  {/* Waveform bars */}
                  <div className="flex-1 flex items-center gap-[2px] h-8">
                    {Array.from({ length: 30 }, (_, i) => {
                      const h = [8,14,10,20,16,24,12,18,9,15,22,11,19,13,17,10,21,14,8,16,12,20,9,18,15,11,23,13,17,10][i];
                      const active = i < Math.floor((elapsed / total) * 30);
                      return (
                        <div
                          key={i}
                          className={`rounded-sm flex-shrink-0 transition-colors ${active ? "bg-primary" : "bg-border"}`}
                          style={{ width: 3, height: h }}
                        />
                      );
                    })}
                  </div>
                  <span className="text-[11px] text-muted-foreground font-mono min-w-[36px] text-right">
                    {playing ? fmt(elapsed) : fmt(total)}
                  </span>
                </div>
              )}

              {/* Text content */}
              {story.text_content && (
                <p className="text-[13px] leading-relaxed text-foreground/80 font-serif italic">
                  &ldquo;{story.text_content}&rdquo;
                </p>
              )}

              {story.diaspora_tag && (
                <p className="text-[11px] text-muted-foreground">
                  Tagged: <span className="text-primary">{story.diaspora_tag}</span>
                </p>
              )}

              {/* Story-to-Action: one-tap to create a PIF request inspired by this story */}
              {currentUser && onRequestHelp && (
                <button
                  onClick={() => onRequestHelp(story)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/10 border border-primary/30 text-primary text-[12px] font-bold hover:bg-primary/20 transition-colors"
                  style={{ touchAction: "manipulation" }}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  Request help inspired by this story ↗
                </button>
              )}

              <div className="pt-1 border-t border-border/60">
                {reportSent ? (
                  <p className="text-[11px] text-muted-foreground pt-2">Report submitted. Thank you for helping keep Niakofa safe.</p>
                ) : reporting ? (
                  <div className="pt-2 space-y-2">
                    <textarea
                      value={reportReason}
                      onChange={e => setReportReason(e.target.value)}
                      rows={2}
                      placeholder="What's wrong with this story? (min 10 characters)"
                      className="w-full bg-muted/40 border border-border rounded-lg p-2 text-[12px] resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                      style={{ fontSize: "16px" }}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={submitReport}
                        className="flex-1 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg py-1.5 text-[12px] font-bold hover:bg-destructive/20 transition-colors"
                      >
                        Submit report
                      </button>
                      <button
                        onClick={() => { setReporting(false); setReportReason(""); }}
                        className="px-3 rounded-lg text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setReporting(true)}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive transition-colors pt-2"
                  >
                    <Flag className="w-3 h-3" /> Report this story
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Record new story panel ─────────────────────────────────────────────────

type RecordMode = "voice" | "text";
type RecordStep = "compose" | "review" | "release";
const DAILY_PROMPTS = [
  "What's a name, place, or memory you want the next generation to know?",
  "Describe a tradition in your family that comes from your ancestors.",
  "Tell us about a food, song, or practice tied to your heritage.",
  "Who was an elder who shaped who you are?",
  "What language or words do you wish the next generation would keep?",
];

function RecordStoryPanel({
  selectedHub,
  onClose,
  onSaved,
}: {
  selectedHub: Hub | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<RecordMode>("voice");
  const [step, setStep] = useState<RecordStep>("compose");
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [textContent, setTextContent] = useState("");
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<"public" | "diaspora_tag" | "private">("public");
  const [originalLanguage, setOriginalLanguage] = useState("en");
  const [saving, setSaving] = useState(false);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const prompt = DAILY_PROMPTS[new Date().getDate() % DAILY_PROMPTS.length];
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const toggleRecording = () => {
    if (recording) {
      clearInterval(recTimerRef.current!);
      setRecording(false);
    } else {
      setRecording(true);
      recTimerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
    }
  };

  const saveStory = async () => {
    if (!textContent.trim() && recSeconds === 0) {
      toast({ title: "Add a story first", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: title || prompt.slice(0, 80),
        text_content: textContent || undefined,
        visibility,
        hub_location: selectedHub?.name,
        lat: selectedHub?.lat,
        lng: selectedHub?.lng,
        diaspora_tag: selectedHub?.tag,
        duration_seconds: recSeconds > 0 ? recSeconds : undefined,
        original_language: originalLanguage,
      };

      const res = await fetch("/api/griot/stories", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await res.text());
      toast({ title: "Story saved! Nia will transcribe and translate it shortly." });
      onSaved();
    } catch {
      toast({ title: "Failed to save story", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (step === "release") {
    return (
      <div className="space-y-4">
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          Your story is saved. Nia will transcribe and translate it automatically. 
          You&apos;ll review the translations before it goes public.
        </p>

        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Visibility</p>
          {(["public", "diaspora_tag", "private"] as const).map(v => (
            <button
              key={v}
              onClick={() => setVisibility(v)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                visibility === v ? "border-primary bg-primary/10" : "border-border bg-muted/30 hover:bg-muted/50"
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${visibility === v ? "border-primary" : "border-muted-foreground"}`}>
                {visibility === v && <div className="w-2 h-2 rounded-full bg-primary" />}
              </div>
              <div>
                <p className="text-[13px] font-medium">
                  {v === "public" ? "🌍 Public to globe" : v === "diaspora_tag" ? "🏷️ Diaspora tag only" : "🔒 Private (just me)"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {v === "public" ? "Anyone on the Diaspora Globe can find it" :
                   v === "diaspora_tag" ? "Only people with your heritage tag" :
                   "Only you can see this story"}
                </p>
              </div>
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setStep("compose")}
            className="flex-1 py-2.5 rounded-xl border border-border text-[13px] font-bold text-muted-foreground hover:text-foreground transition-colors"
          >
            Back
          </button>
          <button
            onClick={saveStory}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-[13px] font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save story ↗"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Daily prompt */}
      <div>
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Today&apos;s prompt</p>
        <p className="text-[14px] font-bold leading-snug font-serif">{prompt}</p>
      </div>

      {/* Optional title */}
      <input
        type="text"
        placeholder="Give your story a title (optional)"
        value={title}
        onChange={e => setTitle(e.target.value)}
        className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-[14px] focus:outline-none focus:ring-1 focus:ring-primary"
        style={{ fontSize: "16px" }}
      />

      {/* Language of the original recording */}
      <div>
        <label className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1 block">Language</label>
        <select
          value={originalLanguage}
          onChange={e => setOriginalLanguage(e.target.value)}
          className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-[14px] focus:outline-none focus:ring-1 focus:ring-primary"
          style={{ fontSize: "16px" }}
        >
          {STORY_LANGUAGES.map(({ code, label }) => (
            <option key={code} value={code}>{label}</option>
          ))}
        </select>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2">
        {(["voice", "text"] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-[13px] font-bold transition-all ${
              mode === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {m === "voice" ? <Mic className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
            {m === "voice" ? "Voice" : "Text"}
          </button>
        ))}
      </div>

      {/* Voice recording */}
      {mode === "voice" && (
        <div className="flex flex-col items-center py-4 gap-3">
          <button
            onClick={toggleRecording}
            aria-label={recording ? "Stop recording" : "Start recording"}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
              recording
                ? "bg-red-500/20 border-2 border-red-500 animate-pulse"
                : "bg-muted/40 border-2 border-border hover:border-primary"
            }`}
          >
            {recording
              ? <MicOff className="w-7 h-7 text-red-400" />
              : <Mic className="w-7 h-7 text-primary" />}
          </button>
          <p className="text-[12px] text-muted-foreground">
            {recording ? "Recording…" : "Tap to start"}
          </p>
          {(recording || recSeconds > 0) && (
            <p className="text-xl font-mono text-primary">{fmt(recSeconds)}</p>
          )}
        </div>
      )}

      {/* Text input */}
      {mode === "text" && (
        <textarea
          value={textContent}
          onChange={e => setTextContent(e.target.value)}
          rows={5}
          placeholder="Write the story here, in whatever language feels most natural…"
          className="w-full bg-muted/40 border border-border rounded-xl p-3 text-[14px] leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-primary font-serif"
          style={{ fontSize: "16px" }}
        />
      )}

      {/* Privacy note + next */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Lock className="w-3 h-3" /> Public by default, opt-out available
        </p>
        <button
          onClick={() => setStep("release")}
          disabled={(mode === "text" && !textContent.trim()) || (mode === "voice" && recSeconds === 0)}
          className="flex items-center gap-1 bg-primary text-primary-foreground rounded-xl px-4 py-2 text-[13px] font-bold hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          Next <Send className="w-3 h-3" />
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
        Nia will automatically transcribe and translate your story.
        You&apos;ll review translations before they go live.
      </p>
    </div>
  );
}

// ── Main globe view ────────────────────────────────────────────────────────

type GlobeLayer = "hubs" | "stories" | "arcs";
type GlobePanel = "hub" | "stories_feed" | "record" | "translations" | null;

export default function GlobePage() {
  const { currentUser } = useAppContext();
  const [, setLocation] = useLocation();
  const [activeHub, setActiveHub] = useState<Hub | null>(null);
  const [panel, setPanel] = useState<GlobePanel>(null);
  const [enabledLayers, setEnabledLayers] = useState<Set<GlobeLayer>>(
    new Set(["hubs", "arcs"])
  );
  const [stories, setStories] = useState<GriotStory[]>([]);
  const [myStories, setMyStories] = useState<GriotStory[]>([]);
  const [myTranslations, setMyTranslations] = useState<StoryTranslation[]>([]);
  const [reviewingStoryId, setReviewingStoryId] = useState<number | null>(null);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [hubsLastUpdated, setHubsLastUpdated] = useState<Date | null>(null);
  const [hubsLoading, setHubsLoading] = useState(true);
  // Separate from hubsLoading — set on background re-fetches so the panel can
  // show a subtle spinner without wiping the existing data from view.
  const [hubsRefreshing, setHubsRefreshing] = useState(false);
  const [hubsError, setHubsError] = useState(false);
  // Tracks whether the very first fetch has resolved so subsequent calls go
  // through the "refresh" path (update in-place) rather than the "loading" path.
  const hubsInitialLoadDone = useRef(false);
  const [pledgeTarget, setPledgeTarget] = useState<Hub | null>(null);
  const mapRef = useRef<MapRef | null>(null);

  // Map initial view — centered on Atlantic (to show both Americas and Africa)
  const [viewState, setViewState] = useState({
    longitude: -30,
    latitude: 20,
    zoom: 1.5,
    pitch: 15,
    bearing: 0,
  });

  const toggleLayer = (layer: GlobeLayer) => {
    setEnabledLayers(prev => {
      const next = new Set(prev);
      next.has(layer) ? next.delete(layer) : next.add(layer);
      return next;
    });
  };

  const fetchHubs = useCallback(async () => {
    // Distinguish initial load (shows full skeleton) from background refresh
    // (updates data in-place with a subtle spinner — no content flash).
    const isBackgroundRefresh = hubsInitialLoadDone.current;
    if (isBackgroundRefresh) {
      setHubsRefreshing(true);
    } else {
      setHubsLoading(true);
    }
    setHubsError(false);
    try {
      // Include auth headers — even though /api/griot/hubs is public,
      // authenticated requests bypass stricter rate limiting.
      const res = await fetch("/api/griot/hubs", { headers: authHeaders() });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`${res.status}: ${errText || "Unknown error"}`);
      }
      const data = await res.json() as {
        hubs: Array<{
          id: number; name: string; region_label: string; lat: number; lng: number;
          tag: string; note: string | null; community_id: number | null;
          story_count: number; member_count: number; open_requests?: number;
          reserved_balance?: string | number | null; activity: HubActivity | null;
          is_crisis: boolean; crisis_message: string | null;
        }>;
      };
      if (!Array.isArray(data?.hubs)) throw new Error("Invalid hubs response shape");
      const mapped: Hub[] = data.hubs.map(h => ({
        id: h.id,
        name: h.name,
        region: h.region_label,
        lat: h.lat,
        lng: h.lng,
        tag: h.tag,
        note: h.note,
        community_id: h.community_id,
        story_count: h.story_count,
        member_count: h.member_count ?? 0,
        open_requests: h.open_requests ?? 0,
        reserved_balance: h.reserved_balance ?? null,
        activity: h.activity,
        is_crisis: h.is_crisis ?? false,
        crisis_message: h.crisis_message ?? null,
      }));
      setHubs(mapped);
      hubsInitialLoadDone.current = true;
      setHubsLastUpdated(new Date());
    } catch {
      setHubsError(true);
    } finally {
      setHubsLoading(false);
      setHubsRefreshing(false);
    }
  }, []);

  const fetchStories = useCallback(async (hubLocation?: string) => {
    setStoriesLoading(true);
    try {
      const params = new URLSearchParams({ limit: "20" });
      if (hubLocation) params.set("hub", hubLocation);
      const res = await fetch(`/api/griot/stories?${params}`);
      if (res.ok) {
        const data = await res.json() as { stories: GriotStory[] };
        setStories(data.stories);
      }
    } finally {
      setStoriesLoading(false);
    }
  }, []);

  const fetchMyTranslations = useCallback(async (storyId?: number) => {
    if (!currentUser) return;
    try {
      // Fetch the caller's own stories first
      const storiesRes = await fetch("/api/griot/stories/mine", {
        headers: authHeaders(),
      });
      if (!storiesRes.ok) return;
      const storiesData = await storiesRes.json() as { stories: GriotStory[] };
      setMyStories(storiesData.stories);

      // If a specific story was requested, fetch its translations
      const targetId = storyId ?? storiesData.stories[0]?.id;
      if (targetId) {
        const transRes = await fetch(`/api/griot/stories/${targetId}/translations`, {
          headers: authHeaders(),
        });
        if (transRes.ok) {
          const transData = await transRes.json() as { translations: StoryTranslation[] };
          setMyTranslations(transData.translations);
          setReviewingStoryId(targetId);
        }
      }
    } catch {
      // silent
    }
  }, [currentUser]);

  useEffect(() => {
    fetchStories();
    fetchHubs();
  }, [fetchStories, fetchHubs]);

  // ── Keep the open hub panel in sync with background refreshes ─────────────
  // When fetchHubs completes in the background and updates `hubs`, any panel
  // that is showing a hub will still display the stale snapshot that was
  // captured at click time (stored in `activeHub` state). This effect replaces
  // `activeHub` with the matching fresh entry from the latest `hubs` array so
  // live stats (open_requests, pool_balance, activity, etc.) always reflect
  // what the server just returned — even on slow networks where the fetch
  // resolves seconds or minutes after the user opened the panel.
  useEffect(() => {
    if (!activeHub) return;
    const fresh = hubs.find(h => h.id === activeHub.id);
    // Only update if something actually changed (avoids a pointless re-render).
    if (fresh && JSON.stringify(fresh) !== JSON.stringify(activeHub)) {
      setActiveHub(fresh);
    }
  }, [hubs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Periodic background refresh of hub data (every 60 seconds) ────────────
  // Hub stats (open_requests, pool_balance, active_helpers) change in real time.
  // Without periodic re-fetches, a user who leaves the Globe page open while
  // the network is slow sees numbers that drift further from reality over time.
  // 60s matches the Nia-status poll cadence — low enough to stay fresh,
  // high enough to not spam the API.
  useEffect(() => {
    const id = setInterval(() => { fetchHubs(); }, 60_000);
    return () => clearInterval(id);
  }, [fetchHubs]);

  // Recompute arcs whenever hubs load/change. Falls back to FALLBACK_HOME
  // anchor until the "home"-tagged hub has arrived from the API.
  const arcGeojson = useMemo(() => buildArcs(hubs), [hubs]);

  const handleHubClick = (hub: Hub) => {
    setActiveHub(hub);
    setPanel("hub");
    // Fly to the hub
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [hub.lng, hub.lat],
        zoom: 4,
        duration: 1500,
        essential: true,
      });
    }
  };

  const openStoriesFeed = (hub?: Hub) => {
    const h = hub ?? activeHub;
    setPanel("stories_feed");
    fetchStories(h?.name);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-card/95 backdrop-blur-xl border-b border-border p-4 pt-safe">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-black uppercase tracking-widest flex items-center gap-2 flex-1">
            <Globe2 className="w-5 h-5 text-primary" /> Diaspora Globe
          </h1>
          {currentUser && (
            <button
              onClick={() => { setPanel("record"); setActiveHub(null); }}
              className="flex items-center gap-1.5 bg-primary/10 border border-primary/30 text-primary rounded-xl px-3 py-1.5 text-[12px] font-bold hover:bg-primary/20 transition-colors"
            >
              <Mic className="w-3.5 h-3.5" /> Record story
            </button>
          )}
        </div>

        {/* Layer toggles */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
          {(["hubs", "stories", "arcs"] as const).map(layer => (
            <button
              key={layer}
              onClick={() => toggleLayer(layer)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider border transition-all ${
                enabledLayers.has(layer)
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : "bg-muted/50 border-border text-muted-foreground"
              }`}
            >
              {layer === "hubs" ? "🌍 Hubs" : layer === "stories" ? "📖 Stories" : "〰️ Arcs"}
            </button>
          ))}
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-muted/30 rounded-full text-[11px] text-muted-foreground">
            <Languages className="w-3 h-3" />
            <span>7 languages</span>
          </div>
        </div>
      </div>

      {/* Map — only mounted when token is present to avoid auth errors */}
      <div className="relative diaspora-globe-map" style={{ height: "55vw", minHeight: 220, maxHeight: 380 }}>
        {!MAPBOX_TOKEN && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/30 rounded-xl gap-2 px-4">
            <p className="text-sm font-bold text-center text-foreground">Globe unavailable</p>
            <p className="text-xs text-muted-foreground text-center">
              Add <code className="bg-muted px-1 rounded text-[11px]">VITE_MAPBOX_TOKEN</code> in Replit Secrets to see the diaspora globe.
            </p>
          </div>
        )}
        {MAPBOX_TOKEN && <Map
          ref={mapRef}
          mapboxAccessToken={MAPBOX_TOKEN}
          {...viewState}
          onMove={e => setViewState(e.viewState)}
          projection={{ name: "globe" }}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          style={{ width: "100%", height: "100%" }}
          fog={{
            color: "rgb(10, 12, 20)",
            "high-color": "rgb(30, 35, 60)",
            "horizon-blend": 0.02,
            "star-intensity": 0.4,
          }}
          scrollZoom={false}
          doubleClickZoom={false}
          attributionControl={false}
        >
          {/* Great-circle arcs layer — computed from live hub data */}
          {enabledLayers.has("arcs") && (
            <Source id="arcs" type="geojson" data={arcGeojson}>
              <Layer
                id="arcs-line"
                type="line"
                paint={{
                  "line-color": "#f59e0b",
                  "line-width": 1,
                  "line-opacity": 0.35,
                  "line-dasharray": [2, 3],
                }}
              />
            </Source>
          )}

          {/* Hub markers — rendered from live API data */}
          {enabledLayers.has("hubs") && hubs.map(hub => (
            <Marker
              key={hub.id}
              longitude={hub.lng}
              latitude={hub.lat}
              anchor="center"
              onClick={() => handleHubClick(hub)}
            >
              <button
                aria-label={`${hub.name} — ${hub.region}`}
                style={{ touchAction: "manipulation" }}
                className="relative group"
              >
                {/* Pulse ring for home — keyed on tag === "home" (not a fixed id) */}
                {hub.tag === "home" && (
                  <span
                    className="absolute inset-0 rounded-full animate-ping"
                    style={{ background: HUB_COLORS[hub.tag] ?? DEFAULT_HUB_COLOR, opacity: 0.3 }}
                  />
                )}
                <span
                  className="relative flex items-center justify-center rounded-full border-2 border-background shadow-lg transition-transform group-active:scale-90"
                  style={{
                    width: hub.tag === "home" ? 18 : 13,
                    height: hub.tag === "home" ? 18 : 13,
                    background: HUB_COLORS[hub.tag] ?? DEFAULT_HUB_COLOR,
                  }}
                />
                {/* Story dot overlay — only shown when there are actual stories */}
                {enabledLayers.has("stories") && hub.story_count > 0 && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-400 rounded-full border border-background" />
                )}
              </button>
            </Marker>
          ))}
        </Map>}

        {/* Zoom controls */}
        <div className="absolute right-3 bottom-3 flex flex-col gap-1.5">
          <button
            onClick={() => setViewState(v => ({ ...v, zoom: Math.min(v.zoom + 0.8, 10) }))}
            className="w-9 h-9 bg-card/90 border border-border rounded-xl flex items-center justify-center text-foreground hover:bg-card transition-colors shadow-lg"
            aria-label="Zoom in"
          >
            <span className="text-lg font-bold leading-none">+</span>
          </button>
          <button
            onClick={() => setViewState(v => ({ ...v, zoom: Math.max(v.zoom - 0.8, 1) }))}
            className="w-9 h-9 bg-card/90 border border-border rounded-xl flex items-center justify-center text-foreground hover:bg-card transition-colors shadow-lg"
            aria-label="Zoom out"
          >
            <span className="text-lg font-bold leading-none">−</span>
          </button>
          <button
            onClick={() => setViewState({ longitude: -30, latitude: 20, zoom: 1.5, pitch: 15, bearing: 0 })}
            className="w-9 h-9 bg-card/90 border border-border rounded-xl flex items-center justify-center text-foreground hover:bg-card transition-colors shadow-lg"
            aria-label="Reset view"
          >
            <Globe2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-3 px-4 py-2 overflow-x-auto scrollbar-none text-[10px] text-muted-foreground">
        {Object.entries(HUB_COLORS).map(([tag, color]) => (
          <div key={tag} className="flex items-center gap-1 shrink-0">
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span>{TAG_LABEL[tag as HubTag]}</span>
          </div>
        ))}
      </div>

      {/* Panel area */}
      <div className="flex-1 px-4 pb-28 space-y-3 max-w-lg mx-auto w-full">

        {/* Hub detail card */}
        <AnimatePresence mode="wait">
          {panel === "hub" && activeHub && (
            <motion.div
              key="hub-detail"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="bg-card border border-border rounded-2xl p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => { setPanel(null); setActiveHub(null); }}
                  className="flex items-center gap-1 text-[12px] font-bold text-muted-foreground hover:text-foreground transition-colors -ml-1 px-1 py-0.5 rounded-lg hover:bg-muted"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Back to hubs
                </button>
                {/* Manual refresh + "how fresh is this" indicator — always
                    available so users aren't stuck with stale data on slow
                    connections, and can see at a glance whether the numbers
                    they're looking at are current. */}
                <LastUpdated
                  lastUpdated={hubsLastUpdated}
                  refreshing={hubsRefreshing}
                  onRefresh={() => fetchHubs()}
                />
              </div>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: HUB_COLORS[activeHub.tag] ?? DEFAULT_HUB_COLOR }}
                    />
                    <h2 className="font-black text-[16px]">{activeHub.name}</h2>
                  </div>
                  <p className="text-[12px] text-muted-foreground mt-0.5">{activeHub.region}</p>
                </div>
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full font-bold"
                  style={{
                    color: HUB_COLORS[activeHub.tag] ?? DEFAULT_HUB_COLOR,
                    background: `${HUB_COLORS[activeHub.tag] ?? DEFAULT_HUB_COLOR}20`,
                  }}
                >
                  {TAG_LABEL[activeHub.tag] ?? activeHub.tag}
                </span>
              </div>
              {activeHub.note && (
                <p className="text-[13px] text-foreground/80 leading-relaxed mb-3">{activeHub.note}</p>
              )}

              {activeHub.is_crisis && (
                <div className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3">
                  <p className="text-[11px] font-black text-red-500 uppercase tracking-wide mb-1">⚠ Crisis declared</p>
                  {activeHub.crisis_message && (
                    <p className="text-[12px] text-foreground/90 leading-relaxed mb-2">{activeHub.crisis_message}</p>
                  )}
                  <button
                    onClick={() => setPledgeTarget(activeHub)}
                    className="w-full py-2 rounded-lg bg-red-500 text-white text-[12px] font-bold hover:bg-red-600 transition-colors"
                  >
                    Send help from another hub
                  </button>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground mb-2">
                {activeHub.member_count} {activeHub.member_count === 1 ? "member" : "members"}
              </p>

              {/* Live activity — only present once a community has claimed this hub */}
              {activeHub.activity ? (
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-muted/40 rounded-xl p-2 text-center">
                    <p className="text-[15px] font-black">{activeHub.activity.active_helpers}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Helpers</p>
                  </div>
                  <div className="bg-muted/40 rounded-xl p-2 text-center">
                    <p className="text-[15px] font-black">{activeHub.activity.requests_fulfilled}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Fulfilled</p>
                  </div>
                  <div className="bg-muted/40 rounded-xl p-2 text-center">
                    <p className="text-[15px] font-black">${activeHub.activity.pool_balance.toFixed(0)}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Pool</p>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground mb-3">
                  {activeHub.story_count} {activeHub.story_count === 1 ? "story" : "stories"} shared here
                </p>
              )}

              {/* Mutual-aid engine link — real open requests tagged to this hub.
                  Reserved balance shows how much of the pool is ring-fenced here. */}
              <div className="bg-muted/30 border border-border/60 rounded-xl p-3 mb-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                    <div>
                      <p className="text-[12px] font-bold">
                        {activeHub.open_requests} open {activeHub.open_requests === 1 ? "request" : "requests"}
                      </p>
                      {activeHub.reserved_balance != null && Number(activeHub.reserved_balance) > 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          ${Number(activeHub.reserved_balance).toFixed(0)} ring-fenced for this hub
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setLocation("/requests")}
                    className="text-[11px] font-bold text-primary hover:underline shrink-0"
                  >
                    View ↗
                  </button>
                </div>
                {/* Per-hub kindness impact chain */}
                {(activeHub.activity?.requests_fulfilled ?? 0) > 0 && (
                  <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                    <div className="flex gap-0.5">
                      {Array.from({ length: Math.min(activeHub.activity!.requests_fulfilled, 7) }).map((_, i) => (
                        <span key={i} className="w-2.5 h-2.5 rounded-full bg-primary/60" style={{ opacity: 1 - i * 0.1 }} />
                      ))}
                      {activeHub.activity!.requests_fulfilled > 7 && (
                        <span className="text-[10px] text-muted-foreground ml-1">+{activeHub.activity!.requests_fulfilled - 7}</span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">Kindness chain — {activeHub.activity!.requests_fulfilled} neighbors helped</span>
                  </div>
                )}
              </div>
              {/* Story-to-Action: request help inspired by this hub */}
              {currentUser && (
                <button
                  onClick={() => {
                    const params = new URLSearchParams();
                    params.set("title", `Inspired by: ${activeHub.name} community`);
                    params.set("neighborhood", activeHub.name);
                    if (activeHub.tag) params.set("diaspora_tag", activeHub.tag);
                    setLocation(`/request/new?${params.toString()}`);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/10 border border-primary/30 text-primary text-[12px] font-bold hover:bg-primary/20 transition-colors mb-3"
                  style={{ touchAction: "manipulation" }}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  Request help from this community ↗
                </button>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => openStoriesFeed(activeHub)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-muted/50 border border-border rounded-xl text-[13px] font-bold hover:bg-muted transition-colors"
                >
                  <BookOpen className="w-4 h-4" /> Stories ↗
                </button>
                <button
                  onClick={() => setPanel("record")}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-primary/10 border border-primary/30 text-primary rounded-xl text-[13px] font-bold hover:bg-primary/20 transition-colors"
                >
                  <Mic className="w-4 h-4" /> Record here
                </button>
              </div>
              <button
                onClick={() => setLocation("/civic-needs")}
                className="w-full mt-2 flex items-center justify-center gap-1.5 py-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl text-[13px] font-bold hover:bg-amber-500/20 transition-colors"
              >
                <ClipboardList className="w-4 h-4" /> Civic needs marketplace ↗
              </button>
              {currentUser && (
                <button
                  onClick={() => setLocation(`/hub-leader/${activeHub.id}`)}
                  className="w-full mt-2 flex items-center justify-center gap-1.5 py-2.5 bg-muted/50 border border-border rounded-xl text-[13px] font-bold hover:bg-muted transition-colors"
                >
                  Hub leader dashboard ↗
                </button>
              )}
            </motion.div>
          )}

          {/* Stories feed */}
          {panel === "stories_feed" && (
            <motion.div
              key="stories-feed"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-black text-[15px] flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  Griot Stories
                  {activeHub && <span className="text-muted-foreground font-normal text-[12px]">· {activeHub.name}</span>}
                </h2>
                <button
                  onClick={() => setPanel(activeHub ? "hub" : null)}
                  className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Back
                </button>
              </div>

              {storiesLoading ? (
                <div className="text-center py-8 text-muted-foreground text-[13px]">Loading stories…</div>
              ) : stories.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-muted-foreground text-[13px]">No stories yet for this hub.</p>
                  <button
                    onClick={() => setPanel("record")}
                    className="text-primary text-[13px] font-bold hover:underline"
                  >
                    Be the first to share one ↗
                  </button>
                </div>
              ) : (
                stories.map(s => (
                <GriotStoryCard
                  key={s.id}
                  story={s}
                  onRequestHelp={(story) => {
                    // Story-to-Action: navigate to request-new with cultural context pre-filled
                    const params = new URLSearchParams();
                    if (story.hub_location) params.set("title", `Inspired by: ${story.hub_location} community`);
                    if (story.diaspora_tag) params.set("diaspora_tag", story.diaspora_tag);
                    if (story.hub_location) params.set("neighborhood", story.hub_location);
                    setLocation(`/request/new?${params.toString()}`);
                  }}
                />
              ))
              )}
            </motion.div>
          )}

          {/* Record story */}
          {panel === "record" && (
            <motion.div
              key="record-panel"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="bg-card border border-border rounded-2xl p-4"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-black text-[15px] flex items-center gap-2">
                  <Mic className="w-4 h-4 text-primary" /> Record a story
                </h2>
                <button onClick={() => setPanel(activeHub ? "hub" : null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              {currentUser ? (
                <RecordStoryPanel
                  selectedHub={activeHub}
                  onClose={() => setPanel(activeHub ? "hub" : null)}
                  onSaved={() => { fetchStories(); setPanel(activeHub ? "hub" : null); }}
                />
              ) : (
                <p className="text-[13px] text-muted-foreground text-center py-4">
                  Sign in to record and share a griot story.
                </p>
              )}
            </motion.div>
          )}

          {/* Translation review */}
          {panel === "translations" && reviewingStoryId && (
            <motion.div
              key="translations-panel"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="bg-card border border-border rounded-2xl p-4"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-black text-[15px] flex items-center gap-2">
                  <Languages className="w-4 h-4 text-primary" /> Review Translations
                </h2>
                <button onClick={() => setPanel(null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              <TranslationReviewPanel
                storyId={reviewingStoryId}
                storyText={myStories.find(s => s.id === reviewingStoryId)?.text_content ?? null}
                translations={myTranslations}
                onClose={() => setPanel(null)}
                onRefresh={() => fetchMyTranslations()}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Default: hub picker grid when no panel open */}
        {panel === null && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] text-muted-foreground uppercase tracking-widest font-bold">Diaspora Hubs</p>
              <LastUpdated
                lastUpdated={hubsLastUpdated}
                refreshing={hubsRefreshing}
                onRefresh={() => fetchHubs()}
              />
            </div>

            {/* Loading skeleton */}
            {hubsLoading && hubs.length === 0 && (
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-16 bg-muted/30 rounded-2xl animate-pulse" />
                ))}
              </div>
            )}

            {/* Error state */}
            {!hubsLoading && hubsError && (
              <button
                onClick={fetchHubs}
                style={{ touchAction: "manipulation" }}
                className="w-full flex items-center justify-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-2xl text-[12px] text-destructive hover:bg-destructive/15 transition-colors active:scale-[0.98]"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Couldn't load hubs — tap to retry
              </button>
            )}

            {/* Empty state */}
            {!hubsLoading && !hubsError && hubs.length === 0 && (
              <p className="text-[12px] text-muted-foreground py-4 text-center">No hubs yet.</p>
            )}

            {/* Hub grid */}
            {hubs.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {hubs.map(hub => (
                  <button
                    key={hub.id}
                    onClick={() => handleHubClick(hub)}
                    className="flex flex-col items-start gap-0.5 p-3 bg-card border border-border rounded-2xl hover:border-primary/40 transition-all text-left active:scale-95"
                    style={{ touchAction: "manipulation" }}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: HUB_COLORS[hub.tag] ?? DEFAULT_HUB_COLOR }} />
                      <span className="text-[12px] font-black leading-snug truncate">{hub.name}</span>
                      {hub.is_crisis && <span className="ml-auto text-[9px] text-red-500 font-black">⚠</span>}
                    </div>
                    <span className="text-[10px] text-muted-foreground pl-4">{hub.region}</span>
                    {hub.open_requests > 0 && (
                      <span className="pl-4 text-[10px] text-primary font-bold">
                        {hub.open_requests} open {hub.open_requests === 1 ? "request" : "requests"}
                      </span>
                    )}
                    {hub.story_count > 0 && (
                      <span className="pl-4 text-[10px] text-muted-foreground">
                        {hub.story_count} {hub.story_count === 1 ? "story" : "stories"}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {currentUser && (
              <button
                onClick={() => { fetchMyTranslations(); setPanel("translations"); }}
                className="w-full flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-2xl text-[13px] font-bold hover:bg-amber-500/20 transition-colors"
              >
                <BookOpen className="w-4 h-4" />
                My stories &amp; translations
              </button>
            )}
          </div>
        )}
      </div>

      {pledgeTarget && (
        <PledgeModal
          targetHub={pledgeTarget}
          allHubs={hubs}
          onClose={() => setPledgeTarget(null)}
        />
      )}
    </div>
  );
}

function PledgeModal({
  targetHub,
  allHubs,
  onClose,
}: {
  targetHub: Hub;
  allHubs: Hub[];
  onClose: () => void;
}) {
  const [fromHubId, setFromHubId] = useState<number | "">("");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // When Stripe is configured, the POST below returns a client_secret and we
  // hand off to the shared payment sheet instead of marking the pledge done —
  // no money has moved yet at that point.
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const candidateHubs = allHubs.filter(h => h.id !== targetHub.id);
  const numericAmount = Number(amount);

  const submit = async () => {
    if (!fromHubId || !amount || numericAmount <= 0) {
      setError("Pick a sending hub and an amount");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/griot/hubs/${targetHub.id}/pledges`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ from_hub_id: fromHubId, amount: numericAmount, message: message || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `${res.status}`);
      }
      const data = await res.json() as { mode?: string; client_secret?: string };
      if (data.mode === "stripe" && data.client_secret) {
        // Real charge required — open the payment sheet. `done` is only set
        // once Stripe actually confirms the PaymentIntent (onSuccess below).
        setClientSecret(data.client_secret);
      } else {
        // Dev mode (no Stripe configured) — the server already recorded and
        // credited the pledge directly.
        setDone(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send pledge");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl p-4 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <>
            <p className="text-[15px] font-black mb-1">Pledge sent 🙏</p>
            <p className="text-[12px] text-muted-foreground mb-3">
              Your ${numericAmount.toFixed(2)} pledge to {targetHub.name} is confirmed and has been added to their community fund.
            </p>
            <button onClick={onClose} className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-[13px] font-bold">
              Close
            </button>
          </>
        ) : (
          <>
            <p className="text-[15px] font-black mb-1">Send help to {targetHub.name}</p>
            <p className="text-[12px] text-muted-foreground mb-3">
              Pledge direct crisis support from another hub's community.
              {isStripeConfigured() && " You'll confirm payment on the next screen."}
            </p>

            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Sending hub</label>
            <select
              value={fromHubId}
              onChange={(e) => setFromHubId(e.target.value ? Number(e.target.value) : "")}
              className="w-full mt-1 mb-3 p-2 rounded-lg bg-muted/40 border border-border text-[13px]"
              style={{ fontSize: "16px" }}
            >
              <option value="">Select a hub…</option>
              {candidateHubs.map(h => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>

            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Amount (USD)</label>
            <input
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full mt-1 mb-3 p-2 rounded-lg bg-muted/40 border border-border text-[13px]"
              style={{ fontSize: "16px" }}
              placeholder="50"
            />

            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Message (optional)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full mt-1 mb-3 p-2 rounded-lg bg-muted/40 border border-border text-[13px] resize-none"
              style={{ fontSize: "16px" }}
              rows={2}
            />

            {error && <p className="text-[12px] text-red-500 mb-2">{error}</p>}

            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-muted/40 text-[13px] font-bold">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="flex-1 py-2 rounded-lg bg-red-500 text-white text-[13px] font-bold disabled:opacity-50"
              >
                {submitting ? "Sending…" : "Send pledge"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>

    {clientSecret && (
      <StripePaymentModal
        clientSecret={clientSecret}
        amount={numericAmount}
        description={`Crisis relief pledge to ${targetHub.name}`}
        onSuccess={() => {
          setClientSecret(null);
          setDone(true);
        }}
        onSkip={() => setClientSecret(null)}
        onClose={() => setClientSecret(null)}
      />
    )}
    </>
  );
}
