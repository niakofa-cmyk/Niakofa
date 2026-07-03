import { useState } from "react";
import { Clock, ShieldCheck, XCircle, LogOut, Mail, MessageCircle, RefreshCw, AlertCircle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/lib/AppContext";
import { clearToken } from "@/lib/auth";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";

/**
 * Shown instead of the normal app when a user's account is "pending" or
 * "denied" approval. Every API route is locked server-side (see
 * requireApproved in app.ts) regardless of what this screen shows, so this
 * is purely about explaining the state to the person, not enforcing it.
 */
export default function PendingApprovalScreen() {
  const { t } = useTranslation();
  const { currentUser, setCurrentUser } = useAppContext();
  const [checking, setChecking] = useState(false);
  const [showNiaPrompt, setShowNiaPrompt] = useState(false);

  // approval_status, account_type, organization_name are extended fields not yet
  // in the generated User OpenAPI type — cast to access them safely
  const extUser = currentUser as (typeof currentUser & {
    approval_status?: string;
    account_type?: string;
    organization_name?: string;
    email?: string;
    name?: string;
  }) | null;

  const status = extUser?.approval_status ?? "pending";
  const isDenied = status === "denied";
  const accountType = extUser?.account_type ?? "individual";
  const orgName = extUser?.organization_name ?? "";

  const handleLogout = () => {
    clearToken();
    setCurrentUser(null);
  };

  // Re-check approval status — helpful after admin acts
  const recheckStatus = async () => {
    setChecking(true);
    try {
      const r = await fetch("/api/users/me", {
        headers: { Authorization: `Bearer ${localStorage.getItem("niakofa_token") ?? ""}` },
      });
      if (r.ok) {
        const u = await r.json();
        setCurrentUser(u);
        localStorage.setItem("niakofa_user", JSON.stringify(u));
      }
    } catch {}
    setChecking(false);
  };

  // Contact support via email
  const contactSupport = () => {
    const subject = isDenied
      ? `Appeal — ${accountType} account for ${orgName || (extUser?.name ?? "my account")}`
      : `Question about my pending ${accountType} account`;
    const body = isDenied
      ? `Hi Niakofa team,\n\nI would like to appeal the decision on my ${accountType} account.\n\nAccount: ${extUser?.email ?? ""}\nOrganization: ${orgName}\n\nAdditional context:\n`
      : `Hi Niakofa team,\n\nI have a question about my pending ${accountType} account.\n\nAccount: ${extUser?.email ?? ""}\nOrganization: ${orgName}\n\nMy question:\n`;
    window.open(`mailto:support@niakofa.app?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_self");
  };

  // Expected review time based on account type
  const reviewTimeline =
    accountType === "business" ? "1–3 business days"
    : accountType === "sponsor" ? "2–5 business days"
    : accountType === "organization" ? "2–4 business days"
    : "1–2 business days";

  const NIA_PROMPTS = isDenied
    ? ["Why was my account denied?", "How do I appeal?", "Can I re-apply?"]
    : ["What happens during review?", "How long does approval take?", "What can I do while I wait?"];

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-5"
      >
        {/* Icon */}
        <div className="flex justify-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center border-2 ${
            isDenied ? "bg-destructive/10 border-destructive/30" : "bg-primary/10 border-primary/30"
          }`}>
            {isDenied
              ? <XCircle className="w-10 h-10 text-destructive" />
              : <Clock className="w-10 h-10 text-primary animate-pulse" />
            }
          </div>
        </div>

        {/* Headline */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-black">
            {isDenied
              ? t("pending_approval.not_approved_title", { defaultValue: "Account Not Approved" })
              : t("pending_approval.under_review_title", { defaultValue: "Account Under Review" })
            }
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {isDenied
              ? t("pending_approval.not_approved_body", { defaultValue: "Your account application was not approved at this time. You can contact us to learn more or appeal the decision." })
              : t("pending_approval.under_review_body", { defaultValue: "Your account is being reviewed by the Niakofa team. We verify all non-individual accounts to keep the community safe." })
            }
          </p>
        </div>

        {/* Account info pill */}
        {accountType !== "individual" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-xl px-4 py-3 justify-center">
            <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="capitalize font-semibold">{accountType}</span>
            {orgName && <span>· {orgName}</span>}
          </div>
        )}

        {/* Timeline — only for pending */}
        {!isDenied && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-primary">
              <Clock className="w-3.5 h-3.5" />
              Expected review: {reviewTimeline}
            </div>
            <div className="space-y-1.5">
              {[
                { label: "Identity & documents verified", done: false },
                { label: "Community standards reviewed", done: false },
                { label: "Account activated", done: false },
              ].map(({ label, done }) => (
                <div key={label} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                    done ? "bg-green-500 border-green-500" : "border-muted-foreground/40"
                  }`}>
                    {done && <ChevronRight className="w-2 h-2 text-white" />}
                  </div>
                  {label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Denied: appeal info */}
        {isDenied && (
          <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Common reasons: incomplete documents, service area restrictions, or community guideline conflicts.
                Contact us to understand the decision — appeals are reviewed within 5 business days.
              </p>
            </div>
          </div>
        )}

        {/* Nia quick prompts */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-black text-foreground">Ask Nia a question</span>
          </div>
          <div className="flex flex-col gap-2">
            {NIA_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => setShowNiaPrompt(true)}
                className="text-left text-[11px] text-muted-foreground bg-muted/40 rounded-xl px-3 py-2 active:bg-muted font-medium"
              >
                {prompt}
              </button>
            ))}
          </div>
          {showNiaPrompt && (
            <p className="text-[10px] text-muted-foreground bg-primary/5 rounded-xl px-3 py-2 border border-primary/10">
              Nia is available once your account is approved. In the meantime, contact our support team — we respond within 24 hours.
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          {/* Re-check status */}
          <button
            onClick={recheckStatus}
            disabled={checking}
            style={{ touchAction: "manipulation" }}
            className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-primary text-primary-foreground font-black text-sm active:opacity-80 disabled:opacity-50"
          >
            {checking
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Checking…</>
              : <><RefreshCw className="w-4 h-4" /> Check My Status</>
            }
          </button>

          {/* Contact support */}
          <button
            onClick={contactSupport}
            style={{ touchAction: "manipulation" }}
            className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl border border-border bg-card text-sm font-black active:bg-muted"
          >
            <Mail className="w-4 h-4" />
            {isDenied ? "Appeal Decision" : "Contact Support"}
          </button>

          {/* Sign out */}
          <button
            onClick={handleLogout}
            style={{ touchAction: "manipulation" }}
            className="w-full flex items-center justify-center gap-2 h-10 rounded-2xl text-muted-foreground text-xs font-bold active:bg-muted"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-muted-foreground">
          support@niakofa.app · We respond within 24 hours
        </p>
      </motion.div>
    </div>
  );
}
