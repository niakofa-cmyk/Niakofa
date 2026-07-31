/**
 * Research Center — Genealogy research guides & records
 * Route: /diaspora/research
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, GraduationCap, ChevronRight, Search, Loader2,
  BookOpen, ExternalLink, Clock, Layers, Dna,
  ArrowRight, Globe, ScrollText, Sparkles,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";

interface Guide {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimated_time: string;
  resources: Array<{ name: string; url: string }>;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Archives: ScrollText,
  "Government Records": Globe,
  Military: Layers,
  "Vital Records": BookOpen,
  DNA: Dna,
  History: Globe,
};

const DIFFICULTY_STYLES = {
  beginner:     { label: "Beginner",     bg: "bg-green-500/10", text: "text-green-500" },
  intermediate: { label: "Intermediate", bg: "bg-amber-500/10",  text: "text-amber-500" },
  advanced:     { label: "Advanced",     bg: "bg-red-500/10",    text: "text-red-500"   },
};

// Fallback guides shown when the API is unavailable — mirrors the reference design
const FALLBACK_GUIDES: Guide[] = [
  {
    id: "freedmens-bureau",
    title: "Freedmen's Bureau Records",
    description: "The most important resource for African American genealogy research before 1870. Learn how to find your ancestors in these extraordinary records of formerly enslaved Americans.",
    category: "Archives",
    difficulty: "beginner",
    estimated_time: "1–2 hours",
    resources: [
      { name: "FamilySearch Freedmen's Bureau", url: "https://www.familysearch.org/en/freedmens-bureau/" },
      { name: "Fold3 Bureau Records", url: "https://www.fold3.com/title/1047/freedmens-bureau-records" },
    ],
  },
  {
    id: "tarrant-county-land",
    title: "Tarrant County Land Records",
    description: "Search historic land ownership and deeds in Tarrant County, TX. Land records document African American property owners and freedmen's land grants from the Reconstruction era onward.",
    category: "Government Records",
    difficulty: "intermediate",
    estimated_time: "2–3 hours",
    resources: [
      { name: "Tarrant County Deed Records", url: "https://www.tarrantcounty.com/en/county-clerk/deed-records.html" },
      { name: "Texas GLO Land Grants", url: "https://s3.glo.texas.gov/ncu/SCANDOCS/archives_webfiles/arcmaps/webfiles/landgrants/PDFs/" },
    ],
  },
  {
    id: "us-census-guide",
    title: "U.S. Census Guide",
    description: "Step-by-step guide to researching your family in U.S. census records from 1870–1940. Includes tips for finding African American families in Soundex indexes and slave schedules.",
    category: "Government Records",
    difficulty: "beginner",
    estimated_time: "1 hour",
    resources: [
      { name: "Ancestry Census Records", url: "https://www.ancestry.com/search/categories/census/" },
      { name: "FamilySearch Census", url: "https://www.familysearch.org/en/united-states/census" },
    ],
  },
  {
    id: "fort-worth-city-directories",
    title: "Fort Worth City Directories",
    description: "Find people in historic Fort Worth city directories from 1877–1980. These annual books list residents, occupations, and addresses — invaluable for tracing families between censuses.",
    category: "Archives",
    difficulty: "beginner",
    estimated_time: "30 min",
    resources: [
      { name: "Fort Worth Public Library Heritage", url: "https://fortworthtexas.gov/departments/library" },
      { name: "Portal to Texas History", url: "https://texashistory.unt.edu/" },
    ],
  },
  {
    id: "military-records",
    title: "Military Service Records",
    description: "WWII, Korea, and Vietnam-era military records for African American veterans. Includes Buffalo Soldiers, 92nd Infantry Division, and Tuskegee Airmen documentation.",
    category: "Military",
    difficulty: "intermediate",
    estimated_time: "2 hours",
    resources: [
      { name: "National Archives Military Records", url: "https://www.archives.gov/veterans" },
      { name: "Fold3 Military Records", url: "https://www.fold3.com/title/490/wwii-draft-cards-young-men" },
    ],
  },
  {
    id: "dna-genealogy",
    title: "Using DNA for African American Genealogy",
    description: "DNA testing can break through the 1870 brick wall. Learn to use AncestryDNA, 23andMe, and chromosome comparisons to find cousins and trace your African ethnic origins.",
    category: "DNA",
    difficulty: "advanced",
    estimated_time: "3–5 hours",
    resources: [
      { name: "AfricanAncestry.com", url: "https://africanancestry.com/" },
      { name: "DNA Explained Blog", url: "https://dna-explained.com/" },
    ],
  },
];

export default function ResearchCenterPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    loadGuides();
  }, [currentUser]);

  async function loadGuides() {
    setLoading(true);
    try {
      const res = await fetch("/api/diaspora/research/guides", { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      // Use API data when available, fall back to curated guides so the page
      // is never blank — these are real, useful resources regardless.
      setGuides(data.guides?.length ? data.guides : FALLBACK_GUIDES);
    } catch {
      setGuides(FALLBACK_GUIDES);
    } finally {
      setLoading(false);
    }
  }

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Sign in to access the Research Center</p>
      </div>
    );
  }

  const categories = [...new Set(guides.map(g => g.category))];

  const filtered = guides.filter(g => {
    const q = searchQ.toLowerCase();
    const matchesSearch = !searchQ || g.title.toLowerCase().includes(q) || g.description.toLowerCase().includes(q);
    const matchesCat = !activeCategory || g.category === activeCategory;
    return matchesSearch && matchesCat;
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
              <GraduationCap className="w-4 h-4 text-teal-400" />
              Research Center
            </h1>
            <p className="text-xs text-muted-foreground">Guides, records & research tools</p>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="relative bg-gradient-to-br from-[#001a1a] via-[#003333] to-[#001a1a] border-b border-teal-800/30">
        <div className="relative max-w-lg mx-auto px-4 py-8">
          <h2 className="text-xl font-bold text-teal-100 mb-2">Research Guides & Records</h2>
          <p className="text-sm text-teal-300/70 leading-relaxed">
            Expert guides for researching African American family history — from Freedmen's Bureau records to DNA genealogy.
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
            placeholder="Search guides…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            style={{ fontSize: "16px" }}
          />
        </div>

        {/* Category filter */}
        {!loading && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveCategory(null)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                !activeCategory ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  activeCategory === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Featured: Freedmen's Bureau */}
        {!loading && !searchQ && !activeCategory && (
          <div className="bg-gradient-to-br from-amber-500/15 to-amber-600/5 border border-amber-500/30 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <ScrollText className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Featured</span>
            </div>
            <h3 className="font-bold text-foreground mb-1">Freedmen's Bureau Records</h3>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              The most important resource for African American genealogy research before 1870. Learn how to find your ancestors in these extraordinary records.
            </p>
            <button
              onClick={() => setExpandedId("freedmens-bureau")}
              className="text-xs text-amber-400 font-medium flex items-center gap-1"
            >
              Read Guide <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(g => {
              const Icon = CATEGORY_ICONS[g.category] ?? BookOpen;
              const diff = DIFFICULTY_STYLES[g.difficulty];
              const isExpanded = expandedId === g.id;
              return (
                <div key={g.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : g.id)}
                    className="w-full flex items-start gap-3 p-4 text-left active:bg-muted/50"
                  >
                    <div className="w-9 h-9 rounded-lg bg-teal-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon className="w-4 h-4 text-teal-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm leading-snug">{g.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-snug">{g.description}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${diff.bg} ${diff.text}`}>
                          {diff.label}
                        </span>
                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" /> {g.estimated_time}
                        </span>
                        <span className="text-xs text-muted-foreground">{g.category}</span>
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-muted-foreground flex-shrink-0 mt-1 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-border/50 pt-3">
                      <p className="text-sm text-foreground leading-relaxed mb-3">{g.description}</p>
                      {g.resources.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                            Recommended Resources
                          </p>
                          <div className="space-y-2">
                            {g.resources.map(r => (
                              <a
                                key={r.name}
                                href={r.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-xs text-primary active:opacity-70"
                              >
                                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                {r.name}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      {g.resources.length === 0 && (
                        <p className="text-xs text-muted-foreground italic">
                          Additional resources coming soon. Ask Nia for personalized guidance.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {filtered.length === 0 && !loading && (
              <div className="text-center py-12 space-y-2">
                <GraduationCap className="w-10 h-10 text-muted-foreground/40 mx-auto" />
                <p className="text-muted-foreground">No guides match your search</p>
              </div>
            )}
          </div>
        )}

        {/* Nia Research Assistant */}
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold">AI Research Assistant</p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
            Nia can help you plan a personalized research strategy, suggest which records to search first, and explain complex genealogy concepts in plain language.
          </p>
          <button
            onClick={() => navigate("/diaspora")}
            className="text-xs text-primary font-medium flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3" /> Ask Nia to help with research →
          </button>
        </div>
      </div>
    </div>
  );
}
