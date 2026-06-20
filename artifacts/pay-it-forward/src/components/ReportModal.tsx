import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flag, X, AlertTriangle, ChevronRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";

type ReportType =
  | "suspicious_request"
  | "suspicious_helper"
  | "fraud"
  | "harassment"
  | "fake_profile"
  | "dangerous_behavior"
  | "spam"
  | "other";

interface ReportOption {
  type: ReportType;
  label: string;
  description: string;
  icon: string;
  severity: "high" | "medium" | "low";
}

const REPORT_OPTIONS: ReportOption[] = [
  { type: "dangerous_behavior", label: "Dangerous behavior", description: "Physical threat, unsafe situation, or risk of harm", icon: "🚨", severity: "high" },
  { type: "harassment", label: "Harassment or abuse", description: "Threatening messages, intimidation, or personal attacks", icon: "⚠️", severity: "high" },
  { type: "fraud", label: "Fraud or scam", description: "Fake payment, stolen goods, or financial deception", icon: "💸", severity: "high" },
  { type: "suspicious_helper", label: "Suspicious helper", description: "Helper behaving oddly, not who they claim to be", icon: "👤", severity: "medium" },
  { type: "suspicious_request", label: "Suspicious request", description: "Request seems fake, dangerous, or doesn't add up", icon: "📋", severity: "medium" },
  { type: "fake_profile", label: "Fake or stolen profile", description: "Profile photo or details appear stolen or fabricated", icon: "🎭", severity: "medium" },
  { type: "spam", label: "Spam or bot", description: "Automated or repetitive fake activity", icon: "🤖", severity: "low" },
  { type: "other", label: "Other concern", description: "Something else that doesn't fit above", icon: "🏴", severity: "low" },
];

interface Props {
  reportedUserId?: number;
  reportedRequestId?: number;
  reportedName?: string;
  onClose: () => void;
}

export function ReportModal({ reportedUserId, reportedRequestId, reportedName, onClose }: Props) {
  const { currentUser } = useAppContext();
  const [step, setStep] = useState<"type" | "details" | "done">("type");
  const [selectedType, setSelectedType] = useState<ReportType | null>(null);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedOption = REPORT_OPTIONS.find(o => o.type === selectedType);

  const handleSubmit = async () => {
    if (!currentUser || !selectedType || description.trim().length < 10) {
      toast({ title: "Please describe the issue (at least 10 characters)", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        reporter_id: currentUser.id,
        type: selectedType,
        description: description.trim(),
      };
      if (reportedUserId) body.reported_user_id = reportedUserId;
      if (reportedRequestId) body.reported_request_id = reportedRequestId;

      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 429) {
          toast({
            title: "Too many reports",
            description: "You've filed 5 reports today. Please wait 24 hours.",
            variant: "destructive",
          });
        } else {
          toast({ title: err.error ?? "Failed to submit report", variant: "destructive" });
        }
        return;
      }

      setStep("done");
    } catch {
      toast({ title: "Network error — please try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/75 z-[80] backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 220 }}
        className="fixed inset-x-4 bottom-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-md z-[80]"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="px-5 py-4 flex items-center justify-between border-b border-border bg-orange-500/5">
            <div className="flex items-center gap-2 font-black text-sm">
              <Flag className="w-4 h-4 text-orange-400" />
              {step === "done" ? "Report Submitted" : "Report a Concern"}
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Step: type selection */}
          {step === "type" && (
            <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
              {reportedName && (
                <p className="text-xs text-muted-foreground mb-3 px-1">
                  Reporting: <span className="text-foreground font-semibold">{reportedName}</span>
                </p>
              )}
              {REPORT_OPTIONS.map(opt => (
                <button
                  key={opt.type}
                  onClick={() => { setSelectedType(opt.type); setStep("details"); }}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border transition-all text-left hover:border-orange-500/50 ${
                    opt.severity === "high"
                      ? "border-destructive/20 bg-destructive/5 hover:bg-destructive/10"
                      : "border-border bg-card/50 hover:bg-muted/50"
                  }`}
                >
                  <span className="text-xl shrink-0">{opt.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold">{opt.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{opt.description}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* Step: details */}
          {step === "details" && selectedOption && (
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-xl">{selectedOption.icon}</span>
                <span className="font-bold">{selectedOption.label}</span>
              </div>

              {selectedOption.severity === "high" && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/30">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive leading-relaxed">
                    If you are in immediate danger, call 911 or use the SOS button on the map screen.
                  </p>
                </div>
              )}

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">
                  Describe what happened
                </label>
                <Textarea
                  placeholder="Please describe what you observed. Include any relevant details — the more specific, the faster our team can review and take action."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="min-h-[120px] resize-none text-sm"
                  maxLength={2000}
                />
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-muted-foreground">Minimum 10 characters</span>
                  <span className="text-[10px] text-muted-foreground">{description.length}/2000</span>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setStep("type"); setDescription(""); }}
                >
                  Back
                </Button>
                <Button
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                  disabled={description.trim().length < 10 || loading}
                  onClick={handleSubmit}
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : "Submit Report"}
                </Button>
              </div>

              <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
                Reports are reviewed by the Niakofa safety team within 24 hours. False reports may result in account action.
              </p>
            </div>
          )}

          {/* Step: done */}
          {step === "done" && (
            <div className="p-6 text-center space-y-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", delay: 0.1 }}
                className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center mx-auto"
              >
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </motion.div>
              <div>
                <div className="font-black text-base">Report Received</div>
                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                  Our safety team will review your report within 24 hours. Thank you for helping keep Niakofa safe for everyone.
                </p>
              </div>
              <Button className="w-full" onClick={onClose}>Done</Button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
