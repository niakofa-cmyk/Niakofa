/**
 * Diaspora Dashboard — Hub for all Diaspora & Family features
 * Route: /diaspora
 *
 * Enhancements:
 *  - Locale-aware subtitle ("Building our legacy in Fort Worth, TX and beyond.")
 *  - Activity feed supports thumbnail images
 *  - "Our Legacy Lives On" promotional banner before the Mission Footer
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  BookHeart, Mic, TreePine, Dna, Library, GraduationCap,
  Layers, Clock, Users, ChevronRight, Star, Sparkles,
  ScrollText, Globe, History, MessageSquare, ArrowRight,
  Loader2, Heart,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "sonner";

interface DashboardStats {
  family_spaces: number;
  vault_items: number;
  oral_histories: number;
  family_tree_people: number;
  dna_connections: number;
  heritage_collections: number;
}

interface ActivityItem {
  type: string;
  title: string;
  time: string;
  family_id: number;
  memory_id?: number;
  thumbnail_url?: string;
  media_type?: string;
}

const FEATURE_CARDS = [
  { key: "family", icon: BookHeart, label: "Family Vault", subLabel: "Memories & Photos", href: "/family", color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/20" },
  { key: "tree", icon: TreePine, label: "Family Tree", subLabel: "Ancestors & Kin", href: "/diaspora/tree", color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20" },
  { key: "oral", icon: Mic, label: "Oral Histories", subLabel: "Record & Preserve", href: "/family", color: "text-red-400", bg: "bg-red-400/10", border: "border-red-400/20" },
  { key: "dna", icon: Dna, label: "DNA Connections", subLabel: "Find Your Kin", href: "/diaspora/dna", color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20" },
  { key: "heritage", icon: Library, label: "Heritage Collections", subLabel: "Explore Culture", href: "/diaspora/heritage", color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/20" },
  { key: "research", icon: GraduationCap, label: "Research Center", subLabel: "Guides & Records", href: "/diaspora/research", color: "text-teal-400", bg: "bg-teal-400/10", border: "border-teal-400/20" },
  { key: "preserve", icon: Layers, label: "Preserve the Culture", subLabel: "Card Game & Stories", href: "/diaspora/preserve", color: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/20" },
  { key: "timeline", icon: History, label: "Legacy Timeline", subLabel: "Your Family Story", href: "/diaspora/timeline", color: "text-rose-400", bg: "bg-rose-400/10", border: "border-rose-400/20" },
] as const;

function relativeTime(isoString: string): string {
  const diff = (Date.now() - new Date(isoString).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function DiasporaDashboardPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [niaMessage, setNiaMessage] = useState("");
  const [niaChatInput, setNiaChatInput] = useState("");

  useEffect(() => {
    if (!currentUser) return;
    loadDashboard();
  }, [currentUser]);

  async function loadDashboard() {
    setLoading(true);
    try {
      const [dashRes, actRes] = await Promise.all([
        fetch("/api/diaspora/dashboard", { headers: authHeaders() }),
        fetch("/api/diaspora/activity", { headers: authHeaders() }),
      ]);
      if (dashRes.ok) {
        const data = await dashRes.json();
        setStats(data.stats);
      }
      if (actRes.ok) {
        const data = await actRes.json();
        setActivity(data.activities ?? []);
      }
    } catch {
      toast.error("Couldn't load Diaspora Dashboard");
    } finally {
      setLoading(false);
    }
  }

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Sign in to access your Diaspora Dashboard</p>
      </div>
    );
  }

  const displayName = currentUser.display_name ?? currentUser.username ?? "Welcome";
  const locale = (currentUser as Record<string, unknown>).city as string | undefined
    || (currentUser as Record<string, unknown>).locale as string | undefined
    || "Fort Worth, TX";

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Hero Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#1a0e00] via-[#2a1500] to-[#1a0e00] border-b border-amber-800/30">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-600/10 via-transparent to-transparent" />
        <div className="relative max-w-lg mx-auto px-4 pt-12 pb-8">
          <p className="text-amber-400/70 text-sm font-medium mb-1">Welcome back,</p>
          <h1 className="text-2xl font-bold text-amber-100 mb-2">{displayName}</h1>
          <p className="text-amber-400/60 text-xs">
            Building our legacy in {locale} and beyond.
          </p>

          {loading ? (
            <div className="flex items-center gap-2 mt-4">
              <Loader2 className="w-4 h-4 animate-spin text-amber-400/60" />
              <span className="text-xs text-amber-400/60">Loading your legacy…</span>
            </div>
          ) : stats ? (
            <div className="mt-5 grid grid-cols-3 gap-2">
              {[
                { label: "Family Spaces", value: stats.family_spaces, href: "/family" },
                { label: "Vault Items", value: stats.vault_items, href: "/family" },
                { label: "Oral Histories", value: stats.oral_histories, href: "/family" },
              ].map(s => (
                <button
                  key={s.label}
                  onClick={() => navigate(s.href)}
                  className="bg-amber-400/10 border border-amber-400/20 rounded-xl p-3 text-center active:opacity-70"
                >
                  <p className="text-xl font-bold text-amber-300">{s.value}</p>
                  <p className="text-xs text-amber-400/60 mt-0.5 leading-tight">{s.label}</p>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-6">
        {/* Quick Access Grid */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Quick Access</h2>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {FEATURE_CARDS.map(card => {
              const Icon = card.icon;
              const statValue = card.key === "family" ? stats?.family_spaces
                : card.key === "oral" ? stats?.oral_histories
                : card.key === "tree" ? stats?.family_tree_people
                : card.key === "dna" ? stats?.dna_connections
                : card.key === "heritage" ? stats?.heritage_collections
                : null;
              return (
                <button
                  key={card.key}
                  onClick={() => navigate(card.href)}
                  className={`flex items-center gap-3 p-3.5 rounded-2xl border ${card.bg} ${card.border} active:opacity-70 text-left`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${card.bg}`}>
                    <Icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold ${card.color} truncate`}>{card.label}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {statValue != null ? `${statValue} ${card.subLabel.split(" ")[0].toLowerCase()}` : card.subLabel}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Recent Activity */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Recent Activity</h2>
            <button onClick={() => navigate("/family")} className="text-xs text-primary flex items-center gap-0.5">
              View All <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : activity.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-2">
              <Clock className="w-8 h-8 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">No recent activity yet</p>
              <button
                onClick={() => navigate("/family")}
                className="text-xs text-primary font-medium"
              >
                Start preserving memories →
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {activity.slice(0, 5).map((a, i) => (
                <button
                  key={i}
                  onClick={() => a.memory_id ? navigate(`/family/${a.family_id}/memory/${a.memory_id}`) : navigate(`/family/${a.family_id}`)}
                  className="w-full flex items-center gap-3 p-3 bg-card border border-border rounded-xl active:opacity-70 text-left"
                >
                  {a.thumbnail_url ? (
                    <img
                      src={a.thumbnail_url}
                      alt=""
                      className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      {a.type === "oral_history" ? (
                        <Mic className="w-4 h-4 text-primary" />
                      ) : (
                        <BookHeart className="w-4 h-4 text-primary" />
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{relativeTime(a.time)}</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </section>

        {/* DNA Connections Preview */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">DNA Connections</h2>
            <button onClick={() => navigate("/diaspora/dna")} className="text-xs text-primary flex items-center gap-0.5">
              View <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <button
            onClick={() => navigate("/diaspora/dna")}
            className="w-full bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-2xl p-5 text-left active:opacity-70"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Dna className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="font-semibold text-sm">Discover Your Connections</p>
                <p className="text-xs text-muted-foreground">Import DNA data from AncestryDNA, 23andMe & more</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {["AncestryDNA", "23andMe", "MyHeritage"].map(p => (
                <div key={p} className="bg-blue-500/5 rounded-lg py-2 px-1">
                  <p className="text-xs font-medium text-blue-400">{p}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-blue-400 mt-3 font-medium text-center">
              Connect DNA → Find African diaspora relatives →
            </p>
          </button>
        </section>

        {/* Heritage Collections Preview */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Heritage Collections</h2>
            <button onClick={() => navigate("/diaspora/heritage")} className="text-xs text-primary flex items-center gap-0.5">
              Explore <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Great Migration", icon: Globe, color: "text-amber-400", bg: "bg-amber-400/10", slug: "great-migration" },
              { label: "Black Cowboys", icon: Star, color: "text-yellow-400", bg: "bg-yellow-400/10", slug: "black-cowboys" },
              { label: "Civil Rights", icon: Sparkles, color: "text-purple-400", bg: "bg-purple-400/10", slug: "civil-rights" },
              { label: "Family Recipes", icon: ScrollText, color: "text-orange-400", bg: "bg-orange-400/10", slug: "family-recipes" },
            ].map(c => {
              const Icon = c.icon;
              return (
                <button
                  key={c.slug}
                  onClick={() => navigate("/diaspora/heritage")}
                  className={`flex items-center gap-2 p-3 rounded-xl border ${c.bg} ${c.color} border-border/50 active:opacity-70`}
                >
                  <Icon className={`w-4 h-4 ${c.color} flex-shrink-0`} />
                  <span className={`text-xs font-medium ${c.color} leading-tight`}>{c.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Preserve the Culture Preview */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Preserve the Culture</h2>
            <button onClick={() => navigate("/diaspora/preserve")} className="text-xs text-primary flex items-center gap-0.5">
              Play <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <button
            onClick={() => navigate("/diaspora/preserve")}
            className="w-full bg-gradient-to-br from-orange-500/10 via-amber-500/5 to-transparent border border-orange-500/20 rounded-2xl p-5 text-left active:opacity-70"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                <Layers className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <p className="font-semibold text-sm">Card Game & Stories</p>
                <p className="text-xs text-muted-foreground">8 conversation starter cards</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Use the card game to spark conversations about your family's history.
              Each card links directly to a story in your Family Vault.
            </p>
          </button>
        </section>

        {/* Research Center Preview */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Research Center</h2>
            <button onClick={() => navigate("/diaspora/research")} className="text-xs text-primary flex items-center gap-0.5">
              Start Research <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            {[
              { title: "Freedmen's Bureau Records", desc: "Find records of formerly enslaved ancestors", icon: ScrollText },
              { title: "Census Records Guide", desc: "Step-by-step US census research tips", icon: BookHeart },
              { title: "Land Records", desc: "Historic land ownership & deeds", icon: Globe },
            ].map(g => {
              const Icon = g.icon;
              return (
                <button
                  key={g.title}
                  onClick={() => navigate("/diaspora/research")}
                  className="w-full flex items-center gap-3 p-3 bg-card border border-border rounded-xl active:opacity-70 text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-teal-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{g.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{g.desc}</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </section>

        {/* Our Legacy Lives On Banner */}
        <section>
          <div className="rounded-2xl bg-gradient-to-br from-amber-600/20 via-rose-600/10 to-amber-900/20 border border-amber-500/30 p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Heart className="w-5 h-5 text-rose-400" />
              <h2 className="text-lg font-bold text-amber-200">Our Legacy Lives On</h2>
            </div>
            <p className="text-sm text-amber-100/80 leading-relaxed mb-4 max-w-sm mx-auto">
              Every photo you preserve, every story you record, every connection you make —
              ensures that future generations will know where they came from and who they are.
            </p>
            <button
              onClick={() => navigate("/family")}
              className="bg-amber-500 text-amber-950 px-6 py-2.5 rounded-xl text-sm font-bold active:opacity-80"
            >
              Start Preserving Today
            </button>
          </div>
        </section>

        {/* Nia AI Assistant Panel */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Nia AI Assistant</h2>
          </div>
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Nia</p>
                <p className="text-xs text-muted-foreground">Your AI assistant for family history</p>
                {niaMessage ? (
                  <div className="mt-2 bg-background/60 rounded-xl p-3">
                    <p className="text-sm text-foreground whitespace-pre-wrap">{niaMessage}</p>
                  </div>
                ) : (
                  <div className="mt-2 space-y-1">
                    {[
                      "Nia, who were my ancestors in Alabama?",
                      "Help me find Freedmen's Bureau records",
                      "What questions should I ask my grandmother?",
                    ].map(prompt => (
                      <button
                        key={prompt}
                        onClick={() => setNiaChatInput(prompt)}
                        className="block text-xs text-primary/70 hover:text-primary transition-colors text-left"
                      >
                        · {prompt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <input
                value={niaChatInput}
                onChange={e => setNiaChatInput(e.target.value)}
                placeholder="Ask Nia anything…"
                className="flex-1 bg-background/60 border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                style={{ fontSize: "16px" }}
                onKeyDown={e => {
                  if (e.key === "Enter" && niaChatInput.trim()) {
                    setNiaMessage("Nia is your AI assistant for family history. Ask her about research tips, oral history prompts, or genealogy guidance. Full AI integration is available via the Nia button in the menu.");
                  }
                }}
              />
              <button
                onClick={() => {
                  if (niaChatInput.trim()) {
                    setNiaMessage("Nia is your AI assistant for family history. Ask her about research tips, oral history prompts, or genealogy guidance. Full AI integration is available via the Nia button in the menu.");
                    setNiaChatInput("");
                  }
                }}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium active:opacity-80"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        {/* Mission Footer */}
        <div className="rounded-2xl bg-gradient-to-br from-[#1a0e00] to-[#2a1500] border border-amber-800/30 p-5 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <BookHeart className="w-5 h-5 text-amber-400" />
            <span className="text-amber-300 font-bold text-sm">NIAKOFA</span>
          </div>
          <p className="text-amber-400/80 text-xs font-medium mb-1">Our Mission</p>
          <p className="text-amber-100/60 text-xs italic leading-relaxed">
            "Preserve Our Past. Empower Our Future."
          </p>
          <p className="text-amber-400/50 text-xs mt-2 leading-relaxed">
            Building stronger families. Strengthening our community. Securing our legacy.
          </p>
          <div className="flex items-center justify-center gap-4 mt-3">
            {["Secure & Private", "Family First", "Generations Connected"].map(t => (
              <span key={t} className="text-xs text-amber-400/50">{t}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
