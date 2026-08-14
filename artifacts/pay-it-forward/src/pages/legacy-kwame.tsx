/**
 * Kwame Mensah — Canonical Character Sheet
 * Route: /legacy/kwame  (public — no auth required)
 *
 * The calibration character for the entire Niakofa Legacy RPG world.
 * Age 16 · Student · Cape Coast, Gold Coast · 1912
 *
 * Art style: Hand-drawn 2–2.5D, African anime–inspired, 4-direction frame-based.
 * All world scale, tile sizing, and environment composition derives from Kwame's
 * canonical 1.65m height reference.
 *
 * See: docs/NIAKOFA_ART_BIBLE.md
 */

import { useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, ChevronRight, Sparkles, BookOpen, Heart, Shield,
  Zap, Star, Users, MapPin, Clock, ChevronDown,
} from "lucide-react";

// ── Canonical character data (from Art Bible) ──────────────────────────────
const KWAME = {
  name: "Kwame Mensah",
  age: 16,
  year: 1912,
  location: "Cape Coast, Gold Coast",
  role: "Student / Protagonist",
  status: "Alive",
  height: "1.65 m (165 cm)",
  bodyType: "Lean / Youthful",
  bio: "A bright and curious young man with a strong sense of family and responsibility. He dreams of learning, discovering the world beyond Cape Coast, and one day helping his people build a better future.",
  traits: ["Curious", "Kind-Hearted", "Determined"],
  skills: [
    { name: "Learning",   level: 1, icon: BookOpen },
    { name: "Discovery",  level: 1, icon: MapPin },
    { name: "Resolve",    level: 1, icon: Shield },
    { name: "Empathy",    level: 1, icon: Heart },
  ],
  stats: [
    { key: "health",     label: "Health",     value: 100, max: 100, color: "bg-red-500",    track: "bg-red-900/30" },
    { key: "knowledge",  label: "Knowledge",  value: 80,  max: 100, color: "bg-sky-400",   track: "bg-sky-900/30" },
    { key: "courage",    label: "Courage",    value: 70,  max: 100, color: "bg-amber-400", track: "bg-amber-900/30" },
    { key: "faith",      label: "Faith",      value: 60,  max: 100, color: "bg-emerald-400", track: "bg-emerald-900/30" },
    { key: "reputation", label: "Reputation", value: 40,  max: 100, color: "bg-purple-400", track: "bg-purple-900/30" },
  ],
  expressions: [
    { id: "neutral",     label: "Neutral",     emoji: "😐", hue: "amber" },
    { id: "curious",     label: "Curious",     emoji: "🤔", hue: "sky" },
    { id: "determined",  label: "Determined",  emoji: "😤", hue: "orange" },
    { id: "thoughtful",  label: "Thoughtful",  emoji: "🤨", hue: "purple" },
    { id: "surprised",   label: "Surprised",   emoji: "😮", hue: "yellow" },
    { id: "happy",       label: "Happy",       emoji: "😄", hue: "emerald" },
    { id: "worried",     label: "Worried",     emoji: "😟", hue: "rose" },
  ],
  // Canonical color palette from Art Bible
  palette: [
    { name: "Skin",           hex: "#3D2116" },
    { name: "Skin Hi",        hex: "#7B4A2D" },
    { name: "Hair",           hex: "#1A0F08" },
    { name: "Shirt",          hex: "#D4C5A0" },
    { name: "Pants",          hex: "#8B7355" },
    { name: "Sandals",        hex: "#5C3D1E" },
    { name: "Accent",         hex: "#B87333" },
    { name: "Env Warm",       hex: "#C4A882" },
  ],
  // 4-direction turnaround labels
  directions: [
    { id: "down",  label: "FRONT",  desc: "Down — toward camera" },
    { id: "right", label: "RIGHT",  desc: "Lateral facing" },
    { id: "up",    label: "BACK",   desc: "Up — away from camera" },
    { id: "left",  label: "LEFT",   desc: "Lateral facing" },
  ],
  // Animation states
  animations: [
    { id: "idle",     label: "IDLE",     frames: "4–8",  fps: "6–10",  desc: "Subtle breathing, weight shift" },
    { id: "walk",     label: "WALK",     frames: "6–8",  fps: "8–12",  desc: "Natural stride, arm swing" },
    { id: "run",      label: "RUN",      frames: "6–8",  fps: "10–14", desc: "Urgent pace, leaning forward" },
    { id: "interact", label: "INTERACT", frames: "4–8",  fps: "10",    desc: "Reach, examine, pick up" },
    { id: "talk",     label: "TALK",     frames: "2–4",  fps: "8",     desc: "Subtle head/hand movement" },
    { id: "inspect",  label: "INSPECT",  frames: "4–6",  fps: "8",     desc: "Scrutinize, lean in" },
    { id: "hurt",     label: "HURT",     frames: "4–6",  fps: "10",    desc: "Recoil, recover" },
    { id: "emote",    label: "EMOTE",    frames: "4–8",  fps: "8",     desc: "Reaction expression" },
  ],
  // Character evolution timeline
  evolution: [
    {
      age: 16, year: 1912, era: "Youth",
      desc: "Cape Coast · Student · Chapter 1",
      clothing: "Simple cotton shirt, short trousers, village sandals",
      active: true,
    },
    {
      age: 25, year: 1921, era: "Young Adult",
      desc: "New responsibilities · Different story knowledge",
      clothing: "Merchant clothing, leather satchel, proper sandals",
      active: false,
    },
    {
      age: 50, year: 1946, era: "Elder",
      desc: "Family expanded · Occupation evolved · New locations",
      clothing: "Elder's robes, family heirlooms, walking staff",
      active: false,
    },
  ],
  // Environments Kwame inhabits
  environments: [
    { id: "ancestral_village", label: "Ancestral Village", chapter: 1, desc: "Starting village, family compound, baobab tree" },
    { id: "cape_coast_market", label: "Cape Coast Market", chapter: 1, desc: "Busy colonial-era market square" },
    { id: "mission_school",    label: "Mission School",    chapter: 2, desc: "Kwame's school — knowledge and conflict" },
    { id: "colonial_port",     label: "Coastal Port",      chapter: 3, desc: "Trade, ships, and the wider world" },
    { id: "cocoa_farm",        label: "Cocoa Farm",        chapter: 4, desc: "Family land — harvest and hardship" },
  ],
};

// ── World scale spec ────────────────────────────────────────────────────────
const WORLD_SPEC = {
  tileSize: 64,
  characterHeight: "2.5 tiles",
  characterHeightM: "1.65 m",
  footprint: "32×48 px",
  fps: 60,
  animFps: 12,
  perspective: "Semi-top-down 2.5D",
  directions: "4 (8 planned)",
};

// ── CSS Character Sprite (Kwame silhouette using canonical palette) ─────────
function KwameSilhouette({
  facing = "down",
  motion = "idle",
  size = 64,
}: {
  facing?: "down" | "left" | "right" | "up";
  motion?: "idle" | "walk" | "run";
  size?: number;
}) {
  const px = (n: number) => `${Math.round(n * (size / 64))}px`;
  const isWalking = motion === "walk" || motion === "run";

  // Body proportions for a lean 16-year-old at 1.65m
  return (
    <div
      className={`relative select-none ${isWalking ? "animate-bounce" : ""}`}
      style={{ width: px(28), height: px(56), animationDuration: motion === "run" ? "0.35s" : "0.5s" }}
      aria-hidden="true"
    >
      {/* Shadow */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full bg-black/30"
        style={{ width: px(20), height: px(4) }}
      />
      {/* Legs */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex gap-[3px]">
        {/* Left leg */}
        <div style={{ width: px(7), height: px(16), background: "#8B7355", borderRadius: `0 0 ${px(2)} ${px(2)}` }}>
          {/* Sandal */}
          <div style={{ width: px(9), height: px(4), background: "#5C3D1E", borderRadius: px(2), marginTop: px(12), marginLeft: px(-1) }} />
        </div>
        {/* Right leg */}
        <div style={{ width: px(7), height: px(16), background: "#7B6345", borderRadius: `0 0 ${px(2)} ${px(2)}` }}>
          <div style={{ width: px(9), height: px(4), background: "#4A3010", borderRadius: px(2), marginTop: px(12), marginLeft: px(-1) }} />
        </div>
      </div>
      {/* Torso */}
      <div
        className="absolute"
        style={{
          bottom: px(14),
          left: "50%",
          transform: "translateX(-50%)",
          width: px(18),
          height: px(20),
          background: "#D4C5A0",
          borderRadius: `${px(2)} ${px(2)} ${px(4)} ${px(4)}`,
        }}
      >
        {/* Belt */}
        <div style={{ position: "absolute", bottom: px(2), left: 0, right: 0, height: px(2), background: "#A0783C" }} />
      </div>
      {/* Arms */}
      {facing !== "up" && (
        <>
          <div
            className="absolute"
            style={{
              bottom: px(18),
              left: px(3),
              width: px(5),
              height: px(14),
              background: "#3D2116",
              borderRadius: px(3),
              transform: isWalking ? "rotate(-20deg)" : "rotate(10deg)",
              transformOrigin: "top center",
            }}
          />
          <div
            className="absolute"
            style={{
              bottom: px(18),
              right: px(3),
              width: px(5),
              height: px(14),
              background: "#3D2116",
              borderRadius: px(3),
              transform: isWalking ? "rotate(20deg)" : "rotate(-10deg)",
              transformOrigin: "top center",
            }}
          />
        </>
      )}
      {/* Neck */}
      <div
        className="absolute"
        style={{
          bottom: px(33),
          left: "50%",
          transform: "translateX(-50%)",
          width: px(6),
          height: px(5),
          background: "#3D2116",
          borderRadius: px(2),
        }}
      />
      {/* Head */}
      <div
        className="absolute"
        style={{
          bottom: px(37),
          left: "50%",
          transform: "translateX(-50%)",
          width: px(16),
          height: px(18),
          background: "#3D2116",
          borderRadius: `${px(8)} ${px(8)} ${px(6)} ${px(6)}`,
        }}
      >
        {/* Hair */}
        <div style={{ position: "absolute", top: 0, left: "10%", right: "10%", height: px(6), background: "#1A0F08", borderRadius: `${px(6)} ${px(6)} 0 0` }} />
        {/* Eyes (facing down/left/right — hidden when facing up/back) */}
        {facing !== "up" && (
          <div className="flex gap-[4px] absolute" style={{ top: px(7), left: "50%", transform: "translateX(-50%)" }}>
            <div style={{ width: px(3), height: px(3), background: "#0A0604", borderRadius: "50%" }} />
            <div style={{ width: px(3), height: px(3), background: "#0A0604", borderRadius: "50%" }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── 4-Direction Turnaround Panel ────────────────────────────────────────────
function TurnaroundPanel() {
  const directions: Array<{ id: "down" | "left" | "right" | "up"; label: string }> = [
    { id: "down",  label: "FRONT" },
    { id: "right", label: "RIGHT" },
    { id: "up",    label: "BACK" },
    { id: "left",  label: "LEFT" },
  ];
  return (
    <div className="flex items-end justify-center gap-6">
      {directions.map(dir => (
        <div key={dir.id} className="flex flex-col items-center gap-2">
          <div className="w-14 h-14 bg-[#1A0F08] rounded-xl border border-amber-700/30 flex items-end justify-center pb-1">
            <KwameSilhouette facing={dir.id} size={48} />
          </div>
          <span className="text-[9px] text-amber-600 uppercase tracking-wider font-bold">{dir.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function LegacyKwamePage() {
  const [, navigate] = useLocation();
  const [activeAnim, setActiveAnim] = useState("idle");
  const [activeDirection, setActiveDirection] = useState<"down"|"left"|"right"|"up">("down");
  const [showFullRef, setShowFullRef] = useState(false);
  const [activeEvolution, setActiveEvolution] = useState(0);

  const currentMotion = activeAnim === "walk" ? "walk" : activeAnim === "run" ? "run" : "idle";

  return (
    <div
      className="min-h-[100dvh] text-amber-100"
      style={{ background: "radial-gradient(ellipse at top, #1a1308 0%, #0a0a06 80%)" }}
    >
      {/* ── Top Nav ── */}
      <div className="sticky top-0 z-30 bg-[#0e0b06]/90 backdrop-blur-sm border-b border-amber-900/30">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between">
          <button
            onClick={() => navigate("/legacy/demo")}
            className="flex items-center gap-2 text-amber-600 active:opacity-50"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Legacy</span>
          </button>
          <span className="text-[10px] font-black text-amber-500 uppercase tracking-[0.25em]">Character Sheet</span>
          <button
            onClick={() => navigate("/legacy/demo")}
            className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-500/30 rounded-lg px-3 py-1.5 text-xs text-amber-300 font-bold active:opacity-70"
          >
            Play Demo <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-16">

        {/* ── Hero — Character Portrait ── */}
        <div className="pt-5 mb-5">
          <div
            className="rounded-2xl border border-amber-700/30 overflow-hidden relative"
            style={{ background: "linear-gradient(135deg, #1A0F08 0%, #2A1A0A 60%, #1A1008 100%)" }}
          >
            {/* Portrait image — canonical master reference */}
            <div className="relative">
              <img
                src="/legacy-character-assets/kwame/kwame-master-reference.png"
                alt="Kwame Mensah — Canonical Master Reference Sheet"
                className="w-full object-cover object-top"
                style={{ maxHeight: 420, objectFit: "cover" }}
              />
              {/* Gradient fade */}
              <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-[#1A0F08] to-transparent" />
            </div>
            {/* Character identity badge */}
            <div className="px-4 pb-4 -mt-8 relative z-10">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[10px] font-black text-amber-600 uppercase tracking-[0.3em] mb-1">
                    Niakofa Legacy · Protagonist
                  </p>
                  <h1 className="text-3xl font-black text-amber-200 leading-none">Kwame Mensah</h1>
                  <p className="text-sm text-amber-500 mt-1">Age {KWAME.age} · {KWAME.year} · {KWAME.location}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full">
                    Alive
                  </span>
                  <span className="bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full">
                    Student
                  </span>
                </div>
              </div>
              <p className="text-xs text-amber-400/80 mt-2.5 leading-relaxed">{KWAME.bio}</p>
              {/* Traits */}
              <div className="flex gap-2 mt-3 flex-wrap">
                {KWAME.traits.map(t => (
                  <span key={t} className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="bg-[#1A0F08] border border-amber-700/30 rounded-2xl p-4 mb-4">
          <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Zap className="w-3 h-3" /> Character Stats — Chapter 1 Starting Values
          </p>
          <div className="space-y-2.5">
            {KWAME.stats.map(stat => (
              <div key={stat.key}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-amber-300 font-bold uppercase tracking-wider">{stat.label}</span>
                  <span className="text-xs text-amber-500 font-mono">{stat.value}/{stat.max}</span>
                </div>
                <div className={`h-1.5 rounded-full ${stat.track} overflow-hidden`}>
                  <div
                    className={`h-full rounded-full ${stat.color} transition-all`}
                    style={{ width: `${(stat.value / stat.max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          {/* Skills */}
          <div className="grid grid-cols-4 gap-2 mt-4">
            {KWAME.skills.map(skill => (
              <div key={skill.name} className="bg-amber-500/10 rounded-xl p-2 text-center border border-amber-700/20">
                <skill.icon className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                <p className="text-[9px] text-amber-300 font-bold uppercase">{skill.name}</p>
                <p className="text-[9px] text-amber-600 font-mono">Lv.{skill.level}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── 4-Direction Turnaround ── */}
        <div className="bg-[#1A0F08] border border-amber-700/30 rounded-2xl p-4 mb-4">
          <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Star className="w-3 h-3" /> 4-Direction Character Turnaround
          </p>
          <TurnaroundPanel />
          <p className="text-[10px] text-amber-700 text-center mt-3">
            Art style: Hand-drawn 2–2.5D · African anime-inspired · Aurion-quality target
          </p>
          {/* Interactive preview */}
          <div className="mt-4 border-t border-amber-800/30 pt-4">
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-3">
              Animation Preview
            </p>
            <div className="flex justify-center mb-4">
              <div
                className="w-24 h-24 bg-[#0e0b06] rounded-2xl border border-amber-700/30 flex items-end justify-center pb-2"
                style={{ boxShadow: "inset 0 0 20px rgba(139,90,43,0.1)" }}
              >
                <KwameSilhouette facing={activeDirection} motion={currentMotion} size={72} />
              </div>
            </div>
            {/* Direction selector */}
            <div className="flex justify-center gap-2 mb-3">
              {(["down","left","right","up"] as const).map(dir => (
                <button
                  key={dir}
                  onClick={() => setActiveDirection(dir)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase border transition-all ${
                    activeDirection === dir
                      ? "bg-amber-500/30 border-amber-500/60 text-amber-200"
                      : "bg-transparent border-amber-800/30 text-amber-600 active:opacity-70"
                  }`}
                >
                  {dir === "down" ? "↓" : dir === "up" ? "↑" : dir === "left" ? "←" : "→"} {dir}
                </button>
              ))}
            </div>
            {/* Animation selector */}
            <div className="flex flex-wrap justify-center gap-1.5">
              {KWAME.animations.map(anim => (
                <button
                  key={anim.id}
                  onClick={() => setActiveAnim(anim.id)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border transition-all ${
                    activeAnim === anim.id
                      ? "bg-amber-500/30 border-amber-500/60 text-amber-200"
                      : "bg-transparent border-amber-800/30 text-amber-600 active:opacity-70"
                  }`}
                >
                  {anim.label}
                </button>
              ))}
            </div>
            {/* Active animation info */}
            {KWAME.animations.find(a => a.id === activeAnim) && (
              <div className="mt-3 bg-amber-500/5 border border-amber-700/20 rounded-xl p-3 text-center">
                <p className="text-xs font-bold text-amber-300">
                  {KWAME.animations.find(a => a.id === activeAnim)!.label}
                </p>
                <p className="text-[10px] text-amber-500 mt-0.5">
                  {KWAME.animations.find(a => a.id === activeAnim)!.desc}
                </p>
                <p className="text-[9px] text-amber-700 font-mono mt-1">
                  {KWAME.animations.find(a => a.id === activeAnim)!.frames} frames ·{" "}
                  {KWAME.animations.find(a => a.id === activeAnim)!.fps} FPS
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Expressions ── */}
        <div className="bg-[#1A0F08] border border-amber-700/30 rounded-2xl p-4 mb-4">
          <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-3">
            Facial Expressions
          </p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {KWAME.expressions.map(exp => (
              <div key={exp.id} className="bg-[#0e0a05] border border-amber-800/20 rounded-xl p-2.5 text-center">
                <span className="text-2xl">{exp.emoji}</span>
                <p className="text-[9px] text-amber-500 mt-1 uppercase font-bold">{exp.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Color Palette ── */}
        <div className="bg-[#1A0F08] border border-amber-700/30 rounded-2xl p-4 mb-4">
          <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-3">
            Canonical Color Palette
          </p>
          <div className="flex flex-wrap gap-2">
            {KWAME.palette.map(swatch => (
              <div key={swatch.name} className="flex flex-col items-center gap-1">
                <div
                  className="w-10 h-10 rounded-lg border border-white/10 shadow-sm"
                  style={{ background: swatch.hex }}
                />
                <p className="text-[8px] text-amber-600 font-mono text-center leading-tight">
                  {swatch.name}<br />{swatch.hex}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Character Evolution Timeline ── */}
        <div className="bg-[#1A0F08] border border-amber-700/30 rounded-2xl p-4 mb-4">
          <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Clock className="w-3 h-3" /> Character Evolution System
          </p>
          <div className="space-y-2">
            {KWAME.evolution.map((stage, i) => (
              <button
                key={i}
                onClick={() => setActiveEvolution(i)}
                className={`w-full text-left border rounded-xl p-3 transition-all ${
                  activeEvolution === i
                    ? "bg-amber-500/15 border-amber-500/40"
                    : "bg-[#0e0a05] border-amber-800/20 active:opacity-70"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-black flex-shrink-0 ${
                      stage.active
                        ? "bg-amber-500 border-amber-400 text-black"
                        : "bg-amber-900/40 border-amber-700/30 text-amber-500"
                    }`}>
                      {stage.age}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-amber-200">{stage.era} · {stage.year}</p>
                      <p className="text-[10px] text-amber-500">{stage.desc}</p>
                    </div>
                  </div>
                  {stage.active && (
                    <span className="text-[9px] text-amber-400 font-bold uppercase bg-amber-500/10 px-1.5 py-0.5 rounded">
                      Current
                    </span>
                  )}
                </div>
                {activeEvolution === i && (
                  <p className="mt-2 text-[10px] text-amber-600 italic pl-10">{stage.clothing}</p>
                )}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-amber-700 mt-3 leading-relaxed">
            Each age stage carries different clothing, responsibilities, relationships, story knowledge,
            and gameplay abilities. The character system enables organic aging through the Legacy experience.
          </p>
        </div>

        {/* ── World Scale Reference ── */}
        <div className="bg-[#1A0F08] border border-amber-700/30 rounded-2xl p-4 mb-4">
          <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <MapPin className="w-3 h-3" /> World Scale Reference
          </p>
          <p className="text-[10px] text-amber-500 mb-3 leading-relaxed">
            Kwame is the <strong className="text-amber-300">calibration character</strong>. All environment
            scale, doorway height, furniture sizing, and camera framing derive from his canonical height.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(WORLD_SPEC).map(([key, val]) => (
              <div key={key} className="bg-[#0e0a05] border border-amber-800/20 rounded-lg p-2.5">
                <p className="text-[9px] text-amber-600 uppercase font-bold mb-0.5">
                  {key.replace(/([A-Z])/g, " $1").trim()}
                </p>
                <p className="text-xs text-amber-300 font-mono">{String(val)}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 border border-amber-700/20 rounded-xl p-3 bg-amber-500/5">
            <p className="text-[10px] text-amber-500 uppercase font-bold mb-1.5">Asset Validation Checklist</p>
            {["Walk behind it (foreground occlusion)", "Walk in front of it", "Be partially occluded",
              "Enter it (interior portal)", "Collide with it (collision box)",
              "Interact with it (interaction point)", "Cast a shadow near it"].map(check => (
              <div key={check} className="flex items-center gap-1.5 py-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                <span className="text-[10px] text-amber-600">Can Kwame {check}?</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Environment Journey ── */}
        <div className="bg-[#1A0F08] border border-amber-700/30 rounded-2xl p-4 mb-4">
          <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <MapPin className="w-3 h-3" /> Kwame's Journey — Chapter Locations
          </p>
          <div className="space-y-2">
            {KWAME.environments.map(env => (
              <div
                key={env.id}
                className="flex items-start gap-3 bg-[#0e0a05] border border-amber-800/20 rounded-xl p-3"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-700/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-black text-amber-500">CH{env.chapter}</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-amber-200">{env.label}</p>
                  <p className="text-[10px] text-amber-500">{env.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Environment Reference Images ── */}
        <div className="bg-[#1A0F08] border border-amber-700/30 rounded-2xl p-4 mb-4">
          <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-3">
            Environment Art Reference (Cape Coast 1912)
          </p>
          <img
            src="/legacy-environment-assets/niakofa-environment-assets-dark.png"
            alt="Niakofa Legacy Environment Assets — Hand-drawn 2.5D"
            className="w-full rounded-xl border border-amber-800/20"
          />
          <p className="text-[9px] text-amber-700 mt-2 text-center">
            Tile size: 64×64 px · Warm earth tones, rich greens, ocean blues
          </p>
        </div>

        {/* ── Full RPG Overview Reference ── */}
        <div className="bg-[#1A0F08] border border-amber-700/30 rounded-2xl overflow-hidden mb-4">
          <button
            className="w-full flex items-center justify-between px-4 py-3"
            onClick={() => setShowFullRef(!showFullRef)}
          >
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">
              Full RPG Overview Reference
            </p>
            <ChevronDown
              className={`w-4 h-4 text-amber-600 transition-transform ${showFullRef ? "rotate-180" : ""}`}
            />
          </button>
          {showFullRef && (
            <div className="px-4 pb-4">
              <img
                src="/legacy-character-assets/kwame/niakofa-rpg-overview.png"
                alt="Niakofa Legacy RPG — Full Overview Reference"
                className="w-full rounded-xl border border-amber-800/20"
              />
            </div>
          )}
        </div>

        {/* ── Technical Specs ── */}
        <div className="bg-[#1A0F08] border border-amber-700/30 rounded-2xl p-4 mb-4">
          <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-3">
            Technical Specifications
          </p>
          <div className="space-y-1.5">
            {[
              ["Game Type",       "2.5D Hand-Drawn RPG"],
              ["Art Style",       "African-inspired hand-drawn, Anime silhouettes"],
              ["Perspective",     "Semi-top-down 2.5D (Aurion-inspired)"],
              ["Build",           "Hand-Drawn 2D"],
              ["Animation",       "Frame-Based"],
              ["Resolution",      "1920×1080 HD"],
              ["Tile Size",       "64×64 px"],
              ["Char Scale",      "1.65m = 2.5 tiles"],
              ["Char Footprint",  "32×48 px"],
              ["Frame Rate",      "60 FPS target"],
              ["Anim FPS",        "12 FPS (12–24 px)"],
              ["Player Dirs",     "4 (8 later)"],
              ["Platforms",       "PC, Mobile, Web, Console"],
            ].map(([key, val]) => (
              <div key={key} className="flex items-baseline justify-between gap-2 py-0.5 border-b border-amber-900/20">
                <span className="text-[10px] text-amber-600">{key}</span>
                <span className="text-[10px] text-amber-300 font-mono text-right">{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Production Quality ── */}
        <div className="bg-gradient-to-br from-amber-900/30 to-[#1A0F08] border border-amber-500/30 rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Production Quality Target</p>
            <div className="flex items-center gap-1.5">
              <div className="w-24 h-1.5 bg-amber-900/40 rounded-full overflow-hidden">
                <div className="h-full w-[75%] bg-amber-500 rounded-full" />
              </div>
              <span className="text-xs font-black text-amber-300">75%</span>
            </div>
          </div>
          <p className="text-[10px] text-amber-500 leading-relaxed">
            Art direction, storytelling depth, and African cultural authenticity are strong.
            With full production — voice acting, orchestral music, and polish —
            <strong className="text-amber-300"> we will surpass Aurion.</strong>
          </p>
        </div>

        {/* ── CTA ── */}
        <div className="flex gap-3 pb-4">
          <button
            onClick={() => navigate("/legacy/demo")}
            className="flex-1 bg-amber-500 text-black rounded-xl py-3.5 font-black text-sm uppercase tracking-wider active:opacity-80 flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" /> Play Legacy Demo
          </button>
          <button
            onClick={() => navigate("/legacy")}
            className="flex-1 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl py-3.5 font-bold text-sm uppercase tracking-wider active:opacity-70 flex items-center justify-center gap-2"
          >
            <Users className="w-4 h-4" /> Legacy Hub
          </button>
        </div>

        {/* ── Footer ── */}
        <div className="text-center">
          <p className="text-[10px] text-amber-800 uppercase tracking-[0.25em]">
            Kwame Mensah · The Journey Begins · Your Family · Your Story · Your Legacy
          </p>
          <div className="mt-2 w-32 h-px bg-gradient-to-r from-transparent via-amber-700/40 to-transparent mx-auto" />
        </div>
      </div>
    </div>
  );
}
