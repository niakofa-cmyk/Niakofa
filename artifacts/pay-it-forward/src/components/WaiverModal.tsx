/**
 * WaiverModal — Liability & ToS waiver for high-risk request categories.
 *
 * Shown before a requester can post a childcare, senior_care, medical,
 * home_repair, or moving_labor request. The user must explicitly scroll
 * through the ToS and check each acknowledgment before posting.
 *
 * Acceptance is persisted server-side via POST /users/me/accept-tos so
 * returning users only see this once per ToS version.
 */

import { useState, useRef } from "react";
import { X, AlertTriangle, CheckCircle2, Shield, Loader2 } from "lucide-react";

export const CURRENT_TOS_VERSION = "2026-07";

// Categories that require the waiver — must stay in sync with
// SENSITIVE_CATEGORIES in lib/trust-tiers/src/index.ts.
// Both lists gate helpers (server-side claim check) and requesters (UI consent flow).
export const WAIVER_CATEGORIES = [
  "childcare", "senior_care", "medical", "home_repair", "moving_labor",
  "pet_care", "tutoring", "legal_aid", "mental_health_peer",
] as const;

export type WaiverCategory = typeof WAIVER_CATEGORIES[number];

const CATEGORY_LABELS: Record<WaiverCategory, string> = {
  childcare: "Childcare",
  senior_care: "Senior Care",
  medical: "Medical Assistance",
  home_repair: "Home Repair",
  moving_labor: "Moving Labor",
  pet_care: "Pet Care",
  tutoring: "Tutoring / Academic Help",
  legal_aid: "Legal Aid",
  mental_health_peer: "Peer Support / Mental Health",
};

const CATEGORY_RISKS: Record<WaiverCategory, string> = {
  childcare:
    "involves the care of minor children and carries responsibilities under Texas Family Code. " +
    "You are solely responsible for confirming the helper meets any state or local childcare requirements.",
  senior_care:
    "involves assistance to elderly or disabled adults and may intersect with Texas Adult Protective Services regulations. " +
    "You are solely responsible for the safety of the person receiving care.",
  medical:
    "involves health-related assistance. Niakofa helpers are community volunteers, not licensed medical providers. " +
    "Do not use this platform for emergencies — call 911. Never rely on a Niakofa helper for medical advice or treatment.",
  home_repair:
    "involves work on real property. You accept full responsibility for any property damage, injuries, or permit requirements. " +
    "Verify that the helper has appropriate skills before work begins.",
  moving_labor:
    "involves physical labor and the handling of personal property. " +
    "You accept all risk of damage or injury and should not offer this task for antiques, heirlooms, or fragile items without special agreement.",
  pet_care:
    "involves the care of animals in or around your home. You accept full responsibility for any injuries to the helper, " +
    "damage caused by the animal, or loss of the animal. Niakofa is not a licensed veterinary or pet-care service.",
  tutoring:
    "may involve one-on-one contact with a minor. You are solely responsible for supervising any session " +
    "involving a child under 18. Niakofa does not run background checks on every helper — " +
    "verify the helper's identity and credentials before arranging unsupervised contact.",
  legal_aid:
    "involves lay community volunteers providing general information — not licensed legal advice. " +
    "Nothing shared through Niakofa constitutes attorney-client privilege or legal representation. " +
    "For any legal matter with real consequences, consult a licensed Texas attorney.",
  mental_health_peer:
    "involves community peer support, not licensed counseling or therapy. Niakofa volunteers are not " +
    "mental health professionals. If you or someone else is in crisis, call 988 (Suicide & Crisis Lifeline) " +
    "or 911 immediately — do not rely on this platform for emergency mental health response.",
};

interface WaiverModalProps {
  category: WaiverCategory;
  onAccept: () => void;
  onClose: () => void;
  isSubmitting?: boolean;
}

export function WaiverModal({ category, onAccept, onClose, isSubmitting }: WaiverModalProps) {
  const [checks, setChecks] = useState({
    notProvider: false,
    ownRisk: false,
    noVetting: false,
    giftNotLoan: false,
  });
  const [hasScrolled, setHasScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const allChecked = Object.values(checks).every(Boolean);
  const canAccept = allChecked && hasScrolled;

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      setHasScrolled(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-background border border-border rounded-t-3xl shadow-2xl flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-400 shrink-0" />
            <h2 className="font-black text-base">
              {CATEGORY_LABELS[category]} — Community Agreement
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-2 shrink-0">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
            <div className="flex gap-2 items-start">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-300 leading-relaxed">
                This request <span className="font-bold">{CATEGORY_RISKS[category]}</span>
                {" "}Please read this agreement carefully before continuing.
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable ToS body */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-5 py-3 space-y-4 text-xs text-muted-foreground leading-relaxed"
        >
          <section>
            <h3 className="text-sm font-bold text-foreground mb-1">1. Niakofa Is a Community Network — Not a Licensed Provider</h3>
            <p>
              Niakofa is a volunteer-based mutual-aid platform operated for the benefit of Tarrant County
              neighbors. It is <strong className="text-foreground">not a licensed childcare agency, home health agency, medical
              staffing company, general contractor, or moving company</strong> under Texas or federal law.
            </p>
            <p className="mt-2">
              Niakofa does not employ, background-check (unless you specifically request and pass the optional
              check), license, insure, bond, supervise, or otherwise certify any helper. Helpers are independent
              community volunteers who choose to assist neighbors on a goodwill basis.
            </p>
          </section>

          <section>
            <h3 className="text-sm font-bold text-foreground mb-1">2. Your Sole Responsibility</h3>
            <p>
              By posting this request, you accept <strong className="text-foreground">full and exclusive responsibility</strong> for:
            </p>
            <ul className="list-disc list-inside mt-1 space-y-1 ml-2">
              <li>Independently vetting any helper before granting them access to your home, family member, or property.</li>
              <li>Verifying that the helper holds any licenses, permits, or certifications required by Texas law for the specific task.</li>
              <li>All outcomes — including property damage, personal injury, or failure to complete the task — that arise from the help you receive.</li>
              <li>Any applicable insurance, permits, or regulatory compliance for the work being performed.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-sm font-bold text-foreground mb-1">3. No Warranties or Guarantees</h3>
            <p>
              Niakofa makes no warranty — express, implied, or statutory — regarding the skill, reliability,
              sobriety, criminal history, or fitness of any helper. Helper profiles, trust scores, and
              reviews reflect community activity only and are not professional endorsements.
            </p>
            <p className="mt-2">
              The "Trusted Helper" badge and related tiers indicate relative platform experience, not
              professional licensure or government certification of any kind.
            </p>
          </section>

          <section>
            <h3 className="text-sm font-bold text-foreground mb-1">4. Limitation of Liability</h3>
            <p>
              To the maximum extent permitted by Texas law, Niakofa, its operators, officers, and volunteers
              shall not be liable for any direct, indirect, incidental, consequential, or special damages
              arising out of or relating to your use of the platform or any service arranged through it —
              including but not limited to personal injury, property damage, emotional distress, or financial loss.
            </p>
          </section>

          <section>
            <h3 className="text-sm font-bold text-foreground mb-1">5. Pay-It-Forward = Community Gift, Not a Debt</h3>
            <p>
              If you select "Pay It Forward" as your payment type, any pledge you make is a
              <strong className="text-foreground"> voluntary community gift</strong> — not a legally enforceable loan or contract.
              Niakofa does not charge interest, report to credit bureaus, or take legal action to collect
              PIF pledges. Defaulting on a pledge affects only your community trust score.
            </p>
          </section>

          <section>
            <h3 className="text-sm font-bold text-foreground mb-1">6. Emergency Situations</h3>
            <p>
              <strong className="text-foreground">Do not use Niakofa for medical emergencies.</strong>{" "}
              If someone's life is in danger, call 911 immediately. Niakofa is not a substitute for
              emergency medical services, law enforcement, or crisis intervention.
            </p>
          </section>

          <section>
            <h3 className="text-sm font-bold text-foreground mb-1">7. Governing Law</h3>
            <p>
              This agreement is governed by the laws of the State of Texas, without regard to conflict-of-law
              principles. Any dispute shall be resolved in Tarrant County, Texas.
            </p>
          </section>

          <p className="text-[10px] text-muted-foreground/50 pt-2">
            Version {CURRENT_TOS_VERSION} · Last updated July 2026 ·{" "}
            <em>Note: This agreement was drafted as a community platform disclaimer and does not constitute legal advice.
            Niakofa recommends consulting a licensed Texas attorney before using this platform for regulated activities.</em>
          </p>
        </div>

        {/* Acknowledgment checkboxes */}
        <div className="px-5 py-3 space-y-2.5 shrink-0 border-t border-border">
          {!hasScrolled && (
            <p className="text-[11px] text-amber-400 text-center pb-1">
              ↑ Scroll to read the full agreement before accepting
            </p>
          )}

          {([
            ["notProvider", "I understand Niakofa is NOT a licensed service provider and helpers are community volunteers."],
            ["ownRisk", "I accept full responsibility for vetting the helper and for all outcomes of this request."],
            ["noVetting", "I know Niakofa does not guarantee a helper's qualifications, background, or fitness for this task."],
            ["giftNotLoan", "I understand any Pay-It-Forward pledge is a voluntary gift, not a legally enforceable debt."],
          ] as [keyof typeof checks, string][]).map(([key, label]) => (
            <label key={key} className="flex gap-2.5 items-start cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 w-4 h-4 accent-primary rounded shrink-0"
                checked={checks[key]}
                onChange={(e) => setChecks((p) => ({ ...p, [key]: e.target.checked }))}
              />
              <span className={`text-xs leading-snug ${checks[key] ? "text-foreground" : "text-muted-foreground"}`}>
                {label}
              </span>
            </label>
          ))}
        </div>

        {/* Accept button */}
        <div className="px-5 pb-6 pt-2 shrink-0">
          <button
            onClick={onAccept}
            disabled={!canAccept || isSubmitting}
            className="w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed bg-primary text-primary-foreground flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            I Agree — Post Request
          </button>
          {!canAccept && (
            <p className="text-[11px] text-muted-foreground text-center mt-2">
              {!hasScrolled
                ? "Scroll through the agreement, then check all boxes to continue."
                : "Check all boxes above to continue."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
