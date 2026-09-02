/**
 * Heritage Collections — Curated cultural collections
 * Route: /diaspora/heritage  (list view)
 * Route: /diaspora/heritage/:slug  (detail view for a single collection)
 *
 * Enhancements:
 *  - 2-column image grid with photo thumbnails for each collection
 *  - 6 featured collections matching the reference screenshot
 *  - Fallback demo data when API returns empty
 *  - Theme tags and item counts
 *  - Collection detail view when :slug param is present
 *  - Heritage Globe featured as centerpiece of Heritage section
 */

import { useState, useEffect, type FormEvent } from "react";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Library, Search, Loader2,
  Globe, Star, BookOpen, Layers, Users, ArrowRight,
  ChevronRight, BookHeart, Mic, FileText, Send, CheckCircle2, X,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";

interface Collection {
  slug: string;
  title: string;
  description: string;
  item_count: number;
  tags: string[];
  themes: string[];
  cover_image?: string | null;
}

interface CollectionItem {
  id: number;
  title: string;
  description: string | null;
  media_type: string;
  source_name: string | null;
  media_url?: string | null;
  created_at: string;
}

interface FamilySpaceOption {
  id: number;
  name: string;
  status: "active" | "invited";
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

function mediaTypeIcon(type: string) {
  switch (type) {
    case "photo":   return <BookHeart className="w-4 h-4 text-amber-400" />;
    case "audio":   return <Mic className="w-4 h-4 text-red-400" />;
    case "video":   return <FileText className="w-4 h-4 text-blue-400" />;
    default:        return <FileText className="w-4 h-4 text-muted-foreground" />;
  }
}

export default function HeritageCollectionsPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const { slug } = useParams<{ slug?: string }>();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");

  // Detail view state
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [currentCollection, setCurrentCollection] = useState<Collection | null>(null);
  const [familySpaces, setFamilySpaces] = useState<FamilySpaceOption[]>([]);
  const [showContribution, setShowContribution] = useState(false);
  const [contributionKind, setContributionKind] = useState<"photo" | "story" | "note" | "link">("story");
  const [contributionTitle, setContributionTitle] = useState("");
  const [contributionBody, setContributionBody] = useState("");
  const [contributionUrl, setContributionUrl] = useState("");
  const [contributionFamilyId, setContributionFamilyId] = useState<number | null>(null);
  const [contributionSaving, setContributionSaving] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    loadCollections();
  }, [currentUser]);

  // Load collection detail when slug changes
  useEffect(() => {
    if (!slug || !currentUser) return;
    loadCollectionItems(slug);
    loadFamilySpaces();
  }, [slug, currentUser]);

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

  async function loadCollectionItems(slug: string) {
    setDetailLoading(true);
    setCurrentCollection(null);
    try {
      const res = await fetch(`/api/diaspora/heritage/${slug}`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(data.items ?? []);
      setCurrentCollection(data.collection ?? DEMO_COLLECTIONS.find(c => c.slug === slug) ?? null);
    } catch {
      setCurrentCollection(DEMO_COLLECTIONS.find(c => c.slug === slug) ?? null);
      setItems([]);
    } finally {
      setDetailLoading(false);
    }
  }

  async function loadFamilySpaces() {
    try {
      const res = await fetch("/api/family/mine", { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const active = (data.families ?? []).filter((family: FamilySpaceOption) => family.status === "active");
      setFamilySpaces(active);
      if (active.length > 0) setContributionFamilyId(active[0].id);
    } catch {
      // Family linking is optional; the contribution form remains available.
    }
  }

  function resetContributionForm() {
    setShowContribution(false);
    setContributionKind("story");
    setContributionTitle("");
    setContributionBody("");
    setContributionUrl("");
    setContributionSaving(false);
  }

  async function submitContribution(event: FormEvent) {
    event.preventDefault();
    if (!slug || !contributionTitle.trim()) return;
    setContributionSaving(true);
    try {
      const res = await fetch(`/api/diaspora/heritage/${slug}/contributions`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: contributionKind,
          title: contributionTitle.trim(),
          body: contributionBody.trim() || undefined,
          media_url: contributionUrl.trim() || undefined,
          family_id: contributionFamilyId ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't submit contribution");
      toast.success("Contribution submitted for review");
      resetContributionForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't submit contribution");
    } finally {
      setContributionSaving(false);
    }
  }

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Sign in to view heritage collections</p>
      </div>
    );
  }

  // ── Collection Detail View ──────────────────────────────────────────────
  if (slug) {
    const colors = COLOR_MAP[slug] ?? COLOR_MAP["great-migration"];
    const Icon = ICON_MAP[slug] ?? BookOpen;
    const imageUrl = COLLECTION_IMAGES[slug];

    return (
      <div className="min-h-screen bg-background pb-28">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
            <button onClick={() => navigate("/diaspora/heritage")} className="p-2 -ml-2 rounded-lg active:bg-muted">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="font-bold flex items-center gap-2">
                <Icon className={`w-4 h-4 ${colors.text}`} />
                {currentCollection?.title ?? DEMO_COLLECTIONS.find(c => c.slug === slug)?.title ?? "Collection"}
              </h1>
              <p className="text-xs text-muted-foreground">
                {detailLoading ? "Loading…" : `${items.length} items in this collection`}
              </p>
            </div>
          </div>
        </div>

        <div className="max-w-lg mx-auto px-4 pt-4">
          {/* Collection banner */}
          <div className={`relative h-32 rounded-2xl overflow-hidden bg-gradient-to-br ${colors.gradient} mb-4`}>
            {imageUrl && (
              <img src={imageUrl} alt={currentCollection?.title} className="w-full h-full object-cover" loading="lazy" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-3 left-3 right-3">
              <p className="text-sm font-bold text-white drop-shadow">{currentCollection?.title}</p>
              <p className="text-xs text-white/80 line-clamp-1">{currentCollection?.description}</p>
            </div>
          </div>

           <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-teal-400/20 bg-teal-400/[0.06] p-4">
             <div className="min-w-0">
               <p className="text-sm font-semibold">Add to this collection</p>
               <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Share a family story or source. New contributions stay private until reviewed.</p>
             </div>
             <button
               onClick={() => setShowContribution(true)}
               className="flex shrink-0 items-center gap-1.5 rounded-xl bg-teal-300 px-3 py-2 text-xs font-bold text-[#042f2e] active:opacity-80"
             >
               <Send className="h-3.5 w-3.5" /> Share
             </button>
           </div>

          {detailLoading && (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}

          {!detailLoading && items.length === 0 && (
            <div className="text-center py-12 space-y-2">
              <Library className="w-10 h-10 text-muted-foreground/30 mx-auto" />
              <p className="text-sm font-medium text-muted-foreground">No items in this collection yet</p>
              <p className="text-xs text-muted-foreground">Items from Family Vault contributions will appear here.</p>
            </div>
          )}

          {!detailLoading && items.length > 0 && (
            <div className="space-y-2">
              {items.map(item => (
                <div key={item.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    {mediaTypeIcon(item.media_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>
                    )}
                    {item.source_name && (
                      <p className="text-xs text-muted-foreground mt-0.5">From: {item.source_name}</p>
                    )}
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                   {item.media_url && (
                     <a href={item.media_url} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()} className="text-xs text-teal-500 hover:underline">
                       Open
                     </a>
                   )}
                </div>
              ))}
            </div>
          )}

          {/* Tags */}
          {currentCollection?.themes && currentCollection.themes.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {currentCollection.themes.map(t => (
                <span key={t} className={`text-xs px-2.5 py-1 rounded-full ${colors.bg} ${colors.text}`}>
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

         {showContribution && (
           <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
             <div className="w-full max-w-lg rounded-2xl bg-card p-5 shadow-2xl">
               <div className="mb-4 flex items-start justify-between gap-3">
                 <div>
                   <h2 className="text-lg font-bold">Share with the collection</h2>
                   <p className="mt-1 text-xs text-muted-foreground">Every contribution is reviewed before it becomes visible to the community.</p>
                 </div>
                 <button onClick={resetContributionForm} className="rounded-lg p-1 active:bg-muted" aria-label="Close contribution form">
                   <X className="h-5 w-5" />
                 </button>
               </div>
               <form onSubmit={submitContribution} className="space-y-3">
                 <div>
                   <label className="mb-1 block text-sm font-medium">What are you sharing?</label>
                   <select value={contributionKind} onChange={event => setContributionKind(event.target.value as typeof contributionKind)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" style={{ fontSize: "16px" }}>
                     <option value="story">Story</option>
                     <option value="photo">Photo link</option>
                     <option value="note">Research note</option>
                     <option value="link">External source link</option>
                   </select>
                 </div>
                 <div>
                   <label className="mb-1 block text-sm font-medium">Title *</label>
                   <input value={contributionTitle} onChange={event => setContributionTitle(event.target.value)} maxLength={200} required placeholder="A title people can remember" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" style={{ fontSize: "16px" }} />
                 </div>
                 <div>
                   <label className="mb-1 block text-sm font-medium">{contributionKind === "link" ? "Description" : "Story or note"}</label>
                   <textarea value={contributionBody} onChange={event => setContributionBody(event.target.value)} maxLength={8000} rows={4} placeholder="Tell the story behind this contribution…" className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm" style={{ fontSize: "16px" }} />
                 </div>
                 {(contributionKind === "link" || contributionKind === "photo") && (
                   <div>
                     <label className="mb-1 block text-sm font-medium">{contributionKind === "link" ? "Source URL *" : "Photo URL (optional)"}</label>
                     <input type="url" value={contributionUrl} onChange={event => setContributionUrl(event.target.value)} required={contributionKind === "link"} placeholder="https://…" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" style={{ fontSize: "16px" }} />
                   </div>
                 )}
                 <div>
                   <label className="mb-1 block text-sm font-medium">Family Space (optional)</label>
                   <select value={contributionFamilyId ?? ""} onChange={event => setContributionFamilyId(event.target.value ? Number(event.target.value) : null)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" style={{ fontSize: "16px" }}>
                     <option value="">No family link</option>
                     {familySpaces.map(family => <option key={family.id} value={family.id}>{family.name}</option>)}
                   </select>
                   <p className="mt-1 text-xs text-muted-foreground">Linking a Family Space helps your relatives recognize the source.</p>
                 </div>
                 <div className="flex gap-2 pt-1">
                   <button type="button" onClick={resetContributionForm} className="flex-1 rounded-lg border border-input py-2.5 text-sm font-medium">Cancel</button>
                   <button type="submit" disabled={contributionSaving || !contributionTitle.trim()} className="flex-1 rounded-lg bg-teal-300 py-2.5 text-sm font-bold text-[#042f2e] disabled:opacity-50">
                     {contributionSaving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : <span className="flex items-center justify-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Submit</span>}
                   </button>
                 </div>
               </form>
             </div>
           </div>
         )}
      </div>
    );
  }

  // ── Collection List View ────────────────────────────────────────────────
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
