import { useState, useEffect } from "react";
import { useAppContext } from "@/lib/AppContext";
import LiveLeaderboard from "@/components/LiveLeaderboard";
import { CommunityPostComposer, type NewCommunityPost } from "@/components/CommunityPostComposer";
import { Users, Heart, Star, Sparkles, Activity, DollarSign, Shield, PlusCircle, X, Send, ChevronDown, MapPin, Award, Wrench, Globe } from "lucide-react";
import { useGetRequests, useGetRequestStats, getGetRequestsQueryKey, getGetRequestStatsQueryKey } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { useWebSocket } from "@/lib/useWebSocket";
import { authHeaders } from "@/lib/auth";
import { useTranslation } from "react-i18next";

interface GratitudePost {
  id: number;
  author_name: string;
  author_avatar?: string | null;
  helper_name?: string | null;
  message: string;
  request_title?: string | null;
  likes: number;
  created_at: string;
  post_type?: "thanks" | "offer" | "resource" | "update";
  photo_url?: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  groceries: "🛒 Groceries",
  transportation: "🚗 Transportation",
  errands: "📦 Errands",
  home_repair: "🔧 Home Repair",
  medical: "🏥 Medical",
  emergency: "🚨 Emergency",
  other: "💙 Other",
};

const FUND_POOLS = [
  { label: "Emergency Fund", description: "Covers helpers for urgent requests when users can't pay", pct: 62, color: "bg-destructive" },
  { label: "Medical Assist", description: "Prescription pickups, medical transport", pct: 21, color: "bg-primary" },
  { label: "General Pool", description: "Everyday help — groceries, errands, transport", pct: 17, color: "bg-green-500" },
];

type Tab = "feed" | "heroes" | "pool" | "impact" | "resources" | "circles" | "skills";


interface CivicResource {
  id: number;
  name: string;
  category: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  hours: string | null;
}

const CIVIC_ICONS: Record<string, string> = {
  shelter: "🏠", food: "🍱", medical: "💊", mental_health: "🧠",
  legal: "⚖️", financial: "💰", employment: "💼", transportation: "🚌",
  childcare: "👶", education: "📚", other: "💙",
  local_farm: "🌱", housing: "🏘️", emergency: "🚨", safety: "🛡️",
  seniors: "🤝", youth: "⭐", health: "❤️", social_services: "🤲",
  volunteering: "🙌", workforce: "🔨",
};

interface SuggestionForm {
  name: string;
  category: string;
  description: string;
  phone: string;
  website: string;
}

function CivicResourcesTab() {
  const { t } = useTranslation();
  const [resources, setResources] = useState<CivicResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestionSent, setSuggestionSent] = useState(false);
  const [suggestion, setSuggestion] = useState<SuggestionForm>({
    name: "", category: "other", description: "", phone: "", website: "",
  });

  const submitSuggestion = async () => {
    if (!suggestion.name.trim()) return;
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      await fetch(`${base}/api/civic/suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(suggestion),
      });
    } catch {}
    setSuggestionSent(true);
    setTimeout(() => { setShowSuggest(false); setSuggestionSent(false); setSuggestion({ name: "", category: "other", description: "", phone: "", website: "" }); }, 2000);
  };

  useEffect(() => {
    fetch("/api/civic/resources")
      .then(r => r.json())
      .then((data) => { if (Array.isArray(data)) setResources(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const categories = ["all", ...Array.from(new Set(resources.map(r => r.category)))];
  const filtered = category === "all" ? resources : resources.filter(r => r.category === category);

  if (loading) return (
    <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (resources.length === 0) return (
    <div className="text-center py-16 px-4">
      <div className="text-4xl mb-3">🏛️</div>
      <div className="font-bold text-sm text-muted-foreground">{t("community.no_resources_listed_yet")}</div>
      <div className="text-xs text-muted-foreground/60 mt-1">{t("community.community_resources_will_appear_here")}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border transition-all capitalize ${
              category === cat
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted border-border text-muted-foreground"
            }`}
          >
            {cat === "all" ? "All" : cat.replace("_", " ")}
          </button>
        ))}
      </div>

      {filtered.map(r => (
        <div key={r.id} className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-lg shrink-0">
              {CIVIC_ICONS[r.category] ?? "💙"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-black text-sm">{r.name}</div>
              {r.description && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{r.description}</p>}
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                {r.address && <span className="text-[10px] text-muted-foreground">📍 {r.address}</span>}
                {r.hours && <span className="text-[10px] text-muted-foreground">🕐 {r.hours}</span>}
              </div>
              <div className="flex gap-2 mt-3">
                {r.phone && (
                  <a href={`tel:${r.phone}`} className="flex items-center gap-1 text-xs text-primary font-bold bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-full active:scale-95 transition-all">
                    {t("community.call")}
                  </a>
                )}
                {r.website && (
                  <a href={r.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground font-bold bg-muted border border-border px-3 py-1.5 rounded-full active:scale-95 transition-all">
                    {t("community.website")}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Suggest a resource — §3.3.2 */}
      <button
        onClick={() => setShowSuggest(true)}
        className="w-full flex items-center justify-center gap-2 p-3 border border-dashed border-primary/30 rounded-2xl text-sm text-primary/70 hover:text-primary hover:border-primary/60 transition-all"
      >
        <PlusCircle className="w-4 h-4" />
        {t("community.know_a_resource_were_missing_suggest")}
      </button>

      {/* Suggestion modal */}
      <AnimatePresence>
        {showSuggest && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
              onClick={() => setShowSuggest(false)}
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 220 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-3xl max-h-[80dvh] overflow-y-auto pb-safe"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 pb-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-primary" />
                  <h3 className="font-black text-lg">{t("community.suggest_a_resource")}</h3>
                </div>
                <button onClick={() => setShowSuggest(false)} className="p-2 rounded-full hover:bg-muted transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {suggestionSent ? (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-3">🙏</div>
                    <div className="font-black text-lg">{t("community.thank_you")}</div>
                    <p className="text-sm text-muted-foreground mt-1">{t("community.your_suggestion_will_be_reviewed_by")}</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("community.organization_name")}</label>
                      <input
                        className="mt-1.5 w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
                        placeholder={t("community.eg_tarrant_county_food_bank")}
                        value={suggestion.name}
                        onChange={e => setSuggestion(s => ({ ...s, name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("community.category")}</label>
                      <select
                        className="mt-1.5 w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
                        value={suggestion.category}
                        onChange={e => setSuggestion(s => ({ ...s, category: e.target.value }))}
                      >
                        {Object.entries(CIVIC_ICONS).map(([k, icon]) => (
                          <option key={k} value={k}>{icon} {k.replace(/_/g, " ")}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("community.description")}</label>
                      <textarea
                        className="mt-1.5 w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-primary transition-colors min-h-[80px] resize-none"
                        placeholder={t("community.what_services_do_they_provide")}
                        value={suggestion.description}
                        onChange={e => setSuggestion(s => ({ ...s, description: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("community.phone")}</label>
                        <input
                          className="mt-1.5 w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
                          placeholder="(817) 555-0000"
                          value={suggestion.phone}
                          onChange={e => setSuggestion(s => ({ ...s, phone: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("community.website_2")}</label>
                        <input
                          className="mt-1.5 w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
                          placeholder={t("community.https")}
                          value={suggestion.website}
                          onChange={e => setSuggestion(s => ({ ...s, website: e.target.value }))}
                        />
                      </div>
                    </div>
                    <button
                      onClick={submitSuggestion}
                      disabled={!suggestion.name.trim()}
                      className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold py-3.5 rounded-xl disabled:opacity-40 transition-all active:scale-[0.98]"
                    >
                      <Send className="w-4 h-4" />
                      {t("community.submit_suggestion")}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

interface CityNeighborhood {
  id: number;
  neighborhood_id: string;
  name: string;
  emoji: string;
  description: string;
}

// ENH (global neighborhoods): the static Fort Worth list was replaced by a
// per-city fetch — Fort Worth's content is preserved server-side as
// curated/verified seed data; every other city is generated on first
// request via Nia and cached. See artifacts/api-server/src/routes/community-neighborhoods.ts.
function useCityNeighborhoods(city: string | null | undefined) {
  const [neighborhoods, setNeighborhoods] = useState<CityNeighborhood[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!city) { setNeighborhoods([]); return; }
    setLoading(true);
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    fetch(`${base}/api/community/neighborhoods?city=${encodeURIComponent(city)}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { neighborhoods: [] })
      .then((data: { neighborhoods?: CityNeighborhood[] }) => setNeighborhoods(data.neighborhoods ?? []))
      .catch(() => setNeighborhoods([]))
      .finally(() => setLoading(false));
  }, [city]);

  return { neighborhoods, loading };
}

function NeighborhoodCirclesTab() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const { currentUser } = useAppContext();
  const userHood = currentUser?.neighborhood?.toLowerCase().replace(/\s+/g, "_");
  const { neighborhoods, loading } = useCityNeighborhoods(currentUser?.city);

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-primary/20 via-primary/5 to-background border border-primary/30 rounded-2xl p-4">
        <h3 className="font-black text-sm flex items-center gap-2 mb-1">
          <MapPin className="w-4 h-4 text-primary" /> {t("community.neighborhood_circles")}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t("community.your_circle_connects_you_with_neighbors")}
        </p>
      </div>

      {!currentUser?.city && (
        <div className="bg-card/50 border border-dashed border-border rounded-2xl p-4 text-center">
          <Globe className="w-6 h-6 text-primary/40 mx-auto mb-2" />
          <div className="text-sm font-bold text-muted-foreground">Add your city in your profile to see local neighborhoods</div>
        </div>
      )}

      {currentUser?.city && loading && (
        <div className="text-center text-xs text-muted-foreground py-6">Loading neighborhoods…</div>
      )}

      {neighborhoods.map(hood => {
        const isYours = userHood === hood.neighborhood_id || currentUser?.neighborhood?.toLowerCase() === hood.name.toLowerCase();
        const isOpen = selected === hood.neighborhood_id;
        return (
          <motion.div
            key={hood.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`bg-card border rounded-2xl p-4 cursor-pointer transition-all ${
              isYours ? "border-primary/60 bg-primary/5" : "border-border hover:border-primary/30"
            }`}
            onClick={() => setSelected(isOpen ? null : hood.neighborhood_id)}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-xl shrink-0">
                {hood.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-black text-sm">{hood.name}</div>
                  {isYours && (
                    <span className="text-[10px] font-black text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                      {t("community.your_circle")}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{hood.description}</div>
              </div>
              <Users className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
          </motion.div>
        );
      })}

      <div className="bg-card/50 border border-primary/20 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">🌱</span>
          <div className="font-black text-sm">Start a neighborhood request</div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">
          Post a community request — farm pickup coordination, neighborhood garden, group grocery run — and neighbors in your circle can join or help.
        </p>
        <div className="flex gap-2 flex-wrap">
          <a href="/request/new" className="text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-full">
            Post a request →
          </a>
          <a href="/community" className="text-xs font-bold text-muted-foreground bg-muted border border-border px-3 py-1.5 rounded-full">
            View Resources
          </a>
        </div>
      </div>
    </div>
  );
}

const SKILLS_DIRECTORY = [
  // Trades
  { id: "licensed_electrician", label: "Electrician",   emoji: "⚡", desc: "Safe assistance with electrical needs and home repairs", cats: ["home_repair"] },
  { id: "licensed_plumber",     label: "Plumber",       emoji: "🔧", desc: "Pipe repairs, leak fixes, and plumbing emergencies", cats: ["home_repair"] },
  { id: "carpenter",            label: "Carpenter",     emoji: "🪚", desc: "Woodworking, furniture assembly, and construction", cats: ["home_repair","event_setup"] },
  { id: "painting",             label: "Painting",      emoji: "🎨", desc: "Interior and exterior painting", cats: ["home_repair"] },
  { id: "yard_work",            label: "Yard Work",     emoji: "🌿", desc: "Lawn care, gardening, outdoor maintenance", cats: ["home_repair","local_farm"] },
  { id: "heavy_lifting",        label: "Heavy Lifting", emoji: "💪", desc: "Moving, hauling, loading — physically strong helpers", cats: ["home_repair","delivery_run","event_setup"] },
  // Transport
  { id: "truck_owner",          label: "Truck Owner",   emoji: "🚛", desc: "Move furniture, haul supplies, or transport large items", cats: ["transportation","errands","stock_shelves"] },
  { id: "cdl_driver",           label: "CDL Driver",    emoji: "🚚", desc: "Commercial driver's license — large vehicle expertise", cats: ["transportation","delivery_run"] },
  { id: "food_delivery",        label: "Food Delivery", emoji: "🛵", desc: "Bring groceries, meals, or farm box pickups", cats: ["groceries","delivery_run","local_farm"] },
  // Care & Support
  { id: "childcare",            label: "Childcare",     emoji: "👶", desc: "Experienced in caring for children", cats: ["other"] },
  { id: "elder_care",           label: "Elder Care",    emoji: "🧓", desc: "Companionship, errands, and support for seniors", cats: ["medical","other"] },
  { id: "medical_background",   label: "Medical",       emoji: "🏥", desc: "Healthcare worker, EMT, nurse, or caregiver experience", cats: ["medical","emergency"] },
  { id: "pet_care",             label: "Pet Care",      emoji: "🐾", desc: "Dog walking, pet sitting, animal care", cats: ["other"] },
  // Food & Farm
  { id: "grocery_shopping",     label: "Grocery Shopping", emoji: "🛒", desc: "Experienced shopper who knows how to get the most for a budget", cats: ["groceries"] },
  { id: "cooking",              label: "Cooking",       emoji: "🍳", desc: "Meal prep, cooking for families, food handling certified", cats: ["other","event_setup"] },
  { id: "food_handler",         label: "Food Handler",  emoji: "🍽️", desc: "Safe food preparation and handling certified", cats: ["errands","event_setup","local_farm"] },
  // Community & Language
  { id: "bilingual",            label: "Bilingual",     emoji: "🌐", desc: "Spanish, Swahili, Somali, or other language support", cats: ["groceries","errands","medical"] },
  { id: "translation",          label: "Translation",   emoji: "🌍", desc: "Interpretation and document translation services", cats: ["other","medical","errands"] },
  { id: "tutoring",             label: "Tutoring",      emoji: "📚", desc: "Academic help for kids and adults", cats: ["other"] },
  { id: "tech_support",         label: "Tech Support",  emoji: "💻", desc: "Computer setup, smartphone help, device troubleshooting", cats: ["tech_support"] },
];

const CAT_LABELS: Record<string, string> = {
  groceries: "Groceries", transportation: "Transport", errands: "Errands",
  home_repair: "Home Repair", medical: "Medical", emergency: "Emergency",
  stock_shelves: "Stocking", event_setup: "Events", delivery_run: "Delivery",
  tech_support: "Tech", other: "General",
  local_farm: "Farm Pickup", food_pantry: "Food Pantry",
};

function SkillsMarketplaceTab() {
  const { t } = useTranslation();
  const [active, setActive] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-primary/20 via-primary/5 to-background border border-primary/30 rounded-2xl p-4">
        <h3 className="font-black text-sm flex items-center gap-2 mb-1">
          <Wrench className="w-4 h-4 text-primary" /> {t("community.skills_directory")}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t("community.helpers_tag_their_specialties_so_requesters")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {SKILLS_DIRECTORY.map(skill => (
          <motion.button
            key={skill.id}
            onClick={() => setActive(active === skill.id ? null : skill.id)}
            whileTap={{ scale: 0.97 }}
            className={`text-left rounded-2xl border p-3 transition-all ${
              active === skill.id ? "border-primary/60 bg-primary/10" : "border-border bg-card hover:border-primary/30"
            }`}
          >
            <div className="text-2xl mb-1.5">{skill.emoji}</div>
            <div className="font-black text-xs">{skill.label}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{skill.desc}</div>
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {active && SKILLS_DIRECTORY.find(s => s.id === active) && (() => {
          const skill = SKILLS_DIRECTORY.find(s => s.id === active)!;
          return (
            <motion.div
              key={skill.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="bg-card border border-primary/30 rounded-2xl p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">{skill.emoji}</span>
                <div>
                  <div className="font-black text-sm">{skill.label}</div>
                  <div className="text-xs text-muted-foreground">{skill.desc}</div>
                </div>
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">{t("community.helps_with")}</div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {skill.cats.map(cat => (
                  <span key={cat} className="text-[10px] font-bold bg-muted border border-border px-2 py-1 rounded-full">
                    {CAT_LABELS[cat] ?? cat}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {t("community.add_this_skill_in_profile_settings")}
              </p>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      <div className="bg-card/50 border border-dashed border-border rounded-2xl p-4 text-center">
        <Award className="w-5 h-5 text-primary/40 mx-auto mb-2" />
        <div className="text-sm font-bold text-muted-foreground">{t("community.add_skills_in_profile_settings")}</div>
        <div className="text-xs text-muted-foreground/60 mt-1">{t("community.skillmatched_helpers_get_priority_in_dispatch")}</div>
      </div>
    </div>
  );
}

export default function CommunityScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("feed");
  const [likedPosts, setLikedPosts] = useState<Set<number>>(new Set());
  const [posts, setPosts] = useState<GratitudePost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [pendingNotice, setPendingNotice] = useState(false);

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  // Load initial gratitude posts from API
  useEffect(() => {
    fetch(`${base}/api/gratitude`)
      .then(r => r.json())
      .then((data: GratitudePost[]) => {
        setPosts(data);
        setPostsLoading(false);
      })
      .catch(() => setPostsLoading(false));
  }, []);

  // Real-time: new gratitude post arrives
  useWebSocket("new_gratitude", (event) => {
    const post = event.payload as GratitudePost;
    setPosts(prev => [post, ...prev.slice(0, 49)]);
  });

  // Real-time: like count update
  useWebSocket("gratitude_liked", (event) => {
    const { id, likes } = event.payload as { id: number; likes: number };
    setPosts(prev => prev.map(p => p.id === id ? { ...p, likes } : p));
  });

  const { data: recentCompleted = [] } = useGetRequests(
    { status: "completed" },
    { query: { queryKey: getGetRequestsQueryKey({ status: "completed" }), staleTime: 60000 } }
  );

  const { data: stats } = useGetRequestStats({
    query: { queryKey: getGetRequestStatsQueryKey(), staleTime: 30000 }
  });

  const totalPledgeVolume = stats?.total_pledge_volume ?? 0;
  const poolTarget = 500;
  const poolPct = Math.min(Math.round((totalPledgeVolume / poolTarget) * 100), 100);

  const toggleLike = (id: number) => {
    setLikedPosts(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Fire-and-forget — WS event will broadcast the updated count
        fetch(`${base}/api/gratitude/${id}/like`, { method: "POST", headers: authHeaders() }).catch(() => {});
      }
      return next;
    });
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "feed",      label: "💙 Feed" },
    { key: "circles",   label: "🏘️ Circles" },
    { key: "skills",    label: "🔧 Skills" },
    { key: "heroes",    label: "⭐ Heroes" },
    { key: "pool",      label: "🏦 Pool" },
    { key: "impact",    label: "📊 Impact" },
    { key: "resources", label: "🏛️ Resources" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col pb-24">
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl border-b border-border p-4 pt-safe">
        <h1 className="text-xl font-black uppercase tracking-widest flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" /> {t("community.community")}
        </h1>
        <div className="flex gap-1 mt-3 overflow-x-auto pb-1 scrollbar-none">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-4 max-w-lg mx-auto w-full">

        {/* FEED TAB */}
        {tab === "feed" && (
          <div className="space-y-4">
            {recentCompleted.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">{t("community.recent_help")}</h3>
                {recentCompleted.slice(0, 3).map(req => (
                  <div key={req.id} className="bg-card border border-border rounded-xl p-3.5 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                      <Heart className="w-4 h-4 text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{req.title}</div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <span className="text-green-400 font-bold">{t("community.completed")}</span>
                        <span>·</span>
                        <span>{req.requester_name}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <CommunityPostComposer
              onPosted={(post: NewCommunityPost) => {
                if (post.moderation_status === "approved") {
                  setPosts(prev => [post as GratitudePost, ...prev.slice(0, 49)]);
                } else {
                  setPendingNotice(true);
                  setTimeout(() => setPendingNotice(false), 4000);
                }
              }}
            />
            {pendingNotice && (
              <div className="text-xs text-center text-muted-foreground bg-muted rounded-xl py-2 px-3">
                📋 Your post is awaiting a quick review before it goes live.
              </div>
            )}
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">{t("community.gratitude_amp_stories")}</h3>
            {postsLoading ? (
              <div className="flex justify-center items-center py-10">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                >
                  <Heart className="w-6 h-6 text-primary/40" />
                </motion.div>
              </div>
            ) : posts.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Heart className="w-8 h-8 text-muted-foreground/30" />
                <div className="text-sm text-muted-foreground leading-relaxed">
                  {t("community.no_gratitude_posts_yet")}<br />
                  <span className="text-primary font-semibold">{t("community.complete_a_request")}</span> {t("community.to_add_the_first_one")}
                </div>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {posts.map(post => (
                  <motion.div
                    key={post.id}
                    initial={{ opacity: 0, y: -16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-card border border-border rounded-2xl p-4"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center border border-border shrink-0">
                        <span className="text-sm font-black text-muted-foreground">
                          {post.author_name[0]?.toUpperCase() ?? "?"}
                        </span>
                      </div>
                      <div>
                        <div className="font-bold text-sm">{post.author_name}</div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1 flex-wrap">
                          {post.helper_name && (
                            <>
                              <span className="text-primary font-medium">{t("community.thanks_to")} {post.helper_name}</span>
                              <span>·</span>
                            </>
                          )}
                          <span>{new Date(post.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                        </div>
                      </div>
                    </div>
                    {post.post_type && post.post_type !== "thanks" && (
                      <div className="text-[10px] font-semibold text-muted-foreground bg-muted rounded-lg px-2 py-1 mb-2.5 inline-block">
                        {post.post_type === "offer" && "✨ Offering help"}
                        {post.post_type === "resource" && "📍 Resource"}
                        {post.post_type === "update" && "📣 Update"}
                      </div>
                    )}
                    {post.request_title && (
                      <div className="text-[10px] font-semibold text-primary/80 bg-primary/10 rounded-lg px-2 py-1 mb-2.5 inline-block max-w-full truncate">
                        📋 {post.request_title}
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground leading-relaxed mb-3">"{post.message}"</p>
                    {post.photo_url && (
                      <img src={post.photo_url} alt="" className="w-full max-h-64 object-cover rounded-xl border border-border mb-3" />
                    )}
                    <button
                      onClick={() => toggleLike(post.id)}
                      className={`flex items-center gap-1.5 text-xs transition-colors ${likedPosts.has(post.id) ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
                    >
                      <Heart className={`w-4 h-4 ${likedPosts.has(post.id) ? "fill-current" : ""}`} />
                      {post.likes + (likedPosts.has(post.id) ? 1 : 0)}
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        )}

        {/* HEROES TAB — Live Leaderboard */}
        {tab === "heroes" && <LiveLeaderboard />}

        {/* PAY IT FORWARD POOL TAB */}
        {tab === "pool" && (
          <div className="space-y-4">

            {/* Live pool balance card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-br from-primary/20 via-primary/5 to-background border border-primary/40 rounded-3xl p-6 shadow-[0_0_40px_rgba(0,212,255,0.12)] flex flex-col items-center gap-3"
            >
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-primary" />
              </div>
              <div className="text-center">
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{t("community.community_pool")}</div>
                <div className="text-4xl font-black text-primary mt-1">${totalPledgeVolume.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground mt-1">{t("community.total_paid_forward_by_neighbors")}</div>
              </div>

              {/* Progress to milestone */}
              <div className="w-full">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
                  <span>{t("community.community_milestone")}</span>
                  <span className="font-bold text-primary">{poolPct}{t("community.to")}{poolTarget}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${poolPct}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="h-full bg-gradient-to-r from-primary to-cyan-400 rounded-full"
                  />
                </div>
                <div className="text-[10px] text-muted-foreground mt-1.5 text-center">
                  {t("community.when_we_hit_500_we_unlock")}
                </div>
              </div>
            </motion.div>

            {/* Pool breakdown */}
            <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
              <h3 className="font-black text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" /> {t("community.how_the_pool_is_allocated")}
              </h3>
              {FUND_POOLS.map((pool, i) => (
                <motion.div
                  key={pool.label}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="font-bold">{pool.label}</span>
                    <span className="text-muted-foreground font-mono text-xs">{pool.pct}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pool.pct}%` }}
                      transition={{ duration: 0.8, delay: i * 0.1, ease: "easeOut" }}
                      className={`h-full ${pool.color} rounded-full`}
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground">{pool.description}</div>
                </motion.div>
              ))}
            </div>

            {/* How it works */}
            <div className="bg-card/50 border border-border/50 rounded-2xl p-4">
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                <Heart className="w-4 h-4 text-primary" /> {t("community.how_niakofa_works")}
              </h3>
              <div className="space-y-3">
                {[
                  { step: "1", title: "Get help now", desc: "When you need help, a neighbor shows up — no payment required upfront." },
                  { step: "2", title: "Pay when you're able", desc: "When life gets better, contribute back any amount. 2 days, 2 weeks, or 2 years." },
                  { step: "3", title: "Strengthen the pool", desc: "Every dollar flows into the community reserve, funding future helpers." },
                ].map(item => (
                  <div key={item.step} className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[10px] font-black text-primary">{item.step}</span>
                    </div>
                    <div>
                      <div className="text-sm font-bold">{item.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-bold text-sm text-yellow-400">{t("community.sponsor_a_neighbor")}</div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {t("community.businesses_and_individuals_can_sponsor_the")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* IMPACT TAB — real stats from /api/requests/stats */}
        {tab === "resources" && (
          <CivicResourcesTab />
        )}

        {tab === "impact" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-border rounded-2xl p-5 flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Heart className="w-5 h-5 text-primary" />
                </div>
                <div className="text-3xl font-black text-primary">
                  {stats ? stats.total_completed.toLocaleString() : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{t("community.requests_fulfilled")}</div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-5 flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Users className="w-5 h-5 text-green-400" />
                </div>
                <div className="text-3xl font-black text-green-400">
                  {stats ? stats.total_helpers_online : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{t("community.active_helpers")}</div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-5 flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Activity className="w-5 h-5 text-yellow-400" />
                </div>
                <div className="text-3xl font-black text-yellow-400">
                  {stats ? stats.total_open : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{t("community.open_requests")}</div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-5 flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
                  <DollarSign className="w-5 h-5 text-primary" />
                </div>
                <div className="text-3xl font-black text-primary">
                  ${stats?.total_pledge_volume?.toFixed(0) ?? "0"}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{t("community.paid_forward")}</div>
              </div>
            </div>

            {stats && stats.requests_by_category.length > 0 && (
              <div className="bg-card border border-border rounded-2xl p-4">
                <h3 className="font-black text-sm mb-3 flex items-center gap-2">
                  <Star className="w-4 h-4 text-yellow-400" /> {t("community.by_category")}
                </h3>
                <div className="space-y-2">
                  {[...stats.requests_by_category]
                    .sort((a, b) => b.count - a.count)
                    .map(({ category, count }) => {
                      const total = stats.requests_by_category.reduce((s, c) => s + c.count, 0);
                      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                      return (
                        <div key={category}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-medium">{CATEGORY_LABELS[category] ?? category}</span>
                            <span className="text-muted-foreground">{count} ({pct}%)</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            <div className="bg-gradient-to-br from-primary/20 to-background border border-primary/30 rounded-2xl p-5">
              <h3 className="font-black text-base mb-2">{t("community.about_niakofa")}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t("community.this_isnt_charity_its_neighbors_helping")}
              </p>
              <div className="mt-4 space-y-2">
                {[
                  ["Immediate Pay", "Compensate your helper right away"],
                  ["Niakofa", "Contribute back when you're ready"],
                  ["Goodwill", "Pure community — no payment needed"],
                ].map(([title, desc]) => (
                  <div key={title} className="flex items-center gap-2 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    <span className="font-semibold">{title}</span>
                    <span className="text-muted-foreground">— {desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "circles" && <NeighborhoodCirclesTab />}
        {tab === "skills" && <SkillsMarketplaceTab />}
      </div>
    </div>
  );
}
