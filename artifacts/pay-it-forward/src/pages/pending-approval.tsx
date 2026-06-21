import { Clock, ShieldCheck, XCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/lib/AppContext";
import { clearToken } from "@/lib/auth";
import { useTranslation } from "react-i18next";

/**
 * Shown instead of the normal app when a user's account is "pending" or
 * "denied" approval. Every API route is locked server-side (see
 * requireApproved in app.ts) regardless of what this screen shows, so this
 * is purely about explaining the state to the person, not enforcing it.
 */
export default function PendingApprovalScreen() {
  const { t } = useTranslation();
  const { currentUser, setCurrentUser } = useAppContext();
  const status = currentUser?.approval_status ?? "pending";
  const isDenied = status === "denied";

  const handleLogout = () => {
    clearToken();
    setCurrentUser(null);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 text-center">
      <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 border-2 ${
        isDenied ? "bg-destructive/10 border-destructive/30" : "bg-primary/10 border-primary/30"
      }`}>
        {isDenied ? (
          <XCircle className="w-10 h-10 text-destructive" />
        ) : (
          <Clock className="w-10 h-10 text-primary" />
        )}
      </div>

      <h1 className="text-2xl font-black mb-2">
        {isDenied ? t("pending_approval.not_approved_title") : t("pending_approval.under_review_title")}
      </h1>

      <p className="text-muted-foreground text-sm max-w-sm leading-relaxed mb-1">
        {isDenied
          ? t("pending_approval.not_approved_body")
          : t("pending_approval.under_review_body")}
      </p>

      {currentUser?.account_type && currentUser.account_type !== "individual" && (
        <p className="text-muted-foreground text-xs max-w-sm leading-relaxed mt-2 flex items-center gap-1.5 justify-center">
          <ShieldCheck className="w-3.5 h-3.5 text-primary" />
          {t("pending_approval.registered_as", { accountType: currentUser.account_type })}
          {currentUser.organization_name ? ` — ${currentUser.organization_name}` : ""}
        </p>
      )}

      {!isDenied && (
        <p className="text-muted-foreground text-xs max-w-sm mt-4">
          {t("pending_approval.wont_take_long")}
        </p>
      )}

      <Button
        variant="outline"
        onClick={handleLogout}
        className="mt-8 font-black text-xs"
      >
        <LogOut className="w-3.5 h-3.5 mr-1.5" />
        {t("pending_approval.sign_out")}
      </Button>
    </div>
  );
}
