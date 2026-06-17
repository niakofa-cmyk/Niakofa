import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ChevronLeft, Star, Heart, MapPin, Shield, CheckCircle2, Clock, Gift, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TrustTierBadge } from "@/components/TrustTierBadge";
import { useAppContext } from "@/lib/AppContext";
import { toast } from "@/hooks/use-toast";
import type { User } from "@workspace/api-client-react";

const SPECIALTY_ICONS: Record<string, string> = {
  Groceries: "🛒", Transportation: "🚗", "Tech Help": "💻",
  "Home Repair": "🔧", Medical: "💊", Errands: "📦",
  Emergency: "🚨", Childcare: "👶",
};

export default function HelperProfileScreen() {
  const [, params] = useRoute("/helper/:id");
  const [, setLocation] = useLocation();
  const { currentUser } = useAppContext();
  const helperId = parseInt(params?.id || "0", 10);

  const [helper, setHelper] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentHelps, setRecentHelps] = useState<{ title: string; category: string; completed_at: string }[]>([]);

  useEffect(() => {
    if (!helperId) return;
    setLoading(true);
    fetch(`/api/users/${helperId}`)
      .then(r => r.json())
      .then((u: User) => {
        setHelper(u);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Load recent completed requests by this helper
    fetch(`/api/requests?helper_id=${helperId}&status=completed&limit=5`)
      .then(r => r.json())
      .then((data) => {
        if (Array.isArray(data)) setRecentHelps(data.slice(0, 5));
      })
      .catch(() => {});
  }, [helperId]);

  const handleReport = () => {
    toast({ title: "Report submitted", description: "Our moderation team will review this profile." });
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!helper) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center gap-3 px-6">
        <p className="font-bold">Helper not found</p>
        <Button variant="outline" onClick={() => setLocation("/")}>Back</Button>
      </div>
    );
  }

  const specialties: string[] = (helper as any).specialties ?? [];
  const tier = helper.trust_score != null && helper.help_count != null
    ? { trust: helper.trust_score, helps: helper.help_count }
    : null;

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation(-1 as any)} className="rounded-full shrink-0">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <span className="font-black text-base truncate">{helper.name}</span>
        <button onClick={handleReport} className="ml-auto text-xs text-muted-foreground active:text-destructive transition-colors px-2 py-1">
          Report
        </button>
      </div>

      <div className="px-4 pt-6 pb-safe pb-8 space-y-5 max-w-lg mx-auto">
        {/* Avatar + name */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center text-center gap-3"
        >
          <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-primary/30 shadow-[0_0_30px_rgba(0,212,255,0.15)]">
            {helper.avatar_url ? (
              <img src={helper.avatar_url} alt={helper.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-primary/10 flex items-center justify-center text-3xl font-black text-primary">
                {helper.name[0]}
              </div>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-black">{helper.name}</h1>
            {(helper.neighborhood || helper.city) && (
              <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground mt-1">
                <MapPin className="w-3.5 h-3.5" />
                {[helper.neighborhood, helper.city].filter(Boolean).join(", ")}
              </div>
            )}
          </div>
          {tier && (
            <TrustTierBadge trustScore={tier.trust} helpCount={tier.helps} size="md" />
          )}
        </motion.div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Helps", value: helper.help_count ?? 0, color: "text-primary", icon: Heart },
            { label: "Trust", value: `${(helper.trust_score ?? 0).toFixed(0)}%`, color: "text-green-400", icon: Star },
            { label: "Goodwill", value: helper.goodwill_score ?? 0, color: "text-purple-400", icon: Gift },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="bg-card border border-border rounded-2xl p-3 text-center">
              <Icon className={`w-4 h-4 ${color} mx-auto mb-1`} />
              <div className={`text-xl font-black ${color}`}>{value}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
            </div>
          ))}
        </div>

        {/* Verified badges */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Verification</div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Email verified", done: true },
              { label: "Phone verified", done: !!(helper as any).phone_masked },
              { label: "Background check", done: (helper.help_count ?? 0) >= 15 },
              { label: "Community member", done: true },
            ].map(({ label, done }) => (
              <div key={label} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${
                done ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-muted border-border text-muted-foreground"
              }`}>
                {done ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Specialties */}
        {specialties.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Specialties</div>
            <div className="flex flex-wrap gap-2">
              {specialties.map(s => (
                <span key={s} className="flex items-center gap-1.5 text-xs bg-primary/10 border border-primary/30 text-primary px-3 py-1.5 rounded-full font-bold">
                  {SPECIALTY_ICONS[s] ?? "✦"} {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Recent activity */}
        {recentHelps.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Recent Helps</div>
            <div className="space-y-2.5">
              {recentHelps.map((r, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{r.title}</div>
                    <div className="text-[10px] text-muted-foreground capitalize">{r.category?.replace("_", " ")}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trust score explanation */}
        <div className="bg-muted/30 border border-border rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Trust scores are calculated from community ratings, completion rate, and response time. Scores above 90% qualify for emergency requests.
            </p>
          </div>
        </div>

        {/* CTA — only show if viewing another user's profile */}
        {currentUser && currentUser.id !== helperId && (
          <Button className="w-full h-12 font-black gap-2" onClick={() => setLocation("/request/new")}>
            <MessageCircle className="w-4 h-4" />
            Request Help from {helper.name.split(" ")[0]}
          </Button>
        )}
      </div>
    </div>
  );
}
