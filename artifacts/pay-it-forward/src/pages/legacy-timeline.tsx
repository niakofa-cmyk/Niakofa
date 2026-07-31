/**
 * Legacy Timeline — Family memories organized chronologically
 * Route: /diaspora/timeline
 *
 * Enhanced with:
 *  - Rich visual timeline with decade groupings and colored event markers
 *  - Historical context per decade (African American history)
 *  - Demo "Davis Family" data when no real events exist
 *  - Add Event modal (POST /api/family/:id/timeline)
 *  - Event type inference from title keywords
 *  - Skeleton loading cards
 *  - Nia AI integration panel
 *  - Search and event-type filter
 */

import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, History, Calendar, MapPin, Loader2, ChevronRight,
  BookHeart, Mic, FileText, Shield, GraduationCap, Users, Camera,
  Building2, ArrowRight, Plus, X, Search, Sparkles, Star,
  User, Scroll,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "sonner";

interface TimelineEvent {
  id: number;
  year: number | null;
  date: string | null;
  title: string;
  description: string | null;
  location: string | null;
  type: string;
  event_type: string | null;
  memory_id: number;
  family_id: number;
}

// ── Demo data (Davis Family, matching the reference image) ─────────────────
const DEMO_EVENTS: TimelineEvent[] = [
  { id: -1, year: 1872, date: "1872-01-01", title: "Land Deed Recorded", description: "The Davis family recorded their first land deed — a cornerstone of their legacy in Tarrant County.", location: "Tarrant County, TX", type: "import", event_type: "land_deed", memory_id: -1, family_id: 0 },
  { id: -2, year: 1900, date: "1900-01-01", title: "Robert Davis Born", description: "Birth of Robert Davis in Fort Worth, Texas — a founding member of the Davis family legacy.", location: "Fort Worth, TX", type: "upload", event_type: "birth", memory_id: -2, family_id: 0 },
  { id: -3, year: 1920, date: "1920-01-01", title: "Great Migration Begins", description: "Family members joined the Great Migration northward, seeking opportunity and freedom during a pivotal era.", location: "Chicago, IL", type: "import", event_type: "migration", memory_id: -3, family_id: 0 },
  { id: -4, year: 1950, date: "1950-01-01", title: "Family Church Founded", description: "The Davis family helped establish their community church — a cornerstone of faith and fellowship.", location: "Fort Worth, TX", type: "upload", event_type: "church", memory_id: -4, family_id: 0 },
  { id: -5, year: 1960, date: "1960-01-01", title: "Family Reunion Photo", description: "The first documented Davis family reunion — generations gathered together in Fort Worth.", location: "Fort Worth, TX", type: "upload", event_type: "reunion", memory_id: -5, family_id: 0 },
  { id: -6, year: 2023, date: "2023-01-01", title: "Oral History Recorded", description: "Grandma Ruth's interview was recorded and preserved — her voice will carry forward for generations.", location: "Fort Worth, TX", type: "interview", event_type: "oral_history", memory_id: -6, family_id: 0 },
];

// ── Historical context per decade ──────────────────────────────────────────
const HISTORICAL_CONTEXT: Record<string, string> = {
  "1860s": "Post-Civil War Reconstruction era",
  "1870s": "Reconstruction ends; Freedmen's Bureau records created",
  "1880s": "Jim Crow laws enacted across the South",
  "1890s": "Plessy v. Ferguson (1896) — 'separate but equal'",
  "1900s": "Great Migration begins; NAACP founded (1909)",
  "1910s": "World War I; Harlem Renaissance begins",
  "1920s": "Harlem Renaissance peaks; Great Migration in full swing",
  "1930s": "Great Depression; New Deal programs emerge",
  "1940s": "World War II; Double Victory Campaign",
  "1950s": "Civil Rights Movement; Brown v. Board of Education (1954)",
  "1960s": "Civil Rights Act (1964); Voting Rights Act (1965)",
  "1970s": "Black Power movement; affirmative action policies",
  "1980s": "Hip-hop culture emerges; crack epidemic impacts communities",
  "1990s": "Million Man March (1995); digital age begins",
  "2000s": "9/11; Barack Obama elected president (2008)",
  "2010s": "Black Lives Matter movement founded (2013)",
  "2020s": "COVID-19 pandemic; George Floyd protests (2020)",
};

// ── Event type config ───────────────────────────────────────────────────────
type EventConfig = {
  color: string; bg: string; border: string; dot: string;
  icon: React.ElementType; label: string;
};

const EVENT_TYPES: Record<string, EventConfig> = {
  birth:       { color: "text-blue-400",    bg: "bg-blue-400/10",    border: "border-blue-400/20",    dot: "bg-blue-400",    icon: User,        label: "Birth"         },
  death:       { color: "text-gray-400",    bg: "bg-gray-400/10",    border: "border-gray-400/20",    dot: "bg-gray-500",    icon: Star,        label: "Passing"       },
  migration:   { color: "text-teal-400",    bg: "bg-teal-400/10",    border: "border-teal-400/20",    dot: "bg-teal-400",    icon: ArrowRight,  label: "Migration"     },
  land_deed:   { color: "text-amber-400",   bg: "bg-amber-400/10",   border: "border-amber-400/20",   dot: "bg-amber-400",   icon: FileText,    label: "Land/Property" },
  military:    { color: "text-green-400",   bg: "bg-green-400/10",   border: "border-green-400/20",   dot: "bg-green-400",   icon: Shield,      label: "Military"      },
  education:   { color: "text-purple-400",  bg: "bg-purple-400/10",  border: "border-purple-400/20",  dot: "bg-purple-400",  icon: GraduationCap, label: "Education"   },
  church:      { color: "text-yellow-400",  bg: "bg-yellow-400/10",  border: "border-yellow-400/20",  dot: "bg-yellow-400",  icon: Building2,   label: "Faith"         },
  reunion:     { color: "text-rose-400",    bg: "bg-rose-400/10",    border: "border-rose-400/20",    dot: "bg-rose-400",    icon: Users,       label: "Reunion"       },
  oral_history:{ color: "text-orange-400",  bg: "bg-orange-400/10",  border: "border-orange-400/20",  dot: "bg-orange-400",  icon: Mic,         label: "Oral History"  },
  interview:   { color: "text-orange-400",  bg: "bg-orange-400/10",  border: "border-orange-400/20",  dot: "bg-orange-400",  icon: Mic,         label: "Interview"     },
  photo:       { color: "text-sky-400",     bg: "bg-sky-400/10",     border: "border-sky-400/20",     dot: "bg-sky-400",     icon: Camera,      label: "Photo"         },
  business:    { color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20", dot: "bg-emerald-400", icon: Scroll,      label: "Business"      },
};

const DEFAULT_CONFIG: EventConfig = {
  color: "text-rose-400", bg: "bg-rose-400/10", border: "border-rose-400/20",
  dot: "bg-rose-400", icon: BookHeart, label: "Memory",
};

function inferEventType(event: TimelineEvent): string {
  if (event.event_type && EVENT_TYPES[event.event_type]) return event.event_type;
  if (event.type === "interview") return "oral_history";
  const t = event.title.toLowerCase();
  if (t.includes("born") || t.includes("birth"))             return "birth";
  if (t.includes("died") || t.includes("death") || t.includes("passed")) return "death";
  if (t.includes("migrat") || t.includes("moved north") || t.includes("great migration")) return "migration";
  if (t.includes("deed") || t.includes("land") || t.includes("property") || t.includes("homestead")) return "land_deed";
  if (t.includes("military") || t.includes("war") || t.includes("veteran") || t.includes("army")) return "military";
  if (t.includes("school") || t.includes("graduat") || t.includes("college") || t.includes("university")) return "education";
  if (t.includes("church") || t.includes("baptist") || t.includes("faith") || t.includes("ame")) return "church";
  if (t.includes("reunion") || t.includes("gathering") || t.includes("family meeting")) return "reunion";
  if (t.includes("oral") || t.includes("interview") || t.includes("recorded") || t.includes("recording")) return "oral_history";
  if (t.includes("photo") || t.includes("picture") || t.includes("portrait") || t.includes("photograph")) return "photo";
  if (t.includes("business") || t.includes("bakery") || t.includes("shop") || t.includes("company")) return "business";
  return "upload";
}

function getEventConfig(event: TimelineEvent): EventConfig {
  const type = inferEventType(event);
  return EVENT_TYPES[type] ?? DEFAULT_CONFIG;
}

const ADD_EVENT_TYPES = [
  { value: "birth",        label: "👶 Birth" },
  { value: "death",        label: "🕊️ Passing" },
  { value: "migration",    label: "🚢 Migration" },
  { value: "land_deed",    label: "📜 Land/Property" },
  { value: "military",     label: "🪖 Military" },
  { value: "education",    label: "🎓 Education" },
  { value: "church",       label: "⛪ Faith" },
  { value: "reunion",      label: "👨‍👩‍👧‍👦 Reunion" },
  { value: "oral_history", label: "🎙️ Oral History" },
  { value: "photo",        label: "📸 Photo" },
  { value: "business",     label: "🏢 Business" },
  { value: "upload",       label: "📝 Other Memory" },
];

const FILTER_TYPES = [
  { value: null,        label: "All" },
  { value: "birth",     label: "Birth" },
  { value: "migration", label: "Migration" },
  { value: "military",  label: "Military" },
  { value: "education", label: "Education" },
  { value: "church",    label: "Faith" },
  { value: "reunion",   label: "Reunion" },
  { value: "oral_history", label: "Stories" },
];

// ── Skeleton placeholder ─────────────────────────────────────────────────
function SkeletonEvent() {
  return (
    <div className="flex gap-3 animate-pulse">
      <div className="flex flex-col items-center">
        <div className="w-3 h-3 rounded-full bg-muted flex-shrink-0 mt-1" />
        <div className="w-0.5 flex-1 bg-muted/40 mt-1" />
      </div>
      <div className="flex-1 pb-4">
        <div className="h-3 w-14 bg-muted rounded mb-2" />
        <div className="bg-card border border-border rounded-xl p-3 space-y-2">
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-3 bg-muted/60 rounded w-1/2" />
          <div className="h-3 bg-muted/40 rounded w-2/3" />
        </div>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function LegacyTimelinePage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [families, setFamilies] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedFamilyId, setSelectedFamilyId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [filterType, setFilterType] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [addForm, setAddForm] = useState({
    title: "", year: "", location: "", description: "", event_type: "upload",
  });
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!currentUser) return;
    loadFamilies();
  }, [currentUser]);

  useEffect(() => {
    if (selectedFamilyId) loadTimeline(selectedFamilyId);
  }, [selectedFamilyId]);

  async function loadFamilies() {
    try {
      const res = await fetch("/api/family/mine", { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const fams: Array<{ id: number; name: string }> = data.families ?? [];
      setFamilies(fams.map(f => ({ id: f.id, name: f.name })));
      if (fams.length > 0) setSelectedFamilyId(fams[0].id);
      else setLoading(false);
    } catch {
      toast.error("Couldn't load families");
      setLoading(false);
    }
  }

  async function loadTimeline(familyId: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/family/${familyId}/timeline`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const real: TimelineEvent[] = ((data.events ?? []) as TimelineEvent[]).map(e => ({
        ...e,
        event_type: e.event_type ?? null,
        family_id: familyId,
      }));
      if (real.length === 0) {
        setIsDemo(true);
        setEvents(DEMO_EVENTS);
      } else {
        setIsDemo(false);
        setEvents(real);
      }
    } catch {
      setIsDemo(true);
      setEvents(DEMO_EVENTS);
      toast.error("Couldn't load timeline — showing example data");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddEvent() {
    if (!addForm.title.trim() || !addForm.year.trim()) {
      toast.error("Title and year are required");
      return;
    }
    const year = parseInt(addForm.year);
    if (isNaN(year) || year < 1600 || year > new Date().getFullYear()) {
      toast.error("Please enter a valid year");
      return;
    }
    if (!selectedFamilyId) {
      toast.error("Please select a family first");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/family/${selectedFamilyId}/timeline`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          title:       addForm.title.trim(),
          year,
          location:    addForm.location.trim() || undefined,
          description: addForm.description.trim() || undefined,
          event_type:  addForm.event_type,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const newEvent: TimelineEvent = {
        ...data.event,
        event_type: addForm.event_type,
        family_id:  selectedFamilyId,
      };
      setEvents(prev =>
        [...prev.filter(e => e.id > 0), newEvent].sort(
          (a, b) => (a.year ?? 9999) - (b.year ?? 9999)
        )
      );
      setIsDemo(false);
      setShowAddModal(false);
      setAddForm({ title: "", year: "", location: "", description: "", event_type: "upload" });
      toast.success("Event added to your timeline!");
    } catch {
      toast.error("Couldn't add event — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground text-sm">Sign in to view your legacy timeline</p>
      </div>
    );
  }

  // ── Filter + search ────────────────────────────────────────────────────
  const filtered = events.filter(e => {
    const matchesSearch = !searchQ || e.title.toLowerCase().includes(searchQ.toLowerCase()) ||
      (e.description ?? "").toLowerCase().includes(searchQ.toLowerCase()) ||
      (e.location ?? "").toLowerCase().includes(searchQ.toLowerCase());
    const matchesType = !filterType || inferEventType(e) === filterType;
    return matchesSearch && matchesType;
  });

  const byDecade = filtered.reduce((acc, e) => {
    const decade = e.year ? `${Math.floor(e.year / 10) * 10}s` : "Unknown";
    if (!acc[decade]) acc[decade] = [];
    acc[decade].push(e);
    return acc;
  }, {} as Record<string, TimelineEvent[]>);

  const sortedDecades = Object.entries(byDecade).sort(([a], [b]) => {
    if (a === "Unknown") return 1;
    if (b === "Unknown") return -1;
    return parseInt(a) - parseInt(b);
  });

  const earliestDecade = sortedDecades.length > 0 ? sortedDecades[0][0] : "—";

  return (
    <div className="min-h-screen bg-background pb-28">

      {/* ── Sticky header ──────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/legacy")} className="p-2 -ml-2 rounded-lg active:bg-muted">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold flex items-center gap-2">
              <History className="w-4 h-4 text-rose-400" />
              Legacy Timeline
            </h1>
            <p className="text-xs text-muted-foreground">
              {isDemo ? "Example — add your own events below" : "Your family story through time"}
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 bg-rose-500 text-white px-3 py-1.5 rounded-xl text-sm font-medium active:opacity-80"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      </div>

      {/* ── Nia AI panel ───────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-primary/5 to-transparent border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-foreground font-medium">Ask Nia about this era in history</p>
            <div className="flex gap-2 mt-1 overflow-x-auto no-scrollbar pb-0.5">
              {[
                "What was life like during the Great Migration?",
                "Tell me about the Civil Rights era in Texas",
                "Who were my ancestors in Fort Worth?",
              ].map(q => (
                <button
                  key={q}
                  onClick={() => (window as any).openNia?.(q)}
                  className="flex-shrink-0 text-[10px] text-primary/80 bg-primary/5 border border-primary/15 px-2 py-1 rounded-full active:opacity-70"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Hero stats ─────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-[#1a0010] via-[#2a0020] to-[#1a0010] border-b border-rose-800/30">
        <div className="max-w-lg mx-auto px-4 py-5">
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-xl font-bold text-rose-300">{events.length}</p>
              <p className="text-[10px] text-rose-400/60 font-medium">Events</p>
            </div>
            <div className="w-px h-8 bg-rose-800/40" />
            <div className="text-center">
              <p className="text-xl font-bold text-rose-300">{sortedDecades.length}</p>
              <p className="text-[10px] text-rose-400/60 font-medium">Decades</p>
            </div>
            <div className="w-px h-8 bg-rose-800/40" />
            <div className="text-center">
              <p className="text-xl font-bold text-rose-300">{earliestDecade}</p>
              <p className="text-[10px] text-rose-400/60 font-medium">Earliest</p>
            </div>
            {isDemo && (
              <div className="ml-auto">
                <span className="text-[10px] bg-rose-400/15 text-rose-400 px-2 py-1 rounded-full border border-rose-400/20">
                  Example
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">

        {/* ── Family selector ────────────────────────────────────────── */}
        {families.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {families.map(f => (
              <button
                key={f.id}
                onClick={() => setSelectedFamilyId(f.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                  selectedFamilyId === f.id
                    ? "bg-rose-500 text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {f.name}
              </button>
            ))}
          </div>
        )}

        {/* ── Search ─────────────────────────────────────────────────── */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            ref={searchRef}
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Search events, people, places…"
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30"
            style={{ fontSize: "16px" }}
          />
          {searchQ && (
            <button onClick={() => setSearchQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-1">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* ── Filter chips ───────────────────────────────────────────── */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {FILTER_TYPES.map(f => (
            <button
              key={f.value ?? "all"}
              onClick={() => setFilterType(f.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
                filterType === f.value
                  ? "bg-rose-500 text-white"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* ── Loading skeletons ────────────────────────────────────────── */}
        {loading && (
          <div className="space-y-0">
            {[0, 1, 2].map(i => <SkeletonEvent key={i} />)}
          </div>
        )}

        {/* ── Empty state ──────────────────────────────────────────────── */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 space-y-3">
            <Calendar className="w-12 h-12 text-rose-400/30 mx-auto" />
            <p className="font-semibold text-sm">
              {searchQ || filterType ? "No matching events" : "No dated memories yet"}
            </p>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              {searchQ || filterType
                ? "Try clearing your filters to see all events."
                : "Add your first timeline event to start building your family's story."}
            </p>
            {!searchQ && !filterType && (
              <button
                onClick={() => setShowAddModal(true)}
                className="bg-rose-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium active:opacity-80"
              >
                Add First Event
              </button>
            )}
          </div>
        )}

        {/* ── Timeline visualization ────────────────────────────────────── */}
        {!loading && filtered.length > 0 && (
          <div className="space-y-0">
            {sortedDecades.map(([decade, decEvents], di) => {
              const historicalNote = HISTORICAL_CONTEXT[decade];
              return (
                <div key={decade}>
                  {/* Decade header */}
                  <div className="flex items-center gap-3 mb-3 pt-2">
                    <div className="w-4 h-4 rounded-full bg-rose-500 border-2 border-background flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-bold text-rose-400">{decade}</span>
                      {historicalNote && (
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5 leading-tight">{historicalNote}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {decEvents.length} {decEvents.length === 1 ? "event" : "events"}
                    </span>
                  </div>

                  {/* Events in this decade */}
                  <div className="ml-2 space-y-0">
                    {decEvents.map((e, ei) => {
                      const cfg = getEventConfig(e);
                      const Icon = cfg.icon;
                      const isLast = di === sortedDecades.length - 1 && ei === decEvents.length - 1;
                      const isDemo_ = e.id < 0;

                      return (
                        <div key={e.id} className="flex gap-3">
                          {/* Timeline line + dot */}
                          <div className="flex flex-col items-center w-5 flex-shrink-0">
                            <div className={`w-2.5 h-2.5 rounded-full mt-3 flex-shrink-0 ${cfg.dot}`} />
                            {!isLast && <div className="w-0.5 flex-1 bg-rose-500/15 mt-1 min-h-[24px]" />}
                          </div>

                          {/* Event card */}
                          <button
                            onClick={() => {
                              if (!isDemo_ && e.family_id > 0) {
                                navigate(`/family/${e.family_id}/memory/${e.memory_id}`);
                              }
                            }}
                            className={`flex-1 text-left rounded-xl border p-3 mb-3 transition-opacity ${
                              isDemo_ ? "opacity-75 cursor-default" : "active:opacity-70"
                            } ${cfg.bg} ${cfg.border}`}
                          >
                            <div className="flex items-start gap-2">
                              <div className={`w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                                <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2 flex-wrap">
                                  <span className={`text-xs font-bold ${cfg.color}`}>{e.year}</span>
                                  <p className="text-sm font-medium text-foreground leading-tight">{e.title}</p>
                                </div>
                                {e.location && (
                                  <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                    <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                                    {e.location}
                                  </p>
                                )}
                                {e.description && (
                                  <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                                    {e.description}
                                  </p>
                                )}
                              </div>
                              {!isDemo_ && (
                                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0 mt-1" />
                              )}
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Demo explanation ─────────────────────────────────────────── */}
        {isDemo && !loading && (
          <div className="bg-amber-400/5 border border-amber-400/20 rounded-2xl p-4 text-center space-y-2">
            <p className="text-xs font-medium text-amber-400">These are example events</p>
            <p className="text-xs text-muted-foreground">
              Add real events from your family's history using the Add button above,
              or add memories with dates from your Family Vault.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-2 bg-rose-500 text-white px-4 py-2 rounded-xl text-sm font-medium active:opacity-80"
            >
              Add Your First Event
            </button>
          </div>
        )}

        {/* ── Navigate to Legacy home ──────────────────────────────────── */}
        <button
          onClick={() => navigate("/legacy")}
          className="w-full flex items-center gap-2 justify-center py-3 text-sm text-rose-400/70 active:opacity-70"
        >
          <History className="w-4 h-4" />
          Open Legacy Mode Home
        </button>
      </div>

      {/* ── Add Event Modal ──────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end" onClick={() => setShowAddModal(false)}>
          <div
            className="w-full max-w-lg mx-auto bg-background rounded-t-3xl border-t border-border p-5 pb-8 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base flex items-center gap-2">
                <Plus className="w-4 h-4 text-rose-400" />
                Add Timeline Event
              </h2>
              <button onClick={() => setShowAddModal(false)} className="p-2 rounded-lg active:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Event type */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Event Type</label>
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {ADD_EVENT_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setAddForm(f => ({ ...f, event_type: t.value }))}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                      addForm.event_type === t.value
                        ? "bg-rose-500 text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Title <span className="text-rose-400">*</span>
              </label>
              <input
                value={addForm.title}
                onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Grandma Ruth was born in Alabama"
                className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                style={{ fontSize: "16px" }}
              />
            </div>

            {/* Year + Location */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                  Year <span className="text-rose-400">*</span>
                </label>
                <input
                  value={addForm.year}
                  onChange={e => setAddForm(f => ({ ...f, year: e.target.value }))}
                  placeholder="e.g. 1923"
                  type="number" min="1600" max={new Date().getFullYear()}
                  className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                  style={{ fontSize: "16px" }}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Location</label>
                <input
                  value={addForm.location}
                  onChange={e => setAddForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. Atlanta, GA"
                  className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                  style={{ fontSize: "16px" }}
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Description</label>
              <textarea
                value={addForm.description}
                onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Share the story behind this event…"
                rows={3}
                className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30 resize-none"
                style={{ fontSize: "16px" }}
              />
            </div>

            <button
              onClick={handleAddEvent}
              disabled={submitting || !addForm.title.trim() || !addForm.year.trim()}
              className="w-full bg-rose-500 text-white py-3 rounded-xl text-sm font-bold active:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {submitting ? "Adding…" : "Add to Timeline"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
