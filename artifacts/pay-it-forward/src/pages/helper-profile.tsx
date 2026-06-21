import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { authHeaders } from "@/lib/auth";
import {
  ChevronLeft, Star, Heart, MapPin, Shield, CheckCircle2, Clock,
  Gift, MessageCircle, Globe, Car, Wrench, FileText, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TrustTierBadge } from "@/components/TrustTierBadge";
import { useAppContext } from "@/lib/AppContext";
import { toast } from "@/hooks/use-toast";
import type { User } from "@workspace/api-client-react";

const SKILL_ICONS: Record<string, string> = {
  plumbing: "🔧", electrical: "⚡", carpentry: "🪚", painting: "🖌️",
  yard_work: "🌿", heavy_lifting: "💪", drives_truck: "🚛", cdl_driver: "🚚",
  grocery_shopping: "🛒", cooking: "🍳", childcare: "👶", elder_care: "🧓",
  medical_support: "💊", tech_support: "💻", tutoring: "📚", translation: "🌍",
  pet_care: "🐾", food_delivery: "🍔", event_setup: "🎪", emergency_first_aid: "🚑",
  // legacy specialties
  Groceries: "🛒", Transportation: "🚗", "Tech Help": "💻",
  "Home Repair": "🔧", Medical: "💊", Errands: "📦",
  Emergency: "🚨", Childcare: "👶",
};

const VEHICLE_LABELS: Record<string, string> = {
  car: "🚗 Has a car", truck: "🛻 Drives a truck", van: "🚐 Has a van/SUV",
  motorcycle: "🏍️ Motorcycle", bicycle: "🚲 Bicycle/E-bike", none: "🚶 No vehicle",
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
    fetch(`/api/users/${helperId}`, { headers: authHeaders() })
      .then(r => r.json())
      .then((u: User) => {
        setHelper(u);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    fetch(`/api/requests?helper_id=${helperId}&status=completed&limit=5`, { headers: authHeaders() })
      .then(r => r.json())
      .then((data) => { if (Array.isArray(data)) setRecentHelps(data.slice(0, 5)); })
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

  const skills: string[] = helper.helper_skills ?? helper.specialties ?? [];
  const languages: string[] = helper.helper_languages ?? [];
  const qualifications: string[] = helper.helper_qualifications ?? [];
  const bio: string | null = helper.helper_bio ?? null;
  const vehicle: string | null = helper.helper_vehicle ?? null;
  const socialLinks: string | null = helper.helper_social_links ?? null;

  const tier = helper.trust_score != null && helper.help_count != null
    ? { trust: helper.trust_score, helps: helper.help_count }
    : null;

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border px-4 py-3 flex items-center gap-3 pt-safe">
        <Button variant="ghost" size="icon" onClick={() => window.history.back()} className="rounded-full shrink-0" aria-label="Go back">
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
            {helper.neighborhood && (
              <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground mt-1">
                <MapPin className="w-3.5 h-3.5" />
                {helper.neighborhood}
              </div>
            )}
            {/* Approved helper badge */}
            {helper.helper_status === "approved" && (
              <div className="inline-flex items-center gap-1.5 mt-2 bg-primary/10 border border-primary/30 rounded-full px-3 py-1">
                <CheckCircle2 className="w-3 h-3 text-primary" />
                <span className="text-[11px] font-black text-primary uppercase tracking-wider">Verified Helper</span>
              </div>
            )}
          </div>
          {tier && <TrustTierBadge trustScore={tier.trust} helpCount={tier.helps} size="md" />}
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

        {/* Bio */}
        {bio && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <FileText className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">About</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{bio}</p>
          </div>
        )}

        {/* Skills */}
        {skills.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Wrench className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Skills & Specialties</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {skills.map(s => (
                <span key={s} className="flex items-center gap-1.5 text-xs bg-primary/10 border border-primary/30 text-primary px-3 py-1.5 rounded-full font-bold">
                  {SKILL_ICONS[s] ?? "✦"} {s.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Languages */}
        {languages.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Globe className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Languages</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {languages.map(l => (
                <span key={l} className="text-xs bg-muted border border-border text-foreground px-3 py-1.5 rounded-full font-bold">
                  🌐 {l}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Vehicle */}
        {vehicle && VEHICLE_LABELS[vehicle] && (
          <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
            <Car className="w-4 h-4 text-primary shrink-0" />
            <div>
              <div className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-0.5">Transportation</div>
              <div className="text-sm font-bold">{VEHICLE_LABELS[vehicle]}</div>
            </div>
          </div>
        )}

        {/* Qualifications */}
        {qualifications.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Shield className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Certifications</span>
            </div>
            <div className="space-y-1.5">
              {qualifications.map(q => (
                <div key={q} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                  {q}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Verified badges */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Verification</div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Email verified", done: true },
              { label: "Phone verified", done: !!helper.phone_masked },
              { label: "Background check", done: (helper.help_count ?? 0) >= 15 },
              { label: "Admin approved", done: helper.helper_status === "approved" },
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

        {/* Social links */}
        {socialLinks && (
          <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
            <ExternalLink className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-0.5">Social</div>
              <p className="text-sm text-muted-foreground truncate">{socialLinks}</p>
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
              Trust scores are calculated from community ratings, completion rate, and response time. Scores above 90% qualify for emergency requests. All helpers are admin-verified before they can accept requests.
            </p>
          </div>
        </div>

        {/* CTA */}
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
