import { Clock, ShieldCheck, XCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/lib/AppContext";
import { clearToken } from "@/lib/auth";

/**
 * Shown instead of the normal app when a user's account is "pending" or
 * "denied" approval. Every API route is locked server-side (see
 * requireApproved in app.ts) regardless of what this screen shows, so this
 * is purely about explaining the state to the person, not enforcing it.
 */
export default function PendingApprovalScreen() {
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
        {isDenied ? "Application Not Approved" : "Application Under Review"}
      </h1>

      <p className="text-muted-foreground text-sm max-w-sm leading-relaxed mb-1">
        {isDenied
          ? "Your account application wasn't approved at this time."
          : "Thanks for signing up! Every new account — individuals, businesses, and sponsors alike — is reviewed by our team before getting access to Niakofa."}
      </p>

      {currentUser?.account_type && currentUser.account_type !== "individual" && (
        <p className="text-muted-foreground text-xs max-w-sm leading-relaxed mt-2 flex items-center gap-1.5 justify-center">
          <ShieldCheck className="w-3.5 h-3.5 text-primary" />
          Registered as a {currentUser.account_type} account
          {currentUser.organization_name ? ` — ${currentUser.organization_name}` : ""}
        </p>
      )}

      {!isDenied && (
        <p className="text-muted-foreground text-xs max-w-sm mt-4">
          This usually doesn't take long. We'll notify you the moment a decision is made.
        </p>
      )}

      <Button
        variant="outline"
        onClick={handleLogout}
        className="mt-8 font-black text-xs"
      >
        <LogOut className="w-3.5 h-3.5 mr-1.5" />
        Sign out
      </Button>
    </div>
  );
}
