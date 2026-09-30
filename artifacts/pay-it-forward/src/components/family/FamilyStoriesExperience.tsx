import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, ArrowRight, BookOpen, CalendarDays, ChevronLeft, ChevronRight, FileText, LockKeyhole, Mic2, PenLine, Plus, RefreshCw, Trash2, UsersRound, X } from "lucide-react";
import { toast } from "sonner";
import { useAuthorizedFamilyAsset } from "@/lib/family-asset-client";
import { storiesClient } from "./stories-client";
import type { FamilyStory, MemoryAsset, StoryInput, StoryPrecision } from "./stories-client";

const ink = "text-[#e9e4d9]";
const field = "w-full rounded-xl border border-[#57676b] bg-[#14232c] px-4 py-3 text-[#f3eee2] outline-none placeholder:text-[#92a4a5] focus:border-[#d7a778] focus:ring-2 focus:ring-[#d7a778]/20";
const secondary = "rounded-xl border border-[#5b696a] px-4 py-2.5 text-sm font-medium text-[#e9e4d9] transition-colors hover:bg-[#ffffff]/10 disabled:opacity-40";
const primary = "inline-flex items-center justify-center gap-2 rounded-xl bg-[#e2b78b] px-5 py-2.5 text-sm font-semibold text-[#19262a] transition-colors hover:bg-[#f1cba4] disabled:opacity-50";

function storyDate(story: FamilyStory) {
  if (story.date_label?.trim()) return story.date_label;
  const year = story.date_year;
  if (year == null) return "Date not recorded";
  if (story.date_precision === "decade") return `${Math.floor(year / 10) * 10}s`;
  if (story.date_precision === "circa") return `Around ${year}`;
  if (story.date_precision === "year" || !story.date_month) return String(year);
  const month = new Intl.DateTimeFormat(undefined, { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, story.date_month - 1, 1)));
  return story.date_precision === "month" || !story.date_day ? `${month} ${year}` : `${month} ${story.date_day}, ${year}`;
}

function storyAuthor(story: FamilyStory) {
  return story.author_id === null ? "Author not recorded" : story.author?.name || "Name unavailable";
}

function authorInitial(story: FamilyStory) {
  return story.author_id === null ? "?" : story.author?.name?.charAt(0)?.toUpperCase() || "?";
}

function AudioRecording({ asset }: { asset: MemoryAsset }) {
  const { url, loading, error } = useAuthorizedFamilyAsset(asset.storage_key);
  return (
    <div className="rounded-2xl border border-[#456064] bg-[#132831] p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#e2b78b]"><Mic2 size={17} /> A voice from the archive</div>
      {loading ? <div className="h-12 animate-pulse rounded-xl bg-[#31505a]" aria-label="Loading recording" /> : error ? <p className="text-sm text-[#ffc8b8]">{error}</p> : url ? <audio controls preload="metadata" src={url} className="w-full" aria-label="Family oral history recording" /> : null}
      {asset.transcript?.trim() && <div className="mt-5 border-t border-[#456064] pt-4"><p className="mb-2 text-[11px] font-bold uppercase tracking-[.2em] text-[#c5ac92]">Transcript</p><p className="whitespace-pre-wrap text-sm leading-7 text-[#ddd9cf]">{asset.transcript}</p></div>}
    </div>
  );
}

function OralHistory({ familyId, memoryId }: { familyId: number; memoryId: number }) {
  const { data, error, isPending, refetch, isFetching } = useQuery({
    queryKey: ["family-story-memory", familyId, memoryId],
    queryFn: () => storiesClient.memory(familyId, memoryId),
  });
  if (isPending) return <div className="space-y-3" aria-label="Loading oral history"><div className="h-20 animate-pulse rounded-2xl bg-[#28414a]" /><div className="h-20 animate-pulse rounded-2xl bg-[#28414a]" /></div>;
  if (error) return <div className="rounded-2xl border border-[#915e57] p-4 text-sm text-[#ffc8b8]">The linked memory could not be opened. <button className="underline" onClick={() => void refetch()} disabled={isFetching}>Try again</button></div>;
  const audio = (data?.assets ?? []).filter(a => a.asset_type === "audio" || a.mime_type?.startsWith("audio/"));
  const otherTranscripts = (data?.assets ?? []).filter(a => a.asset_type !== "audio" && !a.mime_type?.startsWith("audio/") && a.transcript?.trim());
  if (!audio.length && !otherTranscripts.length) return <p className="rounded-2xl border border-[#456064] p-4 text-sm text-[#aebfbe]">This linked memory has no recording or transcript available yet.</p>;
  return <div className="space-y-4">{audio.map(a => <AudioRecording key={a.id} asset={a} />)}{otherTranscripts.map(a => <div key={a.id} className="rounded-2xl border border-[#456064] bg-[#132831] p-5"><div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#e2b78b]"><FileText size={17} /> Archive transcript</div><p className="whitespace-pre-wrap text-sm leading-7 text-[#ddd9cf]">{a.transcript}</p></div>)}</div>;
}

function StoryEditor({ story, familyId, onClose, onSaved }: { story: FamilyStory | null; familyId: number; onClose: () => void; onSaved: (input: StoryInput) => void }) {
  const [title, setTitle] = useState(story?.title ?? "");
  const [body, setBody] = useState(story?.body ?? "");
  const [audience, setAudience] = useState<"family" | "private">(story?.audience ?? "family");
  const [category, setCategory] = useState<NonNullable<StoryInput["category"]>>(
    (story?.category as StoryInput["category"]) ?? "written");
  const [language, setLanguage] = useState(story?.language ?? "");
  const [tags, setTags] = useState((story?.tags ?? []).join(", "));
  const [memoryId, setMemoryId] = useState<number | null>(story?.memory_id ?? null);
  const [memorySearch, setMemorySearch] = useState("");
  const [memoryQuery, setMemoryQuery] = useState("");
  const { data: memoryOptions, isPending: memoriesLoading, error: memoriesError, refetch: reloadMemories } = useQuery({
    queryKey: ["family-story-linkable-memories", familyId, memoryQuery],
    queryFn: () => storiesClient.memories(familyId, memoryQuery),
  });
  const [precision, setPrecision] = useState<StoryPrecision | "unknown">(story?.date_precision ?? "unknown");
  const [year, setYear] = useState(story?.date_year?.toString() ?? "");
  const [month, setMonth] = useState(story?.date_month?.toString() ?? "");
  const [day, setDay] = useState(story?.date_day?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !body.trim()) { setError("Give this account a title and a story."); return; }
    const numericYear = Number(year);
    const numericMonth = Number(month);
    const numericDay = Number(day);
    if (precision !== "unknown" && (!Number.isInteger(numericYear) || numericYear < 1 || numericYear > new Date().getFullYear())) { setError("Enter a valid year, or choose “Date unknown”."); return; }
    if (["month", "day"].includes(precision) && (!Number.isInteger(numericMonth) || numericMonth < 1 || numericMonth > 12)) { setError("Enter a month between 1 and 12."); return; }
    if (precision === "day" && (!Number.isInteger(numericDay) || new Date(Date.UTC(numericYear, numericMonth - 1, numericDay)).getUTCDate() !== numericDay)) { setError("Enter a valid day for that month."); return; }
    const input: StoryInput = {
      title: title.trim(), body: body.trim(), audience,
      category, language: language.trim(), tags: tags.split(",").map(t => t.trim()).filter(Boolean),
      // On PATCH, explicit null removes a prior link/date; omission means "keep existing".
      ...(story || memoryId !== null ? { memory_id: memoryId } : {}),
      ...(story || precision !== "unknown" ? {
        date_precision: precision === "unknown" ? null : precision,
        date_year: precision === "unknown" ? null : precision === "decade" ? Math.floor(numericYear / 10) * 10 : numericYear,
        date_month: ["month", "day"].includes(precision) ? numericMonth : story ? null : undefined,
        date_day: precision === "day" ? numericDay : story ? null : undefined,
      } : {}),
    };
    setSaving(true); setError("");
    try {
      if (story) await storiesClient.update(familyId, story.id, input);
      else await storiesClient.create(familyId, input);
      toast.success(story ? "Story updated" : "Story entrusted to your family");
      onSaved(input);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Story could not be saved."); }
    finally { setSaving(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#071115]/80 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="story-editor-title" className={`max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] border border-[#536164] bg-[#1c3038] p-6 shadow-2xl sm:rounded-[2rem] sm:p-8 ${ink}`}>
      <div className="mb-7 flex items-start justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[.24em] text-[#e2b78b]">Family archive / written account</p><h2 id="story-editor-title" className="mt-2 font-serif text-3xl">{story?.author_id === null ? "Edit archival story" : story ? "Edit your story" : "Tell it as you remember it."}</h2><p className="mt-2 text-sm text-[#b7c4c0]">{story?.author_id === null ? "The original author was not recorded. Keep their account as faithful as you can." : "A story entrusted to relatives, in your own words."}</p></div><button type="button" onClick={onClose} aria-label="Close editor" className="rounded-full p-2 hover:bg-white/10"><X size={20} /></button></div>
      <form onSubmit={submit} className="space-y-5">
        <label className="block text-sm font-medium">Title <input data-testid="input-story-title" className={`${field} mt-2`} value={title} onChange={e => setTitle(e.target.value)} maxLength={180} placeholder="The Sunday we all came home" required /></label>
        <label className="block text-sm font-medium">Your account <textarea data-testid="input-story-body" className={`${field} mt-2 min-h-48 resize-y leading-7`} value={body} onChange={e => setBody(e.target.value)} placeholder="Start with what you remember. The small details matter." required /></label>
        <fieldset><legend className="mb-2 text-sm font-medium">Who may read this?</legend><div className="grid grid-cols-2 gap-2">{(["family", "private"] as const).map(value => <label key={value} className={`cursor-pointer rounded-xl border p-3 text-sm ${audience === value ? "border-[#e2b78b] bg-[#e2b78b]/10" : "border-[#536164]"}`}><input type="radio" name="audience" value={value} checked={audience === value} onChange={() => setAudience(value)} className="mr-2 accent-[#e2b78b]" />{value === "family" ? "My family" : "Only me"}<span className="mt-1 block pl-5 text-xs text-[#b7c4c0]">{value === "family" ? "Shared inside this Family Space" : "A private account"}</span></label>)}</div></fieldset>
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Category <select className={`${field} mt-2`} value={category} onChange={e => setCategory(e.target.value as NonNullable<StoryInput["category"]>)}><option value="written">Written account</option><option value="oral">Oral history</option><option value="tradition">Tradition</option><option value="recipe">Recipe</option><option value="song">Song</option><option value="proverb">Proverb</option><option value="biography">Biography</option></select></label><label className="text-sm font-medium">Language <input className={`${field} mt-2`} value={language} maxLength={50} onChange={e => setLanguage(e.target.value)} placeholder="e.g. English, Yoruba" /></label></div>
        <label className="block text-sm font-medium">When did this happen? <span className="font-normal text-[#b7c4c0]">It is okay not to know.</span><select className={`${field} mt-2`} value={precision} onChange={e => setPrecision(e.target.value as StoryPrecision | "unknown")}><option value="unknown">Date unknown / clear recorded date</option><option value="day">Exact day</option><option value="month">Month and year</option><option value="year">Year</option><option value="decade">Decade</option><option value="circa">Around a year</option></select></label>
        {story?.date_year && precision === "unknown" && <p className="-mt-3 text-xs text-[#e2b78b]">Saving will remove the recorded date from this story.</p>}
        {precision !== "unknown" && <div className="grid grid-cols-3 gap-3"><label className="text-xs">{precision === "decade" ? "A year in that decade" : "Year"}<input type="number" min="1" max={new Date().getFullYear()} required value={year} onChange={e => setYear(e.target.value)} className={`${field} mt-1`} placeholder="1974" /></label>{["month", "day"].includes(precision) && <label className="text-xs">Month<input type="number" min="1" max="12" required value={month} onChange={e => setMonth(e.target.value)} className={`${field} mt-1`} placeholder="1–12" /></label>}{precision === "day" && <label className="text-xs">Day<input type="number" min="1" max="31" required value={day} onChange={e => setDay(e.target.value)} className={`${field} mt-1`} placeholder="1–31" /></label>}</div>}
        <label className="block text-sm font-medium">Family names, places, or themes <span className="font-normal text-[#b7c4c0]">Separate with commas</span><input className={`${field} mt-2`} value={tags} onChange={e => setTags(e.target.value)} placeholder="Grandmother, Lagos, home" /></label>
        <div className="rounded-2xl border border-[#536164] bg-[#182a32] p-4">
          <p className="text-sm font-semibold">Link a memory or recording <span className="font-normal text-[#b7c4c0]">(optional)</span></p>
          <p className="mt-1 text-xs leading-5 text-[#b7c4c0]">An audio recording and its transcript can be heard and read alongside this account. Nothing is uploaded or copied here.</p>
          <div className="mt-3 flex gap-2"><input value={memorySearch} onChange={e => setMemorySearch(e.target.value)} placeholder="Search family memories" aria-label="Search family memories" className={field} /><button type="button" className={secondary} onClick={() => setMemoryQuery(memorySearch.trim())}>Search</button></div>
          {memoriesError && <p className="mt-3 text-xs text-[#ffc8b8]">Memories could not be loaded. You can still remove an existing link. <button type="button" className="underline" onClick={() => void reloadMemories()}>Try again</button></p>}
          <select aria-label="Linked memory" className={`${field} mt-3`} value={memoryId ?? ""} onChange={e => setMemoryId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{memoryId === null && memoriesLoading ? "Loading memories…" : story?.memory_id ? "No linked memory / remove link" : "No linked memory"}</option>
            {memoryId && !(memoryOptions?.memories ?? []).some(m => m.id === memoryId) && <option value={memoryId}>Selected memory #{memoryId}</option>}
            {(memoryOptions?.memories ?? []).map(m => <option key={m.id} value={m.id}>{m.title || `Memory #${m.id}`}{m.primary_asset?.asset_type === "audio" || m.source === "interview" ? " · recording" : ""}</option>)}
          </select>
          {story?.memory_id && memoryId === null && <p className="mt-2 text-xs text-[#e2b78b]">Saving will remove the linked recording from this story. The original memory will remain in the Vault.</p>}
        </div>
        {error && <p role="alert" className="text-sm text-[#ffc8b8]">{error}</p>}
        <div className="flex justify-end gap-3 border-t border-[#536164] pt-5"><button type="button" onClick={onClose} disabled={saving} className={secondary}>Cancel</button><button type="submit" disabled={saving} className={primary}>{saving ? "Saving…" : story ? "Save changes" : "Preserve story"} <ArrowRight size={16} /></button></div>
      </form>
    </section>
  </div>;
}

export default function FamilyStoriesExperience({ familyId, familyName, canWrite }: { familyId: number; familyName: string; canWrite: boolean }) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<FamilyStory | null>(null);
  const [editing, setEditing] = useState<FamilyStory | null | "new">(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const client = useQueryClient();
  useEffect(() => { setPage(1); setSelected(null); setEditing(null); }, [familyId]);
  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ["family-stories", familyId, page],
    queryFn: () => storiesClient.list(familyId, page),
    enabled: Number.isInteger(familyId) && familyId > 0,
  });
  function refresh() { void client.invalidateQueries({ queryKey: ["family-stories", familyId] }); }
  async function removeStory() {
    if (!selected) return;
    setDeleting(true); setDeleteError("");
    try {
      await storiesClient.remove(familyId, selected.id);
      toast.success("Story removed from the archive");
      setSelected(null);
      if (data?.stories.length === 1 && page > 1) setPage(page - 1);
      refresh();
    } catch (reason) { setDeleteError(reason instanceof Error ? reason.message : "Could not delete story."); }
    finally { setDeleting(false); }
  }
  return <div className={`relative -mx-4 -mt-4 min-h-[75dvh] bg-[#14252d] pb-16 ${ink}`}>
    <div className="border-b border-[#41545a] bg-[#1b323b] px-5 pb-7 pt-8 sm:px-8">
      <div className="mx-auto max-w-3xl"><div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[.25em] text-[#e2b78b]"><span className="h-px w-6 bg-[#e2b78b]" /> The family archive</div>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-5"><div><h2 className="font-serif text-4xl leading-tight sm:text-5xl">Stories we carry.</h2><p className="mt-3 max-w-md text-sm leading-6 text-[#bdc9c5]">Accounts remembered and entrusted to {familyName}. Not a public feed, but a place to keep each other’s voices close.</p></div>{canWrite && <button data-testid="button-write-story" onClick={() => setEditing("new")} className={primary}><Plus size={17} /> Write a story</button>}</div>
      </div>
    </div>
    <div className="mx-auto max-w-3xl px-5 pt-7 sm:px-8">
      {selected ? <article className="animate-in fade-in duration-300">
        <button data-testid="button-back-to-stories" onClick={() => { setSelected(null); setDeleteError(""); }} className="mb-8 flex items-center gap-2 text-sm text-[#e2b78b] hover:underline"><ArrowLeft size={16} /> All family stories</button>
        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[.16em] text-[#d5ad88]"><span>{selected.category || "Family account"}</span><span className="h-1 w-1 rounded-full bg-[#b7c4c0]" /><span>{storyDate(selected)}</span></div>
        <h2 data-testid="text-story-title" className="max-w-2xl font-serif text-4xl leading-tight sm:text-5xl">{selected.title}</h2>
        <div className="mt-6 flex items-center gap-3 border-b border-[#4b5d60] pb-7"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#a46f57] font-serif text-lg text-[#fff4e7]">{authorInitial(selected)}</span><div className="text-sm"><p className="font-semibold">{selected.author_id === null ? storyAuthor(selected) : `Told by ${storyAuthor(selected)}`}</p><p className="mt-0.5 flex items-center gap-1.5 text-[#b7c4c0]">{selected.audience === "private" ? <LockKeyhole size={13} /> : <UsersRound size={13} />}{selected.audience === "private" ? "Private story" : "Shared with family"}</p></div></div>
        <div className="space-y-5 py-8 font-serif text-lg leading-[1.9] text-[#e5e1d7]">{selected.body.split(/\n\s*\n/).map((paragraph, index) => <p className="whitespace-pre-wrap" key={index}>{paragraph}</p>)}</div>
        {selected.memory_id && <div className="mb-8"><p className="mb-4 text-xs font-bold uppercase tracking-[.2em] text-[#c5ac92]">Listen & read / linked memory</p><OralHistory familyId={familyId} memoryId={selected.memory_id} /></div>}
        {selected.tags?.length > 0 && <div className="mb-8 flex flex-wrap gap-2">{selected.tags.map((tag, i) => <span key={`${tag}-${i}`} className="rounded-full border border-[#586b69] px-3 py-1 text-xs text-[#c7d1cb]">{tag}</span>)}</div>}
        <p className="border-t border-[#4b5d60] pt-5 text-xs text-[#b7c4c0]">Added to this archive {new Date(selected.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}{selected.language ? ` · ${selected.language}` : ""}</p>
        {selected.viewer_can_manage && <div className="mt-6 flex flex-wrap gap-3"><button data-testid="button-edit-story" className={secondary} onClick={() => setEditing(selected)}><span className="flex items-center gap-2"><PenLine size={15} /> {selected.author_id === null ? "Edit archival story" : "Edit my story"}</span></button><button data-testid="button-delete-story" className="rounded-xl border border-[#ab786d] px-4 py-2.5 text-sm text-[#ffc8b8] hover:bg-[#ab786d]/10" onClick={() => setDeleteError("confirm")}><span className="flex items-center gap-2"><Trash2 size={15} /> Delete</span></button></div>}
        {deleteError === "confirm" && <div className="mt-4 rounded-2xl border border-[#ab786d] bg-[#412e30] p-5"><p className="font-semibold">Remove this story permanently?</p><p className="mt-1 text-sm text-[#e2cdca]">This cannot be undone.</p><div className="mt-4 flex gap-3"><button className={secondary} onClick={() => setDeleteError("")}>Keep story</button><button disabled={deleting} className="rounded-xl bg-[#e9ac9c] px-4 py-2 text-sm font-semibold text-[#2d1e20]" onClick={() => void removeStory()}>{deleting ? "Deleting…" : "Yes, delete"}</button></div></div>}
        {deleteError && deleteError !== "confirm" && <p role="alert" className="mt-4 text-sm text-[#ffc8b8]">{deleteError} <button className="underline" onClick={() => setDeleteError("confirm")}>Try again</button></p>}
      </article> : <>
        <div className="mb-5 flex items-center justify-between gap-3"><p className="text-xs uppercase tracking-[.18em] text-[#b7c4c0]">{data ? `${data.total} ${data.total === 1 ? "account" : "accounts"} preserved` : "The collection"}</p>{isFetching && !isPending && <span className="text-xs text-[#b7c4c0]">Updating…</span>}</div>
        {isPending ? <div aria-label="Loading family stories" className="space-y-4">{[0, 1, 2].map(i => <div key={i} className="h-44 animate-pulse rounded-2xl bg-[#26404a]" />)}</div> : error ? <div role="alert" className="rounded-3xl border border-[#795d56] bg-[#2b3438] px-6 py-12 text-center"><AlertCircle className="mx-auto mb-4 text-[#e2b78b]" size={30} /><h3 className="font-serif text-2xl">The archive is out of reach.</h3><p className="mt-2 text-sm text-[#bac9c4]">{error.message}</p><button className={`${secondary} mt-5 inline-flex items-center gap-2`} onClick={() => void refetch()}><RefreshCw size={15} /> Try again</button></div> : !data?.stories.length ? <div className="rounded-3xl border border-dashed border-[#637372] bg-[#1b3038] px-6 py-14 text-center"><BookOpen size={34} className="mx-auto text-[#e2b78b]" strokeWidth={1.5} /><h3 className="mt-5 font-serif text-3xl">{page > 1 ? "No stories on this page." : "Every family has a beginning."}</h3><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#bdc9c5]">{page > 1 ? "Go back to the previous page of stories." : canWrite ? "It might be a childhood place, a person you miss, or a lesson worth passing on. Tell it in your own words." : "When a family member shares an account, it will live here."}</p>{page > 1 ? <button className={`${secondary} mt-6`} onClick={() => setPage(page - 1)}>Previous page</button> : canWrite && <button className={`${primary} mt-6`} onClick={() => setEditing("new")}><PenLine size={16} /> Write the first story</button>}</div> : <>
          <div className="space-y-4">{data.stories.map((story, index) => <button data-testid={`button-open-story-${story.id}`} key={story.id} onClick={() => setSelected(story)} className="group relative block w-full overflow-hidden rounded-2xl border border-[#4a6063] bg-[#20353d] p-6 text-left transition-colors hover:border-[#d7a778] hover:bg-[#29414a] sm:p-8">
            <span className="absolute right-6 top-6 font-serif text-4xl text-[#e2b78b]/20">{String((page - 1) * data.limit + index + 1).padStart(2, "0")}</span><div className="mb-4 flex flex-wrap gap-x-3 gap-y-1 pr-10 text-[11px] font-semibold uppercase tracking-[.17em] text-[#e2b78b]"><span>{story.category || "Family account"}</span><span className="text-[#b7c4c0]">/</span><span className="flex items-center gap-1"><CalendarDays size={12} /> {storyDate(story)}</span></div>
            <h3 className="max-w-xl font-serif text-2xl leading-snug sm:text-3xl">{story.title}</h3><p className="mt-3 line-clamp-3 max-w-xl text-sm leading-6 text-[#c3ceca]">{story.body}</p>
            <div className="mt-6 flex items-center justify-between gap-4 border-t border-[#526668] pt-4 text-xs text-[#c3ceca]"><span className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#a46f57] font-serif text-[#fff4e7]">{authorInitial(story)}</span> {storyAuthor(story)}</span><span className="flex items-center gap-1.5">{story.audience === "private" ? <LockKeyhole size={13} /> : <UsersRound size={13} />}{story.audience === "private" ? "Private" : "Family"} <ChevronRight size={15} className="ml-1 text-[#e2b78b] transition-transform group-hover:translate-x-1" /></span></div>
          </button>)}</div>
          <div className="mt-8 flex items-center justify-between"><button className={`${secondary} inline-flex items-center gap-2`} disabled={page <= 1} onClick={() => { setPage(p => p - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}><ChevronLeft size={16} /> Previous</button><span className="text-xs text-[#b7c4c0]">Page {data.page} of {Math.max(1, Math.ceil(data.total / data.limit))}</span><button className={`${secondary} inline-flex items-center gap-2`} disabled={!data.has_more} onClick={() => { setPage(p => p + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Next <ChevronRight size={16} /></button></div>
        </>}
      </>}
    </div>
    {editing !== null && <StoryEditor key={editing === "new" ? "new" : editing.id} familyId={familyId} story={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={input => { if (editing && editing !== "new") setSelected(previous => previous?.id === editing.id ? { ...previous, ...input, date_label: null } : previous); else { setSelected(null); setPage(1); } setEditing(null); refresh(); }} />}
  </div>;
}