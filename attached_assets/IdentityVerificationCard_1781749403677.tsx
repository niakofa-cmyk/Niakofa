import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, CheckCircle2, Clock, X, ChevronRight, Camera, FileText, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/lib/AppContext";
import { toast } from "@/hooks/use-toast";

interface VerificationStatus {
  identity_verified: boolean;
  identity_verification_status: string;
  background_check_status: string;
}

export function IdentityVerificationCard() {
  const { currentUser } = useAppContext();
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPanicContacts, setShowPanicContacts] = useState(false);
  const [contacts, setContacts] = useState(["", "", ""]);

  useEffect(() => {
    if (!currentUser?.id) return;
    fetch(`/api/users/${currentUser.id}`)
      .then(r => r.json())
      .then(u => setStatus({
        identity_verified: u.identity_verified ?? false,
        identity_verification_status: u.identity_verification_status ?? "unverified",
        background_check_status: u.background_check_status ?? "not_started",
      }))
      .catch(() => {});
  }, [currentUser?.id]);

  const startVerification = async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      const res = await fetch("/api/verification/identity/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: currentUser.id }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({ title: data.error ?? "Verification unavailable", variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  const savePanicContacts = async () => {
    if (!currentUser?.id) return;
    const filled = contacts.filter(c => c.trim());
    await fetch(`/api/verification/panic-contacts/${currentUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts: filled }),
    });
    toast({ title: `${filled.length} emergency contact${filled.length !== 1 ? "s" : ""} saved` });
    setShowPanicContacts(false);
  };

  const isVerified = status?.identity_verified;
  const isPending = status?.identity_verification_status === "pending";
  const isFailed = status?.identity_verification_status === "failed";

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Shield className="w-4 h-4 text-primary" />
        <span className="font-black text-sm">Trust & Safety</span>
        {isVerified && (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" /> Verified
          </span>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* ID Verification */}
        <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
          isVerified ? "bg-green-500/5 border-green-500/20" :
          isPending ? "bg-yellow-500/5 border-yellow-500/20" :
          isFailed ? "bg-destructive/5 border-destructive/20" :
          "bg-muted/50 border-border"
        }`}>
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
            isVerified ? "bg-green-500/20" : isPending ? "bg-yellow-500/20" : "bg-muted"
          }`}>
            {isVerified ? <CheckCircle2 className="w-4 h-4 text-green-400" /> :
             isPending ? <Clock className="w-4 h-4 text-yellow-400 animate-pulse" /> :
             isFailed ? <AlertTriangle className="w-4 h-4 text-destructive" /> :
             <Camera className="w-4 h-4 text-muted-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-black text-sm">Photo ID Verification</div>
            <div className="text-[10px] text-muted-foreground">
              {isVerified ? "Identity confirmed — trusted helper status unlocked" :
               isPending ? "Under review — usually takes a few minutes" :
               isFailed ? "Verification failed — please try again" :
               "Verify your identity to unlock elite helper status"}
            </div>
          </div>
          {!isVerified && !isPending && (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 h-8 text-xs font-bold"
              onClick={startVerification}
              disabled={loading}
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Verify"}
            </Button>
          )}
        </div>

        {/* Background Check */}
        <div className="flex items-center gap-3 p-3 rounded-xl border bg-muted/50 border-border">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-black text-sm">Background Check</div>
            <div className="text-[10px] text-muted-foreground">
              {status?.background_check_status === "completed"
                ? "Background check passed"
                : "Available for Elite helpers (30+ helps)"}
            </div>
          </div>
          {(currentUser?.help_count ?? 0) >= 30 && status?.background_check_status !== "completed" && (
            <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full shrink-0">
              Eligible
            </span>
          )}
        </div>

        {/* Panic Contacts */}
        <button
          onClick={() => setShowPanicContacts(p => !p)}
          className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/30 active:bg-muted transition-all"
        >
          <div className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-destructive" />
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="font-black text-sm">Emergency Contacts</div>
            <div className="text-[10px] text-muted-foreground">Notified if you activate SOS</div>
          </div>
          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${showPanicContacts ? "rotate-90" : ""}`} />
        </button>

        {/* Panic contacts form */}
        <AnimatePresence>
          {showPanicContacts && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-2 pt-1">
                {contacts.map((c, i) => (
                  <input
                    key={i}
                    type="tel"
                    placeholder={`Contact ${i + 1} phone number`}
                    value={c}
                    onChange={e => setContacts(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                    className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary transition-all"
                  />
                ))}
                <Button className="w-full h-10 font-black text-sm" onClick={savePanicContacts}>
                  Save Emergency Contacts
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
