import "./_group.css";
import { useMemo, useState } from "react";
import {
  AudioLines, Bookmark, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleHelp,
  Compass, Eye, Flag, Heart, Home, MessageCircle, MoreHorizontal, Plus, Search,
  Send, Settings2, Share2, ShieldCheck, Sparkles, Users, Volume2, VolumeX, X,
} from "lucide-react";

type FeedSpark = {
  id: number;
  name: string;
  initials: string;
  neighborhood: string;
  elapsed: string;
  caption: string;
  imagePosition: string;
  tags: string[];
  likes: number;
  comments: string[];
  views: number;
  audio: string;
};

const sampleSparks: FeedSpark[] = [
  { id: 1, name: "Nia Brooks", initials: "NB", neighborhood: "Maplewood neighbors", elapsed: "18 min ago", caption: "The garden gave us more tomatoes than we can use. I left a basket by the front gate; please take what you need.", imagePosition: "50% 47%", tags: ["garden", "sharing"], likes: 38, comments: ["I picked up a few. Thank you for sharing the harvest.", "I can bring jars over this evening."], views: 214, audio: "Garden sounds" },
  { id: 2, name: "Leon Carter", initials: "LC", neighborhood: "Northside block", elapsed: "42 min ago", caption: "A few of us got the little free library back on its feet this morning. If you have a book to pass along, there is room for it.", imagePosition: "42% 58%", tags: ["neighbors", "small-wins"], likes: 24, comments: ["That library has been part of this block for years."], views: 136, audio: "Morning on the block" },
  { id: 3, name: "Amara Mensah", initials: "AM", neighborhood: "Maplewood neighbors", elapsed: "1 hr ago", caption: "Made an extra pot of ginger tea for anyone helping at the clean-up. We will be by the park entrance until noon.", imagePosition: "62% 44%", tags: ["care", "community"], likes: 19, comments: ["Save me a cup. I will bring gloves."], views: 98, audio: "Original audio" },
];

type Modal = "create" | "comments" | "share" | "hidden" | "blocked" | "insights" | "report" | null;

function Avatar({ initials, className = "" }: { initials: string; className?: string }) {
  return <span className={`nm-avatar ${className}`} aria-hidden="true">{initials}</span>;
}

function Overlay({ modal, spark, onClose, onNotice }: { modal: Exclude<Modal, null>; spark: FeedSpark; onClose: () => void; onNotice: (message: string) => void }) {
  const title: Record<Exclude<Modal, null>, string> = {
    create: "Share a small moment", comments: "Neighbor notes", share: "Pass this along",
    hidden: "Hidden authors", blocked: "Blocked accounts", insights: "Creator insights", report: "Report this Moment",
  };
  return (
    <div className="nm-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="nm-modal" role="dialog" aria-modal="true" aria-label={title[modal]}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 17 }}>
          <div><p className="nm-eyebrow">Niakofa · Moments</p><h2>{title[modal]}</h2></div>
          <button className="nm-close" type="button" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>
        {modal === "create" && <>
          <p className="nm-subtle" style={{ lineHeight: 1.55 }}>A quick hello, a useful offer, a small win from your block. These little things make a neighborhood.</p>
          <textarea aria-label="Write your Moment" placeholder="What would you like your neighbors to know?" style={{ width: "100%", minHeight: 115, padding: 13, resize: "vertical", border: "1px solid var(--nm-line)", borderRadius: 13, color: "var(--nm-ink)", background: "#fffefa" }} />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 12 }}>
            <button type="button" className="nm-pill" onClick={() => onNotice("Choose a photo or a short video for your Spark.")}><Plus size={15} /> Add media</button>
            <button type="button" className="nm-primary" style={{ minHeight: 40, padding: "0 16px" }} onClick={() => { onNotice("Your Moment draft is ready."); onClose(); }}>Continue</button>
          </div>
        </>}
        {modal === "comments" && <>
          <p className="nm-subtle" style={{ marginTop: 0 }}>{spark.comments.length} neighbors left a note on {spark.name.split(" ")[0]}'s Spark.</p>
          {spark.comments.map((comment, index) => <article key={comment} style={{ display: "flex", gap: 10, margin: "14px 0" }}><Avatar initials={index ? "AM" : "LC"} /><p style={{ margin: 0, lineHeight: 1.5, color: "#536771" }}><strong style={{ color: "var(--nm-ink)" }}>{index ? "Amara Mensah" : "Leon Carter"}</strong><br />{comment}</p></article>)}
          <form className="nm-feed__comment-form" onSubmit={(event) => { event.preventDefault(); onNotice("Your note was added to the local preview."); onClose(); }}><input aria-label="Write a neighbor note" placeholder="Write a neighbor note" /><button aria-label="Send neighbor note"><Send size={16} /></button></form>
        </>}
        {modal === "share" && <><p className="nm-subtle">Let a nearby friend know about this community moment.</p><button className="nm-pill" type="button" onClick={() => { onNotice("Spark link copied."); onClose(); }}><Share2 size={15} /> Copy Spark link</button></>}
        {modal === "hidden" && <><p className="nm-subtle">Their Moments stay out of your feed until you restore them.</p>{[["NB", "Nia Brooks"], ["JR", "Jules Reed"]].map(([initials, name]) => <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 0", borderBottom: "1px solid var(--nm-line)" }}><span style={{ display: "flex", alignItems: "center", gap: 9 }}><Avatar initials={initials} /><strong>{name}</strong></span><button className="nm-pill" type="button" onClick={() => onNotice(`${name} restored to your feed.`)}>Restore</button></div>)}</>}
        {modal === "blocked" && <><p className="nm-subtle">Manage accounts you have blocked. Unblocking lets direct messages resume.</p>{[["JR", "Jules Reed"]].map(([initials, name]) => <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0" }}><span style={{ display: "flex", alignItems: "center", gap: 9 }}><Avatar initials={initials} /><strong>{name}</strong></span><button className="nm-pill" type="button" onClick={() => onNotice(`${name} unblocked in this preview.`)}>Unblock</button></div>)}</>}
        {modal === "insights" && <><p className="nm-subtle">Daily watch time for your Moments. Retention is only shown when there is enough activity to protect privacy.</p><div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, padding: "14px 0", borderBottom: "1px solid var(--nm-line)" }}><span>Today · 8 plays</span><strong>4m 18s</strong><span>Yesterday · 12 plays</span><strong>6m 42s</strong><span>Completion</span><strong>Hidden until 5 plays</strong></div></>}
        {modal === "report" && <><p className="nm-subtle">Tell us what feels wrong. This sample report stays on this device.</p><select aria-label="Report reason" style={{ width: "100%", height: 42, padding: "0 10px", border: "1px solid var(--nm-line)", borderRadius: 10, background: "white" }}><option>Choose a reason</option><option>Not neighborly</option><option>Spam or misleading</option><option>Something else</option></select><button className="nm-primary" type="button" style={{ width: "100%", height: 42, marginTop: 12 }} onClick={() => { onNotice("Report noted in this local preview."); onClose(); }}>Submit report</button></>}
      </section>
    </div>
  );
}

export function VerticalFeed() {
  const [sparks, setSparks] = useState(sampleSparks);
  const [activeIndex, setActiveIndex] = useState(0);
  const [likedIds, setLikedIds] = useState<number[]>([]);
  const [savedIds, setSavedIds] = useState<number[]>([]);
  const [modal, setModal] = useState<Modal>(null);
  const [notice, setNotice] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [stateMenuOpen, setStateMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [previewState, setPreviewState] = useState<"feed" | "loading" | "empty" | "error">("feed");
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [author, setAuthor] = useState("");
  const [activeMedia, setActiveMedia] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [page, setPage] = useState(1);
  const matches = useMemo(() => sparks.filter((spark) =>
    (!search || `${spark.name} ${spark.caption} ${spark.neighborhood}`.toLowerCase().includes(search.toLowerCase()))
    && (!tag || spark.tags.some((item) => item.includes(tag.replace(/^#/, "").toLowerCase())))
    && (!author || spark.name === author)), [author, search, sparks, tag]);
  const [filterApplied, setFilterApplied] = useState(false);
  const feedSparks = filterApplied ? matches : sparks;
  const activeSpark = feedSparks[activeIndex] ?? feedSparks[0];
  const announce = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 2600); };
  const toggleItem = (ids: number[], id: number, setIds: (next: number[]) => void) => setIds(ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id]);
  const move = (delta: number) => { setActiveIndex((index) => Math.max(0, Math.min(feedSparks.length - 1, index + delta))); setActiveMedia(0); setMoreOpen(false); };
  const chooseFilter = () => {
    if (matches.length > 0) { setFilterApplied(true); setActiveIndex(0); setPreviewState("feed"); announce(`${matches.length} Sparks match your discovery filters.`); }
    else announce("No Sparks match yet. Try another search.");
    setFilterOpen(false);
  };

  return (
    <main className="nm-feed">
      <aside className="nm-feed__sidebar" aria-label="Moments navigation">
        <div className="nm-feed__brand"><span className="nm-brand-mark">N</span><span><strong>Niakofa</strong><small>NEIGHBORS, TOGETHER</small></span></div>
        <nav className="nm-feed__nav">
          <button type="button" data-active="true" onClick={() => { setPreviewState("feed"); setFilterApplied(false); setActiveIndex(0); }}><Home size={17} /><span>Moments</span></button>
          <button type="button" onClick={() => setFilterOpen(true)}><Compass size={17} /><span>Discover</span></button>
          <button type="button" onClick={() => setModal("hidden")}><VolumeX size={17} /><span>Hidden authors</span></button>
          <button type="button" onClick={() => setModal("blocked")}><ShieldCheck size={17} /><span>Blocked accounts</span></button>
          <button type="button" onClick={() => setModal("insights")}><Eye size={17} /><span>Creator insights</span></button>
        </nav>
        <section className="nm-feed__prompt" aria-label="Weekly community prompt">
          <p className="nm-section-label">A small prompt for the week</p>
          <Sparkles size={16} color="#af7d20" />
          <h2>What did a neighbor make easier this week?</h2>
          <p>18 neighbors have shared a Moment for this prompt.</p>
          <button className="nm-primary" type="button" onClick={() => setModal("create")}>Share your Moment</button>
        </section>
        <div className="nm-feed__people">
          <p className="nm-section-label">Your controls</p>
          <button type="button" onClick={() => setModal("hidden")}><VolumeX size={15} /> Hidden authors</button>
          <button type="button" onClick={() => setModal("blocked")}><ShieldCheck size={15} /> Blocked accounts</button>
          <button type="button" onClick={() => setModal("insights")}><Eye size={15} /> Creator insights</button>
        </div>
        <button type="button" className="nm-pill" onClick={() => announce("Help is available from your community guide.")}><CircleHelp size={15} /> Help with Moments</button>
      </aside>

      <section className="nm-feed__main" aria-label="Community Moments">
        <header className="nm-feed__topbar">
          <div><h1>Moments</h1><p>Small things that bring us closer.</p></div>
          <div className="nm-feed__top-actions">
            <button className="nm-pill" type="button" onClick={() => setStateMenuOpen((value) => !value)}><Settings2 size={14} /> Preview states <ChevronDown size={13} /></button>
            <button className="nm-pill" type="button" onClick={() => setFilterOpen((value) => !value)} aria-expanded={filterOpen}><Search size={15} /> Discover</button>
            <button className="nm-pill nm-feed__mobile-only" type="button" onClick={() => setToolsOpen((value) => !value)} aria-expanded={toolsOpen} aria-label="Open community tools"><MoreHorizontal size={16} /></button>
            <button className="nm-primary nm-feed__create" type="button" onClick={() => setModal("create")}><Plus size={16} /> Create a Spark</button>
          </div>
          {toolsOpen && <div className="nm-feed__mobile-menu" aria-label="Community tools">
            <button type="button" onClick={() => { setModal("create"); setToolsOpen(false); }}><Sparkles size={15} /> Weekly prompt</button>
            <button type="button" onClick={() => { setModal("hidden"); setToolsOpen(false); }}><VolumeX size={15} /> Hidden authors</button>
            <button type="button" onClick={() => { setModal("blocked"); setToolsOpen(false); }}><ShieldCheck size={15} /> Blocked accounts</button>
            <button type="button" onClick={() => { setModal("insights"); setToolsOpen(false); }}><Eye size={15} /> Creator insights</button>
            <button type="button" onClick={() => { setSparks((current) => [...current, { ...sampleSparks[2], id: Date.now(), name: "Tasha Green", initials: "TG", caption: "A little help with the porch steps turned into a good morning together.", elapsed: "Just now", views: 31 }]); setPage((value) => value + 1); setToolsOpen(false); announce("More community Sparks are ready in this local preview."); }}><Plus size={15} /> Load more Sparks</button>
          </div>}
          {stateMenuOpen && <div className="nm-feed__filter-panel" style={{ width: 225, right: 190 }}>
            <p className="nm-section-label">Local preview states</p>
            {(["feed", "loading", "empty", "error"] as const).map((state) => <button key={state} type="button" onClick={() => { setPreviewState(state); setStateMenuOpen(false); }} style={{ display: "flex", justifyContent: "space-between", width: "100%", minHeight: 35, border: 0, background: "transparent", textTransform: "capitalize", color: "var(--nm-ink)" }}>{state === "feed" ? "Loaded feed" : state === "error" ? "Error" : state}{previewState === state && <Check size={15} />}</button>)}
          </div>}
          {filterOpen && <form className="nm-feed__filter-panel" aria-label="Discover Moments" onSubmit={(event) => { event.preventDefault(); chooseFilter(); }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><strong style={{ fontFamily: "var(--nm-display)", fontSize: 18 }}>Find a Moment</strong><button type="button" className="nm-close" onClick={() => setFilterOpen(false)} aria-label="Close discovery filters"><X size={15} /></button></div>
            <label htmlFor="nm-search">Search people or words</label><input id="nm-search" placeholder="Try “garden” or “Nia”" value={search} onChange={(event) => setSearch(event.target.value)} />
            <label htmlFor="nm-tag">Tag</label><input id="nm-tag" placeholder="garden" value={tag} onChange={(event) => setTag(event.target.value)} />
            <label htmlFor="nm-author">Author</label><select id="nm-author" value={author} onChange={(event) => setAuthor(event.target.value)}><option value="">All neighbors</option>{sparks.map((spark) => <option key={spark.id} value={spark.name}>{spark.name}</option>)}</select>
            <button type="submit" className="nm-primary">Show {matches.length} Sparks</button>
          </form>}
        </header>

        <div className="nm-feed__stage">
          {previewState === "loading" ? <div style={{ display: "grid", gap: 13, width: "min(455px,100%)", height: "86%", padding: 22, alignContent: "end", borderRadius: 22, background: "#e0e8e4" }} role="status" aria-label="Loading community Sparks"><div className="nm-skeleton" style={{ width: "37%", height: 40 }} /><div className="nm-skeleton" style={{ width: "70%", height: 28 }} /><div className="nm-skeleton" style={{ width: "95%", height: 14 }} /><div className="nm-skeleton" style={{ width: "80%", height: 14 }} /></div>
          : previewState === "error" ? <div style={{ display: "grid", placeItems: "center", width: "min(455px,100%)", height: "86%", padding: 28, borderRadius: 22, textAlign: "center", background: "#fffefa" }} role="alert"><div><span className="nm-brand-mark" style={{ margin: "0 auto 14px", background: "#ffe3dc" }}><CircleHelp size={20} /></span><h2 style={{ fontFamily: "var(--nm-display)" }}>This feed needs a moment</h2><p className="nm-subtle">We could not bring the Sparks into view. Nothing was sent or changed.</p><button className="nm-primary" style={{ minHeight: 41, padding: "0 15px" }} type="button" onClick={() => setPreviewState("feed")}>Try again</button></div></div>
          : previewState === "empty" ? <div style={{ display: "grid", placeItems: "center", width: "min(455px,100%)", height: "86%", padding: 28, border: "1px dashed #c8d3cc", borderRadius: 22, textAlign: "center", background: "#fbfcf8" }}><div><span className="nm-brand-mark" style={{ margin: "0 auto 14px" }}><Sparkles size={19} /></span><h2 style={{ fontFamily: "var(--nm-display)" }}>A quiet moment here</h2><p className="nm-subtle">New Sparks shared with your neighbors will appear here.</p><button className="nm-primary" style={{ minHeight: 41, padding: "0 15px" }} type="button" onClick={() => setModal("create")}>Share the first Spark</button></div></div>
            : activeSpark && <>
            <article className="nm-feed__viewer" key={activeSpark.id} aria-label={`Spark by ${activeSpark.name}`}>
              <img src="/__mockup/images/niakofa-neighbor-garden.jpg" alt={`Neighbors sharing a garden harvest. A moment from ${activeSpark.name}.`} style={{ objectPosition: activeSpark.imagePosition, transform: activeMedia ? "scale(1.08)" : undefined }} />
              <div className="nm-feed__viewer-shade" />
              <div className="nm-feed__progress" aria-hidden="true">{feedSparks.slice(0, 6).map((spark, index) => <span key={spark.id} data-active={index === activeIndex} />)}</div>
              <div className="nm-feed__media-tools">
                <button type="button" onClick={() => setActiveMedia(0)} aria-label="Show previous attachment"><ChevronLeft size={17} /></button>
                <button type="button" onClick={() => setActiveMedia(1)} aria-label="Show next attachment"><ChevronRight size={17} /></button>
                <button type="button" onClick={() => setSoundOn((value) => !value)} aria-label={soundOn ? "Mute Spark audio" : "Turn Spark audio on"} aria-pressed={soundOn}>{soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
              </div>
              <div className="nm-feed__mobile-tools">
                <button type="button" aria-label="Open discovery filters" onClick={() => setFilterOpen(true)}><Search size={16} /></button>
                <button type="button" aria-label="Open weekly prompt" onClick={() => setModal("create")}><Sparkles size={16} /></button>
                <button type="button" aria-label="Previous Spark" onClick={() => move(-1)} disabled={activeIndex === 0}><ChevronUp size={16} /></button>
                <button type="button" aria-label="Next Spark" onClick={() => move(1)} disabled={activeIndex >= feedSparks.length - 1}><ChevronDown size={16} /></button>
              </div>
              <div className="nm-feed__copy">
                <div className="nm-feed__byline"><Avatar initials={activeSpark.initials} /><span><strong>{activeSpark.name}</strong><small>{activeSpark.neighborhood} · {activeSpark.elapsed}</small></span></div>
                <h2>{activeSpark.caption.split(".")[0]}.</h2>
                <p>{activeSpark.caption}</p>
                <div className="nm-feed__tags">{activeSpark.tags.map((item) => <span key={item}>#{item}</span>)}</div>
              </div>
              <div className="nm-feed__rail" aria-label="Spark actions">
                <button type="button" aria-label="React to Spark" aria-pressed={likedIds.includes(activeSpark.id)} data-active={likedIds.includes(activeSpark.id)} onClick={() => toggleItem(likedIds, activeSpark.id, setLikedIds)}><Heart fill={likedIds.includes(activeSpark.id) ? "currentColor" : "none"} /><span>{activeSpark.likes + Number(likedIds.includes(activeSpark.id))}</span></button>
                <button type="button" aria-label="View comments" onClick={() => setModal("comments")}><MessageCircle /><span>{activeSpark.comments.length}</span></button>
                <button type="button" aria-label="Share Spark" onClick={() => setModal("share")}><Share2 /><span>Share</span></button>
                <button type="button" aria-label="Save Spark" aria-pressed={savedIds.includes(activeSpark.id)} data-active={savedIds.includes(activeSpark.id)} onClick={() => toggleItem(savedIds, activeSpark.id, setSavedIds)}><Bookmark fill={savedIds.includes(activeSpark.id) ? "currentColor" : "none"} /><span>{savedIds.includes(activeSpark.id) ? "Saved" : "Save"}</span></button>
                <button type="button" aria-label="More Spark actions" aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)}><MoreHorizontal /><span>More</span></button>
                {moreOpen && <div style={{ position: "absolute", right: 52, bottom: 40, display: "grid", width: 184, padding: 6, border: "1px solid #ffffff44", borderRadius: 13, background: "rgba(8,24,43,.94)" }}>
                  <button type="button" onClick={() => { setModal("report"); setMoreOpen(false); }} style={{ display: "flex", justifyItems: "start", gap: 7, padding: 9, border: 0, color: "white", background: "transparent" }}><Flag size={15} /> Report Moment</button>
                  <button type="button" onClick={() => { setModal("hidden"); setMoreOpen(false); }} style={{ display: "flex", justifyItems: "start", gap: 7, padding: 9, border: 0, color: "white", background: "transparent" }}><VolumeX size={15} /> Hide this author</button>
                  <button type="button" onClick={() => { announce("Caption saved to your family collection."); setMoreOpen(false); }} style={{ display: "flex", justifyItems: "start", gap: 7, padding: 9, border: 0, color: "white", background: "transparent" }}><Bookmark size={15} /> Keep caption for family</button>
                </div>}
                <span style={{ display: "grid", justifyItems: "center", gap: 3, minWidth: 44, padding: "7px 5px", borderRadius: 14, color: "white", fontSize: 9 }} aria-label={`${activeSpark.views} views`}><Eye size={19} /><span>{activeSpark.views}</span></span>
              </div>
              {modal === "comments" && <section className="nm-feed__comments" aria-label="Neighbor notes"><div style={{ display: "flex", justifyContent: "space-between" }}><strong>Neighbor notes</strong><button className="nm-close" onClick={() => setModal(null)} aria-label="Close comments"><X size={15} /></button></div>{activeSpark.comments.slice(0, 2).map((comment, index) => <article key={comment}><Avatar initials={index ? "AM" : "LC"} /><p><strong>{index ? "Amara Mensah" : "Leon Carter"}</strong><br />{comment}</p></article>)}<form className="nm-feed__comment-form" onSubmit={(event) => { event.preventDefault(); announce("Your neighbor note was added to this preview."); setModal(null); }}><input aria-label="Write a neighbor note" placeholder="Write a neighbor note" /><button aria-label="Send neighbor note"><Send size={16} /></button></form></section>}
            </article>

            <aside className="nm-feed__detail" aria-label="Spark details and feed navigation">
              <div><div className="nm-feed__detail-head"><p className="nm-section-label">A moment from your community</p><button type="button" className="nm-close" aria-label="Show next attachment" onClick={() => setActiveMedia((value) => value === 0 ? 1 : 0)}><ChevronRight size={16} /></button></div><h3>{activeSpark.name}'s Spark</h3><p>Shared with neighbors in {activeSpark.neighborhood}. Every small offer can become a brighter day for someone nearby.</p>
                <div className="nm-feed__detail-list">
                  <div className="nm-feed__detail-item"><Avatar initials="LC" /><span><strong>Close to home</strong>Shared with this community</span></div>
                  <div className="nm-feed__detail-item"><span className="nm-brand-mark" style={{ width: 34, height: 34, borderRadius: 11, fontSize: 16 }}><AudioLines size={16} /></span><span><strong>{soundOn ? "Audio is on" : activeSpark.audio}</strong>{soundOn ? "Sound controls enabled" : "Tap sound to listen"}</span></div>
                  <div className="nm-feed__detail-item"><span className="nm-brand-mark" style={{ width: 34, height: 34, borderRadius: 11, background: "#ffe8d6" }}><Users size={16} /></span><span><strong>A familiar block</strong>Neighbors sharing useful moments</span></div>
                </div>
              </div>
              <div className="nm-feed__pager"><button type="button" onClick={() => move(-1)} disabled={activeIndex === 0} aria-label="Previous Spark"><ChevronLeft size={17} /></button><span>Spark {activeIndex + 1} of {feedSparks.length}</span><button type="button" onClick={() => move(1)} disabled={activeIndex >= feedSparks.length - 1} aria-label="Next Spark"><ChevronRight size={17} /></button></div>
              <button className="nm-pill" type="button" onClick={() => { setSparks((current) => [...current, { ...sampleSparks[2], id: Date.now(), name: "Tasha Green", initials: "TG", caption: "A little help with the porch steps turned into a good morning together.", elapsed: "Just now", views: 31 }]); setPage((value) => value + 1); announce("More community Sparks are ready in this local preview."); }}><Plus size={14} /> Load more Sparks · page {page}</button>
              <p className="nm-subtle" style={{ fontSize: 10, lineHeight: 1.55 }}>Sparks stay neighborly. Hide an author, manage blocks, or report something from the More menu.</p>
            </aside>
          </>}
        </div>
      </section>
      {modal && activeSpark && <Overlay modal={modal} spark={activeSpark} onClose={() => setModal(null)} onNotice={announce} />}
      {notice && <div className="nm-feed__toasts" role="status">{notice}</div>}
    </main>
  );
}

export default VerticalFeed;