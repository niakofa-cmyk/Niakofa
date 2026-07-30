/**
 * Heritage Collections — Curated cultural collections
 * Route: /diaspora/heritage
 *
 * Enhancements:
 *  - 2-column image grid with photo thumbnails for each collection
 *  - 6 featured collections matching the reference screenshot
 *  - Fallback demo data when API returns empty
 *  - Theme tags and item counts
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Library, Search, Loader2,
  Globe, Star, BookOpen, Layers, Users, ArrowRight,
  Image,
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
  cover_image?: string | null;
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
  "fort-worth-stories": Globe,
};

const COLOR_MAP: Record<string, { text: string; bg: string; border: string; gradient: string }> = {
  "great-migration":  { text: "text-amber-400",  bg: "bg-amber-400/10",  border: "border-amber-400/20",  gradient: "from-amber-600/40 to-amber-900/60"  },
  "black-cowboys":    { text: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/20", gradient: "from-yellow-600/40 to-yellow-900/60" },
  "civil-rights":     { text: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/20", gradient: "from-purple-600/40 to-purple-900/60" },
  "family-recipes":   { text: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/20", gradient: "from-orange-600/40 to-orange-900/60" },
  "church-history":   { text: "text-blue-400",   bg: "bg-blue-400/10",   border: "border-blue-400/20",   gradient: "from-blue-600/40 to-blue-900/60"   },
  "military-service": { text: "text-red-400",    bg: "bg-red-400/10",    border: "border-red-400/20",    gradient: "from-red-600/40 to-red-900/60"    },
  "hbcu-legacy":      { text: "text-teal-400",   bg: "bg-teal-400/10",   border: "border-teal-400/20",   gradient: "from-teal-600/40 to-teal-900/60"   },
  "land-ownership":   { text: "text-green-400",  bg: "bg-green-400/10",  border: "border-green-400/20",  gradient: "from-green-600/40 to-green-900/60" },
  "fort-worth-stories": { text: "text-rose-400", bg: "bg-rose-400/10",  border: "border-rose-400/20",   gradient: "from-rose-600/40 to-rose-900/60"   },
};

const COLLECTION_IMAGES: Record<string, string> = {
  "great-migration": "https://images.pexels.com/photos/9151751/pexels-photo-9151751.jpeg?auto=compress&cs=tinysrgb&h=400&w=600",
  "black-cowboys": "https://images.pexels.com/photos/9151750/pexels-photo-9151750.jpeg?auto=compress&cs=tinysrgb&h=400&w=600",
  "civil-rights": "https://images.pexels.com/photos/16156767/pexels-photo-16156767.jpeg?auto=compress&cs=tinysrgb&h=400&w=600",
  "family-recipes": "https://images.pexels.com/photos/6004140/pexels-photo-6004140.jpeg?auto=compress&cs=tinysrgb&h=400&w=600",
  "church-history": "https://images.pexels.com/photos/7520351/pexels-photo-7520351.jpeg?auto=compress&cs=tinysrgb&h=400&w=600",
  "fort-worth-stories": "https://images.pexels.com/photos/4262426/pexels-photo-4262426.jpeg?auto=compress&cs=tinysrgb&h=400&w=600",
  "military-service": "https://images.pexels.com/photos/5214869/pexels-photo-5214869.jpeg?auto=compress&cs=tinysrgb&h=400&w=600",
  "hbcu-legacy": "https://images.pexels.com/photos/8790740/pexels-photo-8790740.jpeg?auto=compress&cs=tinysrgb&h=400&w=600",
  "land-ownership": "https://images.pexels.com/photos/3234896/pexels-photo-3234896.jpeg?auto=compress&cs=tinysrgb&h=400&w=600",
};

const DEMO_COLLECTIONS: Collection[] = [
  { slug: "great-migration", title: "Great Migration", description: "The movement of 6 million African Americans from the rural South to urban Northern and Western cities between 1910-1970.", item_count: 24, tags: ["history", "migration"], themes: ["Movement", "Labor"] },
  { slug: "black-cowboys", title: "Black Cowboys", description: "Celebrating the often-overlooked history of African American cowboys, ranchers, and horsemen of the American West.", item_count: 18, tags: ["cowboys", "west"], themes: ["Identity", "Land"] },
  { slug: "civil-rights", title: "Civil Rights Movement", description: "Documenting the struggle for equality through marches, sit-ins, legal battles, and everyday courage.", item_count: 31, tags: ["civil rights", "equality"], themes: ["Justice", "Resistance"] },
  { slug: "family-recipes", title: "Family Recipes", description: "Preserving the culinary traditions, flavors, and techniques passed down through generations of Black families.", item_count: 12, tags: ["food", "culture"], themes: ["Community", "Ancestry"] },
  { slug: "church-history", title: "Church History", description: "The church as the heart of the Black community — from spirituals and sermons to social justice and education.", item_count: 16, tags: ["church", "faith"], themes: ["Faith", "Community"] },
  { slug: "fort-worth-stories", title: "Fort Worth Stories", description: "Local stories from the Fort Worth African American community — families, businesses, and landmarks that shaped the city.", item_count: 8, tags: ["fort worth", "local"], themes: ["Community", "Heritage"] },
];

export default function HeritageCollectionsPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");

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
      const cols = data.collections?.length ? data.collections : DEMO_COLLECTIONS;
      setCollections(cols);
    } catch {
      setCollections(DEMO_COLLECTIONS);
    } finally {
      setLoading(false);
    }
  }

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Sign in to view heritage collections</p>
      </div>
    );
  }

  const filtered = collections.filter(c =>
    !searchQ ||
    c.title.toLowerCase().includes(searchQ.toLowerCase()) ||
    c.tags.some(t => t.includes(searchQ.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/diaspora")} className="p-2 -ml-2 rounded-lg active:bg-muted">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold flex items-center gap-2">
              <Library className="w-4 h-4 text-purple-500" />
              Heritage Collections
            </h1>
            <p className="text-xs text-muted-foreground">Curated cultural archives from our community</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        {/* Heritage Globe — centerpiece of Heritage within Diaspora */}
        <button
          onClick={() => navigate("/diaspora/heritage/globe")}
          className="w-full bg-gradient-to-br from-teal-500/15 via-emerald-500/10 to-transparent border border-teal-500/25 rounded-2xl p-5 text-left active:opacity-70 mb-4"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-teal-500/15 flex items-center justify-center">
              <Globe className="w-6 h-6 text-teal-400" />
            </div>
            <div>
              <p className="font-bold text-sm">Diaspora Heritage Globe</p>
              <p className="text-xs text-muted-foreground">Visualize ancestral origins & migration routes</p>
            </div>
            <ArrowRight className="w-4 h-4 text-teal-400 ml-auto" />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Interactive globe of diaspora hubs worldwide. Trace migration routes,
            explore communities, and connect with your ancestral homeland.
          </p>
        </button>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Search collections…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            style={{ fontSize: "16px" }}
          />
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        )}

        {!loading && (
          <>
            {/* Featured Collections Grid */}
            <div className="grid grid-cols-2 gap-3">
              {filtered.map(c => {
                const colors = COLOR_MAP[c.slug] ?? COLOR_MAP["great-migration"];
                const imageUrl = COLLECTION_IMAGES[c.slug];
                const Icon = ICON_MAP[c.slug] ?? BookOpen;

                return (
                  <button
                    key={c.slug}
                    onClick={() => navigate(`/diaspora/heritage/${c.slug}`)}
                    className="bg-card border border-border rounded-2xl overflow-hidden text-left active:opacity-70 transition-opacity"
                  >
                    {/* Image thumbnail */}
                    <div className={`relative h-32 bg-gradient-to-br ${colors.gradient}`}>
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={c.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Icon className={`w-8 h-8 ${colors.text}`} />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className="absolute bottom-2 left-2 right-2">
                        <p className="text-xs font-bold text-white drop-shadow">{c.title}</p>
                      </div>
                    </div>
                    {/* Card body */}
                    <div className="p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Icon className={`w-3 h-3 ${colors.text}`} />
                        <span className="text-xs text-muted-foreground">{c.item_count} items</span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-snug">{c.description}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {c.themes.slice(0, 2).map(t => (
                          <span key={t} className={`text-xs px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Contribute CTA */}
            <div className="mt-6 bg-purple-500/5 border border-purple-500/20 rounded-2xl p-4 text-center">
              <Library className="w-8 h-8 text-purple-500/40 mx-auto mb-2" />
              <p className="font-semibold text-sm">Have a story to share?</p>
              <p className="text-xs text-muted-foreground mt-1 mb-3">
                Contribute photos, documents, and oral histories from your Family Vault to these shared collections.
              </p>
              <button
                onClick={() => navigate("/diaspora/family")}
                className="bg-purple-500 text-white px-5 py-2 rounded-xl text-sm font-medium active:opacity-80"
              >
                Share from Family Vault
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
