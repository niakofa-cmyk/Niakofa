/**
 * HelperOnboardingScreen — Phase 11G
 *
 * Multi-step flow for users who want to become helpers:
 *  Step 1 — Skills Quiz: pick skills from categorized list
 *  Step 2 — Availability Picker: set weekly recurring windows
 *  Step 3 — Background Check: status display + initiation CTA
 *  Step 4 — Bio & Submit: short bio + submit helper application
 *
 * Wires to:
 *  PATCH /api/users/:id/helper-application  (skills, bio, languages, vehicle)
 *  POST  /api/users/:id/availability        (weekly windows)
 */
import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight, ChevronLeft, Check, Loader2, Shield,
  Clock, FileText, Wrench, Star, Calendar, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";

// ── Constants ─────────────────────────────────────────────────────────────────

const SKILL_GROUPS = [
  {
    label: "Home & Repairs",
    skills: ["plumbing", "electrical", "carpentry", "painting", "yard_work", "heavy_lifting"],
  },
  {
    label: "Transportation",
    skills: ["drives_truck", "cdl_driver", "food_delivery"],
  },
  {
    label: "Care & Support",
    skills: ["childcare", "elder_care", "medical_support", "emergency_first_aid", "pet_care"],
  },
  {
    label: "Errands & Community",
    skills: ["grocery_shopping", "cooking", "event_setup", "translation", "tutoring"],
  },
  {
    label: "Technology",
    skills: ["tech_support"],
  },
];

const SKILL_LABELS: Record<string, string> = {
  plumbing: "🔧 Plumbing", electrical: "⚡ Electrical", carpentry: "🪚 Carpentry",
  painting: "🎨 Painting", yard_work: "🌿 Yard Work", heavy_lifting: "💪 Heavy Lifting",
  drives_truck: "🚛 Drives Truck", cdl_driver: "🚚 CDL Driver", food_delivery: "🛵 Food Delivery",
  childcare: "👶 Childcare", elder_care: "👴 Elder Care", medical_support: "🏥 Medical Support",
  emergency_first_aid: "🚑 First Aid", pet_care: "🐾 Pet Care",
  grocery_shopping: "🛒 Grocery Shopping", cooking: "🍳 Cooking", event_setup: "🎪 Event Setup",
  translation: "🌐 Translation", tutoring: "📚 Tutoring", tech_support: "💻 Tech Support",
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TIME_SLOTS = [
  { label: "Morning (6am–12pm)", start: 360, end: 720 },
  { label: "Afternoon (12pm–6pm)", start: 720, end: 1080 },
  { label: "Evening (6pm–10pm)", start: 1080, end: 1320 },
];

const BG_CHECK_STATUS_INFO: Record<string, { label: string; color: string; icon: string; desc: string }> = {
  not_started: { label: "Not Started", color: "text-muted-foreground", icon: "○", desc: "Start a background check to build trust with requesters. It only takes a few minutes." },
  pending:     { label: "In Progress", color: "text-amber-400",          icon: "◑", desc: "Your background check is being processed. This usually takes 1–3 business days." },
  passed:      { label: "Passed ✓",    color: "text-green-400",          icon: "●", desc: "Your background check has passed. Requesters can see you're verified." },
  failed:      { label: "Not Passed",  color: "text-destructive",        icon: "✕", desc: "Your background check did not pass. You can still help with goodwill requests." },
};

interface AvailabilitySlot { day: number; start: number; end: number; }

// ── Step components ───────────────────────────────────────────────────────────

function SkillsStep({
  selected, onToggle,
}: { selected: Set<string>; onToggle: (s: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="text-center space-y-1 mb-2">
        <Wrench className="w-8 h-8 text-primary mx-auto" />
        <h2 className="text-lg font-black text-foreground">What can you help with?</h2>
        <p className="text-xs text-muted-foreground">Pick all that apply — this helps match you to relevant requests.</p>
      </div>
      {SKILL_GROUPS.map(group => (
        <div key={group.label}>
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-2">{group.label}</p>
          <div className="flex flex-wrap gap-2">
            {group.skills.map(skill => {
              const active = selected.has(skill);
              return (
                <button
                  key={skill}
                  type="button"
                  onClick={() => onToggle(skill)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-all ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {SKILL_LABELS[skill] ?? skill}
                  {active && <Check className="inline w-3 h-3 ml-1" />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function AvailabilityStep({
  slots, onToggle,
}: { slots: AvailabilitySlot[]; onToggle: (slot: AvailabilitySlot) => void }) {
  const isActive = (day: number, start: number) =>
    slots.some(s => s.day === day && s.start === start);

  return (
    <div className="space-y-4">
      <div className="text-center space-y-1 mb-2">
        <Calendar className="w-8 h-8 text-primary mx-auto" />
        <h2 className="text-lg font-black text-foreground">When are you available?</h2>
        <p className="text-xs text-muted-foreground">Tap the blocks when you're typically free. You can always update this later.</p>
      </div>
      <div className="overflow-x-auto -mx-2 px-2">
        <table className="w-full text-[10px]">
          <thead>
            <tr>
              <th className="text-left text-muted-foreground font-medium pb-2 w-28"></th>
              {DAYS.map(d => (
                <th key={d} className="text-center text-muted-foreground font-black pb-2">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIME_SLOTS.map(slot => (
              <tr key={slot.start}>
                <td className="text-muted-foreground pr-2 py-1 align-middle leading-tight">{slot.label}</td>
                {DAYS.map((_, dayIdx) => {
                  const active = isActive(dayIdx, slot.start);
                  return (
                    <td key={dayIdx} className="text-center py-1">
                      <button
                        type="button"
                        onClick={() => onToggle({ day: dayIdx, start: slot.start, end: slot.end })}
                        className={`w-7 h-7 rounded-md border transition-all ${
                          active
                            ? "bg-primary border-primary"
                            : "bg-card border-border hover:border-primary/50"
                        }`}
                        aria-label={`${DAYS[dayIdx]} ${slot.label} ${active ? "selected" : "not selected"}`}
                        aria-pressed={active}
                      >
                        {active && <Check className="w-3 h-3 text-white mx-auto" />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground text-center">
        {slots.length === 0
          ? "No windows selected — you can still help anytime, this just helps with matching."
          : `${slots.length} window${slots.length !== 1 ? "s" : ""} selected`}
      </p>
    </div>
  );
}

function BackgroundCheckStep({ status }: { status: string }) {
  const info = BG_CHECK_STATUS_INFO[status] ?? BG_CHECK_STATUS_INFO["not_started"];
  return (
    <div className="space-y-4">
      <div className="text-center space-y-1 mb-2">
        <Shield className="w-8 h-8 text-primary mx-auto" />
        <h2 className="text-lg font-black text-foreground">Background Check</h2>
        <p className="text-xs text-muted-foreground">Optional but highly recommended — builds trust with requesters.</p>
      </div>
      <div className="bg-card border border-border rounded-2xl p-5 text-center space-y-3">
        <div className={`text-3xl font-black ${info.color}`}>{info.icon}</div>
        <div className={`text-base font-black ${info.color}`}>{info.label}</div>
        <p className="text-xs text-muted-foreground leading-relaxed">{info.desc}</p>
        {status === "not_started" && (
          <a
            href="https://checkr.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground font-bold text-sm px-5 py-2.5 rounded-xl"
          >
            <Shield className="w-4 h-4" /> Start Background Check
          </a>
        )}
        {status === "pending" && (
          <div className="flex items-center justify-center gap-2 text-xs text-amber-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing…
          </div>
        )}
        {status === "passed" && (
          <div className="inline-flex items-center gap-1.5 bg-green-500/10 text-green-400 border border-green-500/20 text-xs font-bold px-4 py-2 rounded-full">
            <Check className="w-3.5 h-3.5" /> Verified Helper
          </div>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground text-center">
        You can skip this step and complete it later from your profile.
      </p>
    </div>
  );
}

function BioStep({
  bio, onChange,
}: { bio: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="text-center space-y-1 mb-2">
        <FileText className="w-8 h-8 text-primary mx-auto" />
        <h2 className="text-lg font-black text-foreground">Tell the community about yourself</h2>
        <p className="text-xs text-muted-foreground">A short bio helps requesters feel comfortable asking for your help.</p>
      </div>
      <textarea
        value={bio}
        onChange={e => onChange(e.target.value)}
        placeholder="e.g. I'm a retired teacher with a truck. Happy to help with groceries, rides, or home repairs in the Southside area."
        className="w-full h-32 bg-card border border-border rounded-xl p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
        maxLength={400}
      />
      <p className="text-[10px] text-muted-foreground text-right">{bio.length}/400</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HelperOnboardingScreen() {
  const [, setLocation] = useLocation();
  const { currentUser } = useAppContext();

  // ── All hooks MUST be declared before any conditional return (Rules of Hooks) ──
  const [step, setStep] = useState(0);
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(
    new Set((currentUser as unknown)?.helper_skills ?? [])
  );
  const [availSlots, setAvailSlots] = useState<AvailabilitySlot[]>([]);
  const [bio, setBio] = useState((currentUser as unknown)?.helper_bio ?? "");
  const [saving, setSaving] = useState(false);

  const toggleSkill = useCallback((s: string) => {
    setSelectedSkills(prev => {
      const next = new Set(prev);
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  }, []);

  const toggleSlot = useCallback((slot: AvailabilitySlot) => {
    setAvailSlots(prev => {
      const exists = prev.findIndex(s => s.day === slot.day && s.start === slot.start);
      return exists >= 0 ? prev.filter((_, i) => i !== exists) : [...prev, slot];
    });
  }, []);

  const bgStatus = (currentUser as unknown)?.background_check_status ?? "not_started";
  const helperStatus = (currentUser as unknown)?.helper_status as string | undefined;

  const STEPS = [
    { id: "skills",       label: "Skills",       icon: Wrench },
    { id: "availability", label: "Availability", icon: Clock },
    { id: "background",   label: "Background",   icon: Shield },
    { id: "bio",          label: "Bio",          icon: FileText },
  ];

  // ── Duplicate submission guard (AFTER all hooks) ───────────────────────────
  // If this user already has a pending or approved helper application,
  // show a confirmation screen rather than letting them submit again.
  if (helperStatus === "pending" || helperStatus === "approved") {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-6 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center">
          <Check className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-xl font-black text-foreground">
          {helperStatus === "approved" ? "You're already a Helper!" : "Application Submitted"}
        </h1>
        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
          {helperStatus === "approved"
            ? "Your helper profile is active. You can update your skills and availability from your profile page."
            : "Your helper application is under review. We'll notify you once it's approved — usually within 1–2 business days."
          }
        </p>
        <Button onClick={() => setLocation("/profile")} className="font-black">
          {helperStatus === "approved" ? "View My Profile" : "Back to Profile"}
        </Button>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!currentUser?.id) return;
    setSaving(true);
    try {
      // 1. Submit helper application (skills + bio)
      const appRes = await fetch(`/api/users/${currentUser.id}/helper-application`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          helper_skills: Array.from(selectedSkills),
          helper_bio: bio.trim() || null,
          helper_languages: [],
          helper_qualifications: [],
        }),
      });
      if (!appRes.ok) throw new Error("Failed to submit application");

      // 2. Save availability windows
      if (availSlots.length > 0) {
        await fetch(`/api/users/${currentUser.id}/availability`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            windows: availSlots.map(s => ({
              day_of_week: s.day,
              start_min: s.start,
              end_min: s.end,
            })),
          }),
        });
      }

      toast({ title: "Application submitted! 🎉", description: "We'll review it and notify you shortly." });
      setLocation("/profile");
    } catch (_err) {
      toast({ title: "Something went wrong", description: "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Step validation:
  //   Step 0 (Skills): require at least one skill
  //   Step 1 (Availability): soft — warn but allow advancing (can set later)
  //   Step 2 (Background Check): informational only — always allow advance
  //   Step 3 (Bio): require at least 20 chars for a meaningful intro
  const canAdvance =
    step === 0 ? selectedSkills.size > 0
    : step === 3 ? bio.trim().length >= 20
    : true;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-12 pb-4">
        <button
          onClick={() => step === 0 ? setLocation("/profile") : setStep(s => s - 1)}
          className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center"
        >
          <ChevronLeft className="w-4 h-4 text-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-black text-foreground">Become a Helper</h1>
          <p className="text-[11px] text-muted-foreground">Step {step + 1} of {STEPS.length}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 mb-6">
        <div className="h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <div className="flex justify-between mt-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className={`text-[9px] font-bold uppercase tracking-wider ${i <= step ? "text-primary" : "text-muted-foreground"}`}>
              {s.label}
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {step === 0 && <SkillsStep selected={selectedSkills} onToggle={toggleSkill} />}
            {step === 1 && <AvailabilityStep slots={availSlots} onToggle={toggleSlot} />}
            {step === 2 && <BackgroundCheckStep status={bgStatus} />}
            {step === 3 && <BioStep bio={bio} onChange={setBio} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer CTA */}
      <div className="px-4 pb-8 pt-4 border-t border-border bg-background space-y-3">
        {/* Contextual validation hints */}
        {step === 0 && selectedSkills.size === 0 && (
          <div className="flex items-center gap-2 text-[11px] text-yellow-400">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Select at least one skill to continue
          </div>
        )}
        {step === 1 && availSlots.length === 0 && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            No slots selected — you can add availability later from your profile
          </div>
        )}
        {step === 3 && bio.trim().length > 0 && bio.trim().length < 20 && (
          <div className="flex items-center gap-2 text-[11px] text-yellow-400">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Bio needs at least 20 characters — tell the community a bit more about yourself
          </div>
        )}
        {step === 3 && bio.trim().length === 0 && (
          <div className="flex items-center gap-2 text-[11px] text-yellow-400">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            A short bio helps requesters feel comfortable — required to submit
          </div>
        )}

        {step < STEPS.length - 1 ? (
          <Button
            onClick={() => setStep(s => s + 1)}
            disabled={!canAdvance}
            className="w-full h-12 rounded-xl font-black text-sm"
          >
            Continue <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={saving || selectedSkills.size === 0 || !canAdvance}
            className="w-full h-12 rounded-xl font-black text-sm"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Star className="w-4 h-4 mr-2" />}
            {saving ? "Submitting…" : "Submit Helper Application"}
          </Button>
        )}
        {/* Skip only for non-required steps (not skills step 0, not bio step 3) */}
        {step > 0 && step < STEPS.length - 1 && (
          <button
            onClick={() => setStep(s => s + 1)}
            className="w-full text-center text-xs text-muted-foreground py-1 active:opacity-70"
          >
            Skip this step
          </button>
        )}
      </div>
    </div>
  );
}
