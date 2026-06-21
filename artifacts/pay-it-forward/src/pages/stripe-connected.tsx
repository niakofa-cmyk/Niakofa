import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { CheckCircle2, DollarSign, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/lib/AppContext";
import { useTranslation } from "react-i18next";

export default function StripeConnectedScreen() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { currentUser } = useAppContext();
  const [status, setStatus] = useState<"loading" | "success" | "pending">("loading");

  useEffect(() => {
    if (!currentUser?.id) { setStatus("pending"); return; }
    fetch(`/api/stripe/connect/status/${currentUser.id}`)
      .then(r => r.json())
      .then(data => {
        setStatus(data.payoutsEnabled ? "success" : "pending");
      })
      .catch(() => setStatus("pending"));
  }, [currentUser?.id]);

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-6">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="flex flex-col items-center text-center max-w-sm"
      >
        {status === "loading" && (
          <Loader2 className="w-16 h-16 text-primary animate-spin mb-6" />
        )}

        {status === "success" && (
          <>
            <div className="w-24 h-24 rounded-full bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(34,197,94,0.15)]">
              <CheckCircle2 className="w-12 h-12 text-green-400" />
            </div>
            <h1 className="text-2xl font-black mb-3">{t("stripe_connected.payouts_enabled")}</h1>
            <p className="text-muted-foreground leading-relaxed mb-8">
              {t("stripe_connected.payouts_enabled_body")}
            </p>
            <div className="w-full bg-card border border-border rounded-2xl p-4 mb-6 text-left space-y-2">
              {[
                t("stripe_connected.benefit_automatic"),
                t("stripe_connected.benefit_fee"),
                t("stripe_connected.benefit_arrival"),
              ].map(item => (
                <div key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                  <span className="text-sm text-muted-foreground">{item}</span>
                </div>
              ))}
            </div>
            <Button className="w-full h-12 font-black gap-2" onClick={() => setLocation("/wallet")}>
              <DollarSign className="w-4 h-4" />
              {t("stripe_connected.view_wallet")}
            </Button>
          </>
        )}

        {status === "pending" && (
          <>
            <div className="w-24 h-24 rounded-full bg-yellow-500/10 border-2 border-yellow-500/30 flex items-center justify-center mb-6">
              <DollarSign className="w-12 h-12 text-yellow-400" />
            </div>
            <h1 className="text-2xl font-black mb-3">{t("stripe_connected.almost_there")}</h1>
            <p className="text-muted-foreground leading-relaxed mb-8">
              {t("stripe_connected.almost_there_body")}
            </p>
            <Button className="w-full h-12 font-black gap-2" onClick={() => setLocation("/wallet")}>
              {t("stripe_connected.back_to_wallet")}
              <ChevronRight className="w-4 h-4" />
            </Button>
          </>
        )}
      </motion.div>
    </div>
  );
}
