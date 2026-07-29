/**
 * Heritage Collections — Curated cultural collections
 * Route: /diaspora/heritage
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Library, ChevronRight, Search, Loader2,
  Globe, Star, BookOpen, Layers, Users, ArrowRight,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "sonner";

interface Collection {
  slug: string;
  title: string;
  description: string;
  item_count: number;
  tags: string[];
  themes: string[];
}

const ICON_MAP: Record<string, React.ElementType> = {
  "great-migration": Globe,
  "black-cowboys": Star,
  "civil-rights": BookOpen,
  "family-recipes": Layers,
  "church-history": Users,
  "military-service": Star,
  "hbcu-legacy": BookOpen,
  "land-ownership": Globe,
};

const COLOR_MAP: Record<string, { text: string; bg: string; border: string }> = {
  "great-migration":  { text: "text-amber-400",  bg: "bg-amber-400/10",  border: "border-amber-400/20"  },
  "black-cowboys":    { text: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/20" },
  "civil-rights":     { text: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/20" },
  "family-recipes":   { text: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/20" },
  "church-history":   { text: "text-blue-400",   bg: "bg-blue-400/10",   border: "border-blue-400/20"   },
  "military-service": { text: "text-red-400",    bg: "bg-red-400/10",    border: "border-red-400/20"    },
  "hbcu-legacy":      { text: "text-teal-400",   bg: "bg-teal-400/10",   border: "border-teal-400/20"   },
  "land-ownership":   { text: "text-green-400",  bg: "bg-green-400/10",  border: "border-green-400/20"  },
};

export default function HeritageCollectionsPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [activeTheme, setActiveTheme] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    loadCollections();
  }, [currentUser]);

  async function loadCollections() {
    setLoading(true);
    try {
      const res = await fetch("/api/diaspora/heritage", { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCollections(data.collections ?? []);
    } catch {
      toast.error("Couldn't load heritage collections");
    } finally {
      setLoading(false);
    }
  }

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Sign in to explore Heritage Collections</p>
      </div>
    );
  }

  const allThemes = [...new Set(collections.flatMap(c => c.themes))];

  const filtered = collections.filter(c => {
    const q = searchQ.toLowerCase();
    const matchesSearch = !searchQ || c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.tags.some(t => t.includes(q));
    const matchesTheme = !activeTheme || c.themes.includes(activeTheme);
    return matchesSearch && matchesTheme;
  });

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/diaspora")} className="p-2 -ml-2 rounded-lg active:bg-muted">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-bold flex items-center gap-2">
              <Library className="w-4 h-4 text-purple-400" />
              Heritage Collections
            </h1>
            <p className="text-xs text-muted-foreground">Explore Black culture & history</p>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="relative bg-gradient-to-br from-[#1a0a2e] via-[#2a1050] to-[#1a0a2e] border-b border-purple-800/30">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-purple-600/15 via-transparent to-transparent" />
        <div className="relative max-w-lg mx-auto px-4 py-8">
          <h2 className="text-xl font-bold text-purple-100 mb-2">Explore Our Heritage</h2>
          <p className="text-sm text-purple-300/70 leading-relaxed">
            Curated collections celebrating Black history, culture, and legacy across the African diaspora.
          </p>
          <p className="text-xs text-purple-400/50 mt-3">
            {collections.reduce((a, c) => a + c.item_count, 0)} items across {collections.length} collections
          </p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Search collections…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            style={{ fontSize: "16px" }}
          />
        </div>

        {/* Theme filter pills */}
        {!loading && allThemes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTheme(null)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                !activeTheme ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              All
            </button>
            {allThemes.map(t => (
              <button
                key={t}
                onClick={() => setActiveTheme(activeTheme === t ? null : t)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  activeTheme === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(c => {
              const Icon = ICON_MAP[c.slug] ?? Library;
              const colors = COLOR_MAP[c.slug] ?? { text: "text-primary", bg: "bg-primary/10", border: "border-primary/20" };
              return (
                <div
                  key={c.slug}
                  className={`bg-card border ${colors.border} rounded-2xl overflow-hidden`}
                >
                  {/* Collection header */}
                  <div className={`${colors.bg} p-4 flex items-start gap-3`}>
                    <div className={`w-10 h-10 rounded-xl ${colors.bg} flex items-center justify-center flex-shrink-0 border ${colors.border}`}>
                      <Icon className={`w-5 h-5 ${colors.text}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-bold text-sm ${colors.text}`}>{c.title}</h3>
                      <p className="text-xs text-foreground/70 mt-0.5 leading-snug line-clamp-2">{c.description}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-lg font-bold ${colors.text}`}>{c.item_count}</p>
                      <p className="text-xs text-muted-foreground">items</p>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex flex-wrap gap-1.5">
                      {c.themes.map(t => (
                        <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {t}
                        </span>
                      ))}
                    </div>
                    <button className={`text-xs ${colors.text} font-medium flex items-center gap-0.5 flex-shrink-0`}>
                      Explore <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="text-center py-12 space-y-2">
                <Library className="w-10 h-10 text-muted-foreground/40 mx-auto" />
                <p className="text-muted-foreground">No collections match your search</p>
              </div>
            )}
          </div>
        )}

        {/* Contribute CTA */}
        <div className="bg-purple-500/5 border border-purple-500/20 rounded-2xl p-5">
          <h3 className="font-semibold text-sm mb-2 text-purple-300">Contribute to Heritage Collections</h3>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
            Share memories, photos, and stories from your Family Vault into these public collections to help preserve the broader Black cultural heritage.
          </p>
          <button
            onClick={() => navigate("/family")}
            className="text-xs text-purple-400 font-medium flex items-center gap-1"
          >
            <ArrowRight className="w-3 h-3" /> Go to your Family Vault to share
          </button>
        </div>
      </div>
    </div>
  );
}
