import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, MapPin, Bell, Shield, Sparkles, ChevronRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/lib/AppContext";
import { subscribeToPush } from "@/lib/push";
import { useTranslation } from "react-i18next";

interface Step {
  id: string;
  icon: typeof Heart;
  title: string;
  description: string;
  color: string;
  action?: string;
}

const STEPS: Step[] = [
  {
    id: "welcome",
    icon: Heart,
    title: "Welcome to Niakofa",
    description: "A community platform where neighbors help neighbors. Request help, offer help, and pay it forward when you're able.",
    color: "text-primary",
    action: "Get Started",
  },
  {
    id: "location",
    icon: MapPin,
    title: "Enable Location",
    description: "Niakofa uses your location to show nearby requests and helpers. Your exact location is never shared publicly.",
    color: "text-yellow-400",
    action: "Allow Location",
  },
  {
    id: "notifications",
    icon: Bell,
    title: "Stay Notified",
    description: "Get instant alerts when someone nearby needs help, or when a helper accepts your request.",
    color: "text-green-400",
    action: "Enable Notifications",
  },
  {
    id: "nia",
    icon: Sparkles,
    title: "Meet Nia",
    description: "Nia is your personal Niakofa community assistant. Ask her anything — how to request help, how to become a helper, or anything about the community.",
    color: "text-primary",
    action: "Say Hi to Nia",
  },
  {
    id: "trust",
    icon: Shield,
    title: "Community Trust",
    description: "Niakofa uses a trust tier system. The more you help, the higher your tier — unlocking emergency requests and community recognition.",
    color: "text-purple-400",
    action: "I Understand",
  },
];

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { currentUser, openNia } = useAppContext();
  const [step, setStep] = useState(0);
  const [locationGranted, setLocationGranted] = useState(false);
  const [notifGranted, setNotifGranted] = useState(false);
  const [loading, setLoading] = useState(false);
  const current = STEPS[step];

  const handleAction = async () => {
    setLoading(true);

    if (current.id === "location") {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          () => setLocationGranted(true),
          () => setLocationGranted(false),
          { timeout: 5000 }
        );
      }
    }

    if (current.id === "nia") {
      setLoading(false);
      openNia();
      return;
    }

    if (current.id === "notifications" && currentUser) {
      try {
        await subscribeToPush(currentUser.id);
        setNotifGranted(true);
      } catch {}
    }

    setLoading(false);

    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      localStorage.setItem("niakofa_onboarded", "1");
      setLocation("/");
    }
  };

  const skip = () => {
    localStorage.setItem("niakofa_onboarded", "1");
    setLocation("/");
  };

  const Icon = current.icon;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Progress dots */}
      <div className="flex justify-center gap-2 pt-safe pt-6 pb-2">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === step ? "w-8 bg-primary" : i < step ? "w-4 bg-primary/50" : "w-4 bg-muted"
            }`}
          />
        ))}
      </div>

      {/* Skip */}
      <div className="flex justify-end px-4">
        <button onClick={skip} className="text-xs text-muted-foreground px-3 py-2 active:text-foreground transition-colors">
          {t("onboarding.skip")}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="flex flex-col items-center text-center"
          >
            <div className={`w-24 h-24 rounded-full bg-card border-2 border-border flex items-center justify-center mb-8 shadow-lg`}>
              <Icon className={`w-12 h-12 ${current.color}`} />
            </div>

            <h2 className="text-2xl font-black mb-4 leading-tight">{current.title}</h2>
            <p className="text-muted-foreground leading-relaxed max-w-xs">{current.description}</p>

            {/* Permission granted indicator */}
            {current.id === "location" && locationGranted && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-2 mt-4 text-green-400 text-sm font-bold"
              >
                <Check className="w-4 h-4" /> {t("onboarding.location_enabled")}
              </motion.div>
            )}
            {current.id === "notifications" && notifGranted && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-2 mt-4 text-green-400 text-sm font-bold"
              >
                <Check className="w-4 h-4" /> {t("onboarding.notifications_enabled")}
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom CTA */}
      <div className="px-6 pb-safe pb-8 space-y-3">
        <Button
          className="w-full h-14 font-black text-base gap-2"
          onClick={handleAction}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              {current.action}
              <ChevronRight className="w-5 h-5" />
            </>
          )}
        </Button>
        {(current.id === "location" || current.id === "notifications") && (
          <button
            onClick={() => setStep(s => s + 1)}
            className="w-full text-sm text-muted-foreground py-2 active:text-foreground transition-colors"
          >
            {t("onboarding.not_now")}
          </button>
        )}
      </div>
    </div>
  );
}
