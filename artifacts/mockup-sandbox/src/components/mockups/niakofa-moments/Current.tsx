import "./_group.css";
import { useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, AudioLines, Bookmark, ChevronLeft, ChevronRight, Eye, Filter,
  Heart, Maximize2, MessageCircle, MoreHorizontal, Plus, Send,
  Share2, Volume2, X,
} from "lucide-react";

type Spark = {
  id: number;
  name: string;
  initials: string;
  place: string;
  time: string;
  caption: string;
  tags: string[];
  likes: number;
  comments: number;
  views: number;
};

const startingSparks: Spark[] = [
  { id: 1, name: "Nia Brooks", initials: "NB", place: "Maplewood neighbors", time: "18 min ago", caption: "The garden gave us more tomatoes than we can use. I left a basket by the front gate; please take what you need.", tags: ["garden", "sharing"], likes: 38, comments: 7, views: 214 },
  { id: 2, name: "Leon Carter", initials: "LC", place: "Northside block", time: "42 min ago", caption: "A few of us got the little free library back on its feet this morning. If you have a book to pass along, there is room for it.", tags: ["neighbors", "small-wins"], likes: 24, comments: 4, views: 136 },
  { id: 3, name: "Amara Mensah", initials: "AM", place: "Maplewood neighbors", time: "1 hr ago", caption: "Made an extra pot of ginger tea for anyone helping at the clean-up. We will be by the park entrance until noon.", tags: ["care", "community"], likes: 19, comments: 3, views: 98 },
];

type ModalKind = "create" | "comments" | "share" | "hidden" | "blocked" | "save" | null;

function MiniModal({ kind, onClose, onNotice }: { kind: Exclude<ModalKind, null>; onClose: () => void; onNotice: (message: string) => void }) {
  const titles: Record<Exclude<ModalKind, null>, string> = {
    create: "Share a small moment", comments: "Neighbor notes", share: "Share this Spark",
    hidden: "Hidden authors", blocked: "Blocked accounts", save: "Keep for your family",
  };
  return (
    <div className="nm-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="nm-modal" role="dialog" aria-modal="true" aria-label={titles[kind]}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <div><p className="nm-eyebrow">Niakofa Moments</p><h2>{titles[kind]}</h2></div>
          <button className="nm-close" type="button" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>
        {kind === "create" && <>
          <p className="nm-subtle" style={{ lineHeight: 1.55 }}>A quick hello, a useful offer, a small win from your block. Keep it personal.</p>
          <textarea aria-label="Write a caption" placeholder="What would you like your neighbors to know?" style={{ width: "100%", minHeight: 106, resize: "vertical", padding: 12, border: "1px solid var(--nm-line)", borderRadius: 12, background: "#fffefa", color: "var(--nm-ink)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
            <button className="nm-pill" type="button" onClick={() => onNotice("Add a photo or short video to your Spark.")}><Plus size={15} /> Add media</button>
            <button className="nm-primary" type="button" onClick={() => { onNotice("Your draft is ready to share."); onClose(); }} style={{ minHeight: 40, padding: "0 18px" }}>Continue</button>
          </div>
        </>}
        {kind === "comments" && <>
          <p className="nm-subtle">A few words from people nearby.</p>
          {[
            ["LC", "Leon Carter", "I picked up a few. Thank you for sharing the harvest."],
            ["AM", "Amara Mensah", "I can bring some jars over this evening."],
          ].map(([initials, name, text]) => <div key={name} style={{ display: "flex", gap: 10, margin: "15px 0" }}><span className="nm-avatar">{initials}</span><p style={{ margin: 0, lineHeight: 1.45 }}><strong>{name}</strong><br /><span className="nm-subtle">{text}</span></p></div>)}
          <form onSubmit={(event) => { event.preventDefault(); onNotice("Your neighbor note was added."); onClose(); }} style={{ display: "flex", gap: 8 }}>
            <input aria-label="Write a neighbor note" placeholder="Write a neighbor note" style={{ flex: 1, minWidth: 0, padding: "0 11px", border: "1px solid var(--nm-line)", borderRadius: 10 }} />
            <button className="nm-primary" aria-label="Send note" style={{ width: 42 }}><Send size={16} /></button>
          </form>
        </>}
        {kind === "share" && <><p className="nm-subtle">Pass a useful moment along to someone who lives nearby.</p><button className="nm-pill" type="button" onClick={() => { onNotice("Spark link copied."); onClose(); }}><Share2 size={15} /> Copy Spark link</button></>}
        {kind === "hidden" && <div>{[["NB", "Nia Brooks"], ["LC", "Leon Carter"]].map(([initials, name]) => <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0", borderBottom: "1px solid var(--nm-line)" }}><span style={{ display: "flex", alignItems: "center", gap: 9 }}><span className="nm-avatar">{initials}</span><strong>{name}</strong></span><button className="nm-pill" type="button" onClick={() => onNotice(`${name} restored to your Moments.`)}>Restore</button></div>)}</div>}
        {kind === "blocked" && <div>{[["JR", "Jules Reed"]].map(([initials, name]) => <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0" }}><span style={{ display: "flex", alignItems: "center", gap: 9 }}><span className="nm-avatar">{initials}</span><strong>{name}</strong></span><button className="nm-pill" type="button" onClick={() => onNotice(`${name} unblocked.`)}>Unblock</button></div>)}</div>}
        {kind === "save" && <><p className="nm-subtle">Keep this caption in your private family collection.</p><button className="nm-primary" style={{ minHeight: 40, padding: "0 15px" }} type="button" onClick={() => { onNotice("Caption saved to your family collection."); onClose(); }}>Save caption</button></>}
      </section>
    </div>
  );
}

export function Current() {
  const [sparks, setSparks] = useState(startingSparks);
  const [active, setActive] = useState(0);
  const [modal, setModal] = useState<ModalKind>(null);
  const [liked, setLiked] = useState<number[]>([]);
  const [saved, setSaved] = useState<number[]>([]);
  const [notice, setNotice] = useState("");
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [author, setAuthor] = useState("");
  const [activeMedia, setActiveMedia] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  const filteredSparks = useMemo(() => sparks.filter((spark) =>
    (!search || `${spark.name} ${spark.caption}`.toLowerCase().includes(search.toLowerCase()))
    && (!tag || spark.tags.some((item) => item.includes(tag.replace(/^#/, "").toLowerCase())))
    && (!author || spark.name === author)), [author, search, sparks, tag]);

  const announce = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 2600); };
  const toggle = (values: number[], id: number, setter: (next: number[]) => void) => setter(values.includes(id) ? values.filter((item) => item !== id) : [...values, id]);
  const goToSpark = (index: number) => {
    setActive(index);
    document.getElementById(`current-spark-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="nm-current">
      <div className="nm-current__wrap">
        <header className="nm-page-head" aria-label="Moments page heading">
          <p className="nm-eyebrow">Community</p>
          <h1>Moments</h1>
          <p className="nm-subtle" style={{ margin: "5px 0 0", fontSize: 12 }}>A vertical feed of Sparks shared with you.</p>
        </header>

        <section className="nm-panel nm-prompt" aria-label="Weekly community prompt">
          <div><p className="nm-eyebrow">A small prompt for the week</p><h2>What is one thing your neighbors made easier this week?</h2><p className="nm-subtle" style={{ fontSize: 11 }}>18 neighbors have shared a Moment for this prompt.</p></div>
          <button className="nm-primary" type="button" onClick={() => setModal("create")} style={{ minHeight: 42, padding: "0 15px", whiteSpace: "nowrap" }}>Share your Moment</button>
        </section>

        <section className="nm-panel nm-create-rail" aria-label="Community Stories">
          <button className="nm-story" type="button" onClick={() => setModal("create")}><span className="nm-story-ring"><span className="nm-avatar"><Plus size={19} /></span></span><span>Your Moment</span></button>
          {sparks.slice(0, 3).map((spark) => <button className="nm-story" key={spark.id} type="button" onClick={() => { goToSpark(Math.max(0, filteredSparks.findIndex((item) => item.id === spark.id))); document.getElementById("current-feed")?.scrollIntoView({ behavior: "smooth" }); }}><span className="nm-story-ring"><span className="nm-avatar">{spark.initials}</span></span><span>{spark.name.split(" ")[0]}</span></button>)}
          <button className="nm-pill" type="button" onClick={() => setModal("create")}><Plus size={14} /> Create</button>
        </section>

        <section className="nm-panel nm-insights" aria-label="Creator analytics">
          <button className="nm-insights-trigger" type="button" aria-expanded={insightsOpen} onClick={() => setInsightsOpen((value) => !value)}>
            <span><strong style={{ display: "block", fontSize: 13 }}>Creator insights</strong><span className="nm-subtle" style={{ fontSize: 11 }}>Daily Moment watch time and completion retention</span></span>
            {insightsOpen ? <ArrowUp size={17} /> : <ArrowDown size={17} />}
          </button>
          {insightsOpen && <div className="nm-insights-body"><div className="nm-insight-row"><span>Today · 8 plays</span><strong>4m 18s watched</strong></div><div className="nm-insight-row"><span>Yesterday · 12 plays</span><strong>6m 42s watched</strong></div><p className="nm-subtle" style={{ fontSize: 10 }}>Completion insights appear when a Moment has enough plays to protect neighbor privacy.</p></div>}
        </section>

        <section className="nm-panel nm-feed-panel" id="current-feed" aria-label="Spark feed">
          <div className="nm-feed-head"><strong>Sparks shared with you</strong><div className="nm-head-actions">
            <span className="nm-subtle" style={{ fontSize: 10 }}>{filteredSparks.length ? active + 1 : 0} of {filteredSparks.length}</span>
            <button className="nm-pill" type="button" onClick={() => announce("Full-screen viewing is ready.")} aria-label="Open full-screen Moments"><Maximize2 size={14} /> View</button>
            <button className="nm-pill" type="button" onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen}><Filter size={14} /> Filters</button>
            <button className="nm-pill" type="button" onClick={() => setModal("hidden")}><Volume2 size={14} /> Hidden authors</button>
            <button className="nm-pill" type="button" onClick={() => setModal("blocked")}>Blocked accounts</button>
            <button className="nm-pill" type="button" onClick={() => goToSpark(Math.max(0, active - 1))} disabled={active === 0} aria-label="Previous Spark"><ArrowUp size={14} /></button>
            <button className="nm-pill" type="button" onClick={() => goToSpark(Math.min(filteredSparks.length - 1, active + 1))} disabled={active >= filteredSparks.length - 1} aria-label="Next Spark"><ArrowDown size={14} /></button>
          </div></div>
          {filtersOpen && <form className="nm-filter-row" aria-label="Discover Moments" onSubmit={(event) => { event.preventDefault(); setActive(0); announce(`${filteredSparks.length} Moments match your discovery filters.`); }}>
            <input aria-label="Search Moments" placeholder="Search Moments" value={search} onChange={(event) => setSearch(event.target.value)} />
            <input aria-label="Filter by tag" placeholder="Tag (e.g. garden)" value={tag} onChange={(event) => setTag(event.target.value)} />
            <select aria-label="Filter by author" value={author} onChange={(event) => setAuthor(event.target.value)}><option value="">All authors</option>{sparks.map((spark) => <option key={spark.id}>{spark.name}</option>)}</select>
            <button className="nm-primary" type="submit" style={{ padding: "0 14px" }}>Discover</button>
          </form>}
          <div className="nm-scroll-feed" role="feed" aria-label="Scroll vertically through Sparks">
            {filteredSparks.map((spark, index) => <article id={`current-spark-${index}`} className="nm-spark-card" key={spark.id} aria-label={`Spark ${index + 1} by ${spark.name}`} aria-posinset={index + 1} aria-setsize={filteredSparks.length}>
              <img src="/__mockup/images/niakofa-neighbor-garden.jpg" alt={`Neighbors sharing fresh produce in a community garden, Moment by ${spark.name}`} style={{ objectPosition: index === 1 ? "48% 38%" : "50% 50%", transform: index === active ? `scale(${activeMedia ? 1.08 : 1})` : undefined }} />
              <div className="nm-spark-shade" />
              <div style={{ position: "absolute", top: 16, right: 11, left: 11, zIndex: 3, display: "flex", justifyContent: "space-between" }}>
                <span style={{ display: "flex", gap: 5 }}>
                  <button className="nm-action" type="button" onClick={() => setActiveMedia(0)} aria-label="Show previous attachment"><ChevronLeft size={16} /><span>Previous</span></button>
                  <button className="nm-action" type="button" onClick={() => setActiveMedia(1)} aria-label="Show next attachment"><ChevronRight size={16} /><span>Next</span></button>
                </span>
                <button className="nm-action" type="button" onClick={() => setSoundOn((value) => !value)} aria-label={soundOn ? "Mute Spark sound" : "Turn Spark sound on"} aria-pressed={soundOn}><AudioLines size={16} /><span>{soundOn ? "Sound on" : "Sound off"}</span></button>
              </div>
              <div className="nm-card-copy"><strong>{spark.name}</strong><span style={{ display: "block", marginTop: 3, color: "rgba(255,255,255,.72)", fontSize: 10 }}>{spark.place} · {spark.time}</span><p>{spark.caption}</p></div>
              <div className="nm-actions-rail" aria-label="Moment actions">
                <button className="nm-action" type="button" onClick={() => toggle(liked, spark.id, setLiked)} aria-label="React to Spark" aria-pressed={liked.includes(spark.id)}><Heart size={18} fill={liked.includes(spark.id) ? "currentColor" : "none"} /><span>{spark.likes + (liked.includes(spark.id) ? 1 : 0)}</span></button>
                <button className="nm-action" type="button" onClick={() => setModal("comments")} aria-label="View Spark comments"><MessageCircle size={18} /><span>{spark.comments}</span></button>
                <button className="nm-action" type="button" onClick={() => setModal("share")} aria-label="Share Spark"><Share2 size={18} /><span>Share</span></button>
                <button className="nm-action" type="button" onClick={() => toggle(saved, spark.id, setSaved)} aria-label="Save Spark" aria-pressed={saved.includes(spark.id)}><Bookmark size={18} fill={saved.includes(spark.id) ? "currentColor" : "none"} /><span>{saved.includes(spark.id) ? "Saved" : "Save"}</span></button>
                <button className="nm-action" type="button" onClick={() => setModal("save")} aria-label="More actions for Spark"><MoreHorizontal size={18} /><span>More</span></button>
                <span className="nm-action" aria-label={`${spark.views} views`}><Eye size={18} /><span>{spark.views}</span></span>
              </div>
            </article>)}
            {filteredSparks.length === 0 && <div style={{ display: "grid", placeItems: "center", minHeight: "100%", padding: 30, color: "white", textAlign: "center" }}><div><h2>No Sparks to show yet</h2><p>Try another filter or share a new community Moment.</p><button className="nm-primary" style={{ minHeight: 40, padding: "0 14px" }} onClick={() => setModal("create")}>Share a Moment</button></div></div>}
          </div>
          <div className="nm-load-more"><button className="nm-pill" type="button" onClick={() => { setSparks((current) => [...current, { ...startingSparks[2], id: Date.now(), name: "Tasha Green", initials: "TG", caption: "A little help with the porch steps turned into a good morning together.", likes: 12, comments: 2 }]); announce("More Sparks added to this local preview."); }}>Load more Sparks</button></div>
        </section>
        <p className="nm-subtle" style={{ margin: "10px 3px", fontSize: 10 }}>Only the Spark in view is opened. Video starts muted, and secure playback is authorized for your account.</p>
      </div>
      {modal && <MiniModal kind={modal} onClose={() => setModal(null)} onNotice={announce} />}
      {notice && <div role="status" style={{ position: "fixed", right: 18, bottom: 18, zIndex: 40, padding: "11px 15px", borderRadius: 12, color: "white", background: "var(--nm-navy)" }}>{notice}</div>}
    </main>
  );
}

export default Current;