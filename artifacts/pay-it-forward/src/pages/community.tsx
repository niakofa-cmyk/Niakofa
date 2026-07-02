import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNiaStory } from "@/hooks/useNiaStory";
import { authHeaders } from "@/lib/auth";
import { useAppContext } from "@/lib/AppContext";
import LiveLeaderboard from "@/components/LiveLeaderboard";
import { Users, Heart, Star, Sparkles, Activity, DollarSign, Shield, PlusCircle, X, Send, ChevronDown, MapPin, Award, Wrench, Globe, Mic, MicOff, Loader2, CheckCircle2, RefreshCw, Clock } from "lucide-react";
import { useGetRequests, useGetRequestStats, getGetRequestsQueryKey, getGetRequestStatsQueryKey, useGetPoolStats, getGetPoolStatsQueryKey, useGetPoolLedger, getGetPoolLedgerQueryKey, useContributeToPool } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { useWebSocket } from "@/lib/useWebSocket";
import { useGetSponsorHistory } from "@/hooks/useGetSponsorHistory";
import { StripePaymentModal } from "@/components/StripePaymentModal";

interface GratitudePost {
  id: number;
  author_name: string;
  author_avatar?: string | null;
  helper_name?: string | null;
  message: string;
  request_title?: string | null;
  likes: number;
  created_at: string;
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
  childcare: "👶", education: "📚", local_farm: "🍎", other: "💙",
};

interface SuggestionForm {
  name: string;
  category: string;
  description: string;
  phone: string;
  website: string;
}

function CivicResourcesTab() {
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
      <div className="font-bold text-sm text-muted-foreground">No resources listed yet</div>
      <div className="text-xs text-muted-foreground/60 mt-1">Community resources will appear here</div>
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
                    📞 Call
                  </a>
                )}
                {r.website && (
                  <a href={r.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground font-bold bg-muted border border-border px-3 py-1.5 rounded-full active:scale-95 transition-all">
                    🌐 Website
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
        Know a resource we're missing? Suggest it
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
              className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-3xl max-h-[80dvh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 pb-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-primary" />
                  <h3 className="font-black text-lg">Suggest a Resource</h3>
                </div>
                <button onClick={() => setShowSuggest(false)} className="p-2 rounded-full hover:bg-muted transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {suggestionSent ? (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-3">🙏</div>
                    <div className="font-black text-lg">Thank you!</div>
                    <p className="text-sm text-muted-foreground mt-1">Your suggestion will be reviewed by the Niakofa team.</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Organization Name *</label>
                      <input
                        className="mt-1.5 w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
                        placeholder="e.g. Tarrant County Food Bank"
                        value={suggestion.name}
                        onChange={e => setSuggestion(s => ({ ...s, name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Category</label>
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
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Description</label>
                      <textarea
                        className="mt-1.5 w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-primary transition-colors min-h-[80px] resize-none"
                        placeholder="What services do they provide?"
                        value={suggestion.description}
                        onChange={e => setSuggestion(s => ({ ...s, description: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Phone</label>
                        <input
                          className="mt-1.5 w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
                          placeholder="(817) 555-0000"
                          value={suggestion.phone}
                          onChange={e => setSuggestion(s => ({ ...s, phone: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Website</label>
                        <input
                          className="mt-1.5 w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
                          placeholder="https://..."
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
                      Submit Suggestion
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

const FORT_WORTH_NEIGHBORHOODS = [
  { id: "southside",       name: "Southside",         emoji: "🏘️", description: "Historic community south of downtown" },
  { id: "near_southside",  name: "Near Southside",    emoji: "🌳", description: "Creative district near Magnolia Ave" },
  { id: "polytechnic",     name: "Polytechnic",       emoji: "🎓", description: "Home of Texas Wesleyan University" },
  { id: "riverside",       name: "Riverside",         emoji: "🌊", description: "Diverse neighborhood along the Trinity River" },
  { id: "downtown",        name: "Downtown",          emoji: "🏙️", description: "Urban core of Fort Worth" },
  { id: "east_fort_worth", name: "East Fort Worth",   emoji: "🌅", description: "Working-class roots and tight-knit community" },
  { id: "north_fort_worth",name: "North Fort Worth",  emoji: "🤠", description: "Stockyards district and growing suburbs" },
  { id: "stop_six",        name: "Stop Six",          emoji: "✊", description: "Resilient community with deep history" },
  { id: "wedgwood",        name: "Wedgwood",          emoji: "🏡", description: "Family-friendly neighborhood in southwest FW" },
];

function NeighborhoodCirclesTab() {
  const [selected, setSelected] = useState<string | null>(null);
  const { currentUser } = useAppContext();
  const userHood = currentUser?.neighborhood?.toLowerCase().replace(/\s+/g, "_");

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-primary/20 via-primary/5 to-background border border-primary/30 rounded-2xl p-4">
        <h3 className="font-black text-sm flex items-center gap-2 mb-1">
          <MapPin className="w-4 h-4 text-primary" /> Neighborhood Circles
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Your circle connects you with neighbors. Requests from your circle appear first on the map. "My neighbors helped me" — that's the power of local belonging.
        </p>
      </div>

      {FORT_WORTH_NEIGHBORHOODS.map(hood => {
        const isYours = userHood === hood.id || currentUser?.neighborhood?.toLowerCase() === hood.name.toLowerCase();
        const isOpen = selected === hood.id;
        return (
          <motion.div
            key={hood.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`bg-card border rounded-2xl p-4 cursor-pointer transition-all ${
              isYours ? "border-primary/60 bg-primary/5" : "border-border hover:border-primary/30"
            }`}
            onClick={() => setSelected(isOpen ? null : hood.id)}
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
                      Your Circle
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

      <div className="bg-card/50 border border-dashed border-border rounded-2xl p-4 text-center">
        <Globe className="w-6 h-6 text-primary/40 mx-auto mb-2" />
        <div className="text-sm font-bold text-muted-foreground">Circle chat &amp; leaderboards coming soon</div>
        <div className="text-xs text-muted-foreground/60 mt-1">Your neighborhood, your impact, your leaderboard</div>
      </div>
    </div>
  );
}

const SKILLS_DIRECTORY = [
  { id: "bilingual",            label: "Bilingual",    emoji: "🌐", desc: "Spanish, Vietnamese, or other language support", cats: ["groceries","errands","medical"] },
  { id: "truck_owner",          label: "Truck Owner",  emoji: "🚛", desc: "Move furniture, haul supplies, or transport large items", cats: ["transportation","errands","stock_shelves"] },
  { id: "medical_background",   label: "Medical",      emoji: "🏥", desc: "Healthcare worker, EMT, nurse, or caregiver experience", cats: ["medical","emergency"] },
  { id: "licensed_electrician", label: "Electrician",  emoji: "⚡", desc: "Safe assistance with electrical needs and home repairs", cats: ["home_repair"] },
  { id: "licensed_plumber",     label: "Plumber",      emoji: "🔧", desc: "Pipe repairs, leak fixes, and plumbing emergencies", cats: ["home_repair"] },
  { id: "carpenter",            label: "Carpenter",    emoji: "🪚", desc: "Woodworking, furniture assembly, and construction", cats: ["home_repair","event_setup"] },
  { id: "tech_support",         label: "Tech Support", emoji: "💻", desc: "Computer setup, smartphone help, device troubleshooting", cats: ["tech_support"] },
  { id: "cdl_driver",           label: "CDL Driver",   emoji: "🚚", desc: "Commercial driver's license — large vehicle expertise", cats: ["transportation","delivery_run"] },
  { id: "food_handler",         label: "Food Handler", emoji: "🍽️", desc: "Safe food preparation and handling certified", cats: ["errands","event_setup"] },
  { id: "childcare",            label: "Childcare",    emoji: "👶", desc: "Experienced in caring for children", cats: ["other"] },
];

const CAT_LABELS: Record<string, string> = {
  groceries: "Groceries", transportation: "Transport", errands: "Errands",
  home_repair: "Home Repair", medical: "Medical", emergency: "Emergency",
  stock_shelves: "Stocking", event_setup: "Events", delivery_run: "Delivery",
  tech_support: "Tech", other: "General",
};

function SkillsMarketplaceTab() {
  const [active, setActive] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-primary/20 via-primary/5 to-background border border-primary/30 rounded-2xl p-4">
        <h3 className="font-black text-sm flex items-center gap-2 mb-1">
          <Wrench className="w-4 h-4 text-primary" /> Skills Directory
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Helpers tag their specialties so requesters find the right person. Skill-matched requests get dispatch priority.
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
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Helps With</div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {skill.cats.map(cat => (
                  <span key={cat} className="text-[10px] font-bold bg-muted border border-border px-2 py-1 rounded-full">
                    {CAT_LABELS[cat] ?? cat}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Add this skill in Profile → Settings to get matched with relevant requests automatically.
              </p>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      <div className="bg-card/50 border border-dashed border-border rounded-2xl p-4 text-center">
        <Award className="w-5 h-5 text-primary/40 mx-auto mb-2" />
        <div className="text-sm font-bold text-muted-foreground">Add skills in Profile Settings</div>
        <div className="text-xs text-muted-foreground/60 mt-1">Skill-matched helpers get priority in dispatch</div>
      </div>
    </div>
  );
}

// ── Phase 7c: NiaStoryModal ────────────────────────────────────────────────
function NiaStoryModal({ onClose, onPosted }: { onClose: () => void; onPosted: (story: string) => void }) {
  const { currentUser } = useAppContext();
  const userName = currentUser?.name ?? "A neighbor";
  const { state, story, error, transcript, startRecording, stopAndSubmit, reset } = useNiaStory(userName);

  const [posting, setPosting] = React.useState(false);
  const [postError, setPostError] = React.useState<string | null>(null);

  const handlePost = async () => {
    if (!story || !currentUser) return;
    setPosting(true);
    setPostError(null);
    try {
      const res = await fetch("/api/gratitude", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          message: story.story,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as any;
        throw new Error(data.error ?? `Post failed (${res.status})`);
      }
      onPosted(story.story);
      onClose();
    } catch (err: any) {
      setPostError(err.message ?? "Failed to post story. Try again.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-background rounded-t-3xl p-6 pb-10 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="font-black text-base">Share Your Story</div>
            <div className="text-xs text-muted-foreground">Nia will polish your words into a community post</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>

        {state === "idle" && (
          <button
            onClick={startRecording}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-2xl py-4 font-bold text-sm"
          >
            <Mic className="w-5 h-5" /> Tap to Record
          </button>
        )}

        {state === "recording" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-primary font-semibold">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              Recording… speak naturally
            </div>
            {transcript && <p className="text-xs text-muted-foreground italic leading-relaxed">"{transcript}"</p>}
            <button
              onClick={() => stopAndSubmit()}
              className="w-full flex items-center justify-center gap-2 bg-muted border border-border rounded-2xl py-3 font-bold text-sm"
            >
              <MicOff className="w-4 h-4" /> Done — let Nia craft it
            </button>
          </div>
        )}

        {state === "processing" && (
          <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm">
            <Loader2 className="w-5 h-5 animate-spin" /> Nia is crafting your story…
          </div>
        )}

        {state === "done" && story && (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs text-green-400 font-semibold">
              <CheckCircle2 className="w-4 h-4" /> Nia crafted your story
            </div>
            <div className="bg-muted rounded-2xl p-4 text-sm leading-relaxed text-foreground">
              "{story.story}"
            </div>
            <div className="flex gap-2">
              <button
                onClick={reset}
                className="flex-1 border border-border rounded-2xl py-3 text-sm font-bold text-muted-foreground hover:bg-muted"
              >
                Re-record
              </button>
              <button
                onClick={handlePost}
                disabled={posting}
                className="flex-2 bg-primary text-primary-foreground rounded-2xl px-6 py-3 text-sm font-bold flex items-center gap-2 disabled:opacity-70"
              >
                {posting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Posting…</>
                ) : (
                  <><Send className="w-4 h-4" /> Post to Community</>
                )}
              </button>
              {postError && <p className="text-xs text-destructive mt-1">{postError}</p>}
            </div>
          </div>
        )}

        {state === "error" && (
          <div className="space-y-3">
            <div className="text-xs text-destructive">{error ?? "Something went wrong."}</div>
            <button onClick={reset} className="w-full border border-border rounded-2xl py-3 text-sm font-bold">Try Again</button>
          </div>
        )}
      </div>
    </div>
  );
}


export default function CommunityScreen() {
  const [tab, setTab] = useState<Tab>("feed");
  const [showNiaStory, setShowNiaStory] = useState(false);
  const [likedPosts, setLikedPosts] = useState<Set<number>>(new Set());
  const [posts, setPosts] = useState<GratitudePost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const { currentUser } = useAppContext();
  const sponsorHistory = useGetSponsorHistory(currentUser?.id ?? null);

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

  // ── Community Pool: live stats, transparency ledger, contribute flow ──────
  const { data: poolStats, refetch: refetchPoolStats } = useGetPoolStats({
    query: { queryKey: getGetPoolStatsQueryKey(), staleTime: 15000 }
  });
  const { data: poolLedger, refetch: refetchPoolLedger } = useGetPoolLedger(
    { limit: 15 },
    { query: { queryKey: getGetPoolLedgerQueryKey({ limit: 15 }), staleTime: 15000 } }
  );
  const contributeMutation = useContributeToPool();
  const [contributeAmount, setContributeAmount] = useState("");
  const [contributeMsg, setContributeMsg] = useState<string | null>(null);
  const [contributeSecret, setContributeSecret] = useState<string | null>(null);

  useWebSocket("pool_updated", () => { refetchPoolStats(); refetchPoolLedger(); });
  useWebSocket("pool_front_paid", () => { refetchPoolStats(); refetchPoolLedger(); });

  const submitContribution = async () => {
    const amt = parseFloat(contributeAmount);
    if (!Number.isFinite(amt) || amt < 1) {
      setContributeMsg("Enter an amount of $1 or more.");
      return;
    }
    setContributeMsg(null);
    try {
      const result = await contributeMutation.mutateAsync({ data: { amount: amt } });
      if (result.mode === "stripe" && result.client_secret) {
        setContributeSecret(result.client_secret);
      } else {
        setContributeMsg(`Thank you! $${amt.toFixed(2)} added to the pool. 💙`);
        setContributeAmount("");
        refetchPoolStats();
        refetchPoolLedger();
      }
    } catch {
      setContributeMsg("Contribution failed. Please try again.");
    }
  };

  const poolBalance = poolStats?.balance ?? 0;
  const poolTarget = 500;
  const poolPct = Math.min(Math.round((poolBalance / poolTarget) * 100), 100);

  const toggleLike = (id: number) => {
    setLikedPosts(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Fire-and-forget — WS event will broadcast the updated count.
        // Auth header required now that /like enforces per-user identity
        // (gratitude_likes unique index) instead of a raw open counter.
        fetch(`${base}/api/gratitude/${id}/like`, { method: "POST", headers: { ...authHeaders() } }).catch(() => {});
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
          <Users className="w-5 h-5 text-primary" /> Community
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
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Recent Help</h3>
                {recentCompleted.slice(0, 3).map(req => (
                  <div key={req.id} className="bg-card border border-border rounded-xl p-3.5 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                      <Heart className="w-4 h-4 text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{req.title}</div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <span className="text-green-400 font-bold">✓ Completed</span>
                        <span>·</span>
                        <span>{req.requester_name}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Gratitude &amp; Stories</h3>
              <button
                onClick={() => setShowNiaStory(true)}
                className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-full transition-colors"
              >
                <Mic className="w-3.5 h-3.5" /> Share with Nia
              </button>
            </div>
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
                  No gratitude posts yet.<br />
                  <span className="text-primary font-semibold">Complete a request</span> to add the first one!
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
                              <span className="text-primary font-medium">Thanks to {post.helper_name}</span>
                              <span>·</span>
                            </>
                          )}
                          <span>{new Date(post.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                        </div>
                      </div>
                    </div>
                    {post.request_title && (
                      <div className="text-[10px] font-semibold text-primary/80 bg-primary/10 rounded-lg px-2 py-1 mb-2.5 inline-block max-w-full truncate">
                        📋 {post.request_title}
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground leading-relaxed mb-3">"{post.message}"</p>
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

        {showNiaStory && (
          <NiaStoryModal
            onClose={() => setShowNiaStory(false)}
            onPosted={(_story: string) => {
              setShowNiaStory(false);
              // Re-fetch gratitude posts so the new story appears immediately
              const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
              fetch(`${base}/api/gratitude`)
                .then(r => r.json())
                .then((data: GratitudePost[]) => setPosts(data))
                .catch(() => {});
            }}
          />
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
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Community Pool</div>
                <div className="text-4xl font-black text-primary mt-1">${poolBalance.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Available now to pay helpers instantly
                </div>
                {poolStats && poolStats.guaranteed_minimum > 0 && (
                  <div className="text-[10px] text-green-400 font-bold mt-1">
                    ✓ ${poolStats.guaranteed_minimum.toFixed(2)} guaranteed minimum per completed task
                  </div>
                )}
              </div>

              {/* Progress to milestone */}
              <div className="w-full">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
                  <span>Community milestone</span>
                  <span className="font-bold text-primary">{poolPct}% to ${poolTarget}</span>
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
                  When we hit $500, we unlock the Emergency Assistance Reserve 🏦
                </div>
              </div>
            </motion.div>

            {/* Pool flow — real numbers */}
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <h3 className="font-black text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" /> Where the Money Goes
              </h3>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { label: "Contributed", value: poolStats?.total_contributed ?? 0, color: "text-green-400", desc: "From sponsors & neighbors" },
                  { label: "Paid to Helpers", value: (poolStats?.total_fronted ?? 0) + (poolStats?.total_minimums ?? 0), color: "text-primary", desc: "Fronted instantly at completion" },
                  { label: "Repaid to Pool", value: poolStats?.total_repaid ?? 0, color: "text-cyan-400", desc: "Requesters paying it forward" },
                  { label: "Helpers Backed", value: poolStats?.helpers_fronted ?? 0, color: "text-yellow-400", desc: "Neighbors paid by the pool", isCount: true },
                ].map((item) => (
                  <div key={item.label} className="bg-background/60 rounded-xl px-3 py-2.5">
                    <div className={`text-lg font-black ${item.color}`}>
                      {item.isCount ? item.value : `$${Number(item.value).toFixed(2)}`}
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-wider">{item.label}</div>
                    <div className="text-[9px] text-muted-foreground mt-0.5">{item.desc}</div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                When a pay-it-forward request completes, the pool pays the helper immediately — no waiting on the requester. When the requester later pays it forward, the money flows back into the pool for the next neighbor.
              </p>
            </div>

            {/* Transparency ledger */}
            {poolLedger && poolLedger.entries.length > 0 && (
              <div className="bg-card border border-border rounded-2xl p-4 space-y-2.5">
                <h3 className="font-black text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" /> Pool Activity
                </h3>
                {poolLedger.entries.map((entry) => {
                  const meta: Record<string, { icon: string; label: string }> = {
                    sponsor_contribution: { icon: "💛", label: entry.display_name ? `${entry.display_name} funded the pool` : "Pool contribution" },
                    helper_front: { icon: "⚡", label: "Helper paid instantly at completion" },
                    pledge_repayment: { icon: "🔄", label: "Pledge repaid — pool replenished" },
                    guaranteed_minimum: { icon: "💙", label: "Guaranteed minimum paid to a helper" },
                    adjustment: { icon: "🛠️", label: "Pool adjustment" },
                  };
                  const m = meta[entry.entry_type] ?? { icon: "💙", label: "Pool activity" };
                  const positive = entry.amount >= 0;
                  return (
                    <div key={entry.id} className="flex items-center gap-2.5 bg-background/60 rounded-xl px-3 py-2">
                      <div className="text-base shrink-0">{m.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold truncate">{m.label}</div>
                        <div className="text-[9px] text-muted-foreground">
                          {new Date(entry.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </div>
                      </div>
                      <div className={`text-xs font-black shrink-0 ${positive ? "text-green-400" : "text-primary"}`}>
                        {positive ? "+" : "−"}${Math.abs(entry.amount).toFixed(2)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* How it works */}
            <div className="bg-card/50 border border-border/50 rounded-2xl p-4">
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                <Heart className="w-4 h-4 text-primary" /> How Niakofa Works
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

            {/* Sponsor Portal — contribution history */}
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-yellow-400 shrink-0" />
                  <div className="font-bold text-sm text-yellow-400">Sponsor a Neighbor</div>
                </div>
                {sponsorHistory.loading && <RefreshCw className="w-3 h-3 text-yellow-400/60 animate-spin" />}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Businesses and individuals can sponsor the community pool directly. Your contributions go directly to helpers serving Fort Worth neighbors.
              </p>

              {/* Contribute to the pool */}
              {currentUser && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <DollarSign className="w-4 h-4 text-yellow-400/60 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="number"
                        inputMode="decimal"
                        min={1}
                        max={10000}
                        placeholder="Amount"
                        value={contributeAmount}
                        onChange={(e) => setContributeAmount(e.target.value)}
                        className="w-full bg-background/60 border border-yellow-500/30 rounded-xl pl-9 pr-3 py-2.5 text-base font-bold focus:outline-none focus:border-yellow-400/60"
                      />
                    </div>
                    <button
                      onClick={submitContribution}
                      disabled={contributeMutation.isPending}
                      className="shrink-0 bg-yellow-400 text-black font-black text-xs uppercase tracking-wider rounded-xl px-4 py-2.5 active:scale-95 transition-transform disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {contributeMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Heart className="w-3.5 h-3.5" />}
                      Fund the Pool
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    {[5, 10, 25, 50].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setContributeAmount(String(amt))}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                          contributeAmount === String(amt)
                            ? "bg-yellow-400/20 border-yellow-400/60 text-yellow-400"
                            : "bg-background/40 border-border text-muted-foreground"
                        }`}
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>
                  {contributeMsg && (
                    <div className={`text-xs rounded-xl px-3 py-2 ${
                      contributeMsg.startsWith("Thank")
                        ? "text-green-400 bg-green-500/10"
                        : "text-destructive/80 bg-destructive/10"
                    }`}>
                      {contributeMsg}
                    </div>
                  )}
                </div>
              )}

              {/* Contribution history */}
              {currentUser ? (
                <>
                  {sponsorHistory.error && (
                    <div className="text-xs text-destructive/80 bg-destructive/10 rounded-xl px-3 py-2">
                      Could not load history: {sponsorHistory.error}
                    </div>
                  )}
                  {!sponsorHistory.loading && sponsorHistory.data.length === 0 && !sponsorHistory.error && (
                    <div className="text-center py-4">
                      <DollarSign className="w-7 h-7 mx-auto mb-1.5 text-yellow-400/30" />
                      <p className="text-xs text-muted-foreground">No contributions yet</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">Pay-it-forward requests appear here</p>
                    </div>
                  )}
                  {sponsorHistory.data.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Your Contributions</div>
                      {sponsorHistory.data.slice(0, 5).map(entry => (
                        <div key={entry.id} className="flex items-center gap-2.5 bg-background/60 rounded-xl px-3 py-2">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            entry.state === "completed" ? "bg-green-500/10" : "bg-yellow-500/10"
                          }`}>
                            {entry.state === "completed"
                              ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                              : <Clock className="w-3.5 h-3.5 text-yellow-400" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold truncate">
                              {entry.request_title ?? "Community contribution"}
                            </div>
                            <div className="text-[10px] text-muted-foreground capitalize">
                              {entry.request_category?.replace(/_/g, " ") ?? entry.payment_type?.replace(/_/g, " ")}
                              {entry.sponsored_by && ` · via ${entry.sponsored_by}`}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs font-black text-yellow-400">${entry.amount.toFixed(2)}</div>
                            <div className="text-[9px] text-muted-foreground">
                              {new Date(entry.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </div>
                          </div>
                        </div>
                      ))}
                      {sponsorHistory.data.length > 5 && (
                        <div className="text-center text-[10px] text-muted-foreground pt-1">
                          +{sponsorHistory.data.length - 5} more contributions
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-muted-foreground text-center py-2">
                  Sign in to view your contribution history
                </div>
              )}
            </div>

            {/* Stripe payment sheet for pool contributions */}
            {contributeSecret && (
              <StripePaymentModal
                clientSecret={contributeSecret}
                amount={parseFloat(contributeAmount) || 0}
                description="Community Pool contribution"
                onSuccess={() => {
                  setContributeSecret(null);
                  setContributeMsg("Thank you! Your contribution is on its way to the pool. 💙");
                  setContributeAmount("");
                  setTimeout(() => { refetchPoolStats(); refetchPoolLedger(); }, 2500);
                }}
                onSkip={() => setContributeSecret(null)}
                onClose={() => setContributeSecret(null)}
              />
            )}
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
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Requests Fulfilled</div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-5 flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Users className="w-5 h-5 text-green-400" />
                </div>
                <div className="text-3xl font-black text-green-400">
                  {stats ? stats.total_helpers_online : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Active Helpers</div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-5 flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Activity className="w-5 h-5 text-yellow-400" />
                </div>
                <div className="text-3xl font-black text-yellow-400">
                  {stats ? stats.total_open : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Open Requests</div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-5 flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
                  <DollarSign className="w-5 h-5 text-primary" />
                </div>
                <div className="text-3xl font-black text-primary">
                  ${stats?.total_pledge_volume?.toFixed(0) ?? "0"}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Paid Forward</div>
              </div>
            </div>

            {stats && stats.requests_by_category.length > 0 && (
              <div className="bg-card border border-border rounded-2xl p-4">
                <h3 className="font-black text-sm mb-3 flex items-center gap-2">
                  <Star className="w-4 h-4 text-yellow-400" /> By Category
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
              <h3 className="font-black text-base mb-2">About Niakofa</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                This isn't charity — it's neighbors helping neighbors. Every act of help strengthens our community network. When you're able, give back. When you need help, ask. That's how communities thrive.
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
