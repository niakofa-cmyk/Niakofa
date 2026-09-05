import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, ExternalLink, FileSearch, Loader2, Plus, Save, StickyNote } from "lucide-react";
import { useLocation } from "wouter";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { diasporaTheme } from "@/lib/diaspora/theme";
import { RESEARCH_EVIDENCE_LABELS, type ResearchEvidenceType } from "@/lib/diaspora/researchEvidence";
import { ResearchEvidenceTypeSelect } from "@/components/diaspora/ResearchEvidenceTypeSelect";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
const api = (path: string, init?: RequestInit) => fetch(`${BASE}${path}`, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) } });

type Family = { id: number; name: string; status?: string };
type Person = { id: number; display_name: string; relation_note?: string | null };
type ResearchCase = { id: number; family_id: number; person_member_id?: number | null; title: string; research_question: string; status: string; confidence: string; updated_at?: string };
type Evidence = { id: number; title: string; evidence_type: ResearchEvidenceType; confidence: string; source_url?: string | null; citation?: string | null; notes?: string | null; source_date?: string | null };
type Note = { id: number; body: string; created_at?: string };

export default function ResearchCenterPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [families, setFamilies] = useState<Family[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [familyId, setFamilyId] = useState<number | null>(null);
  const [cases, setCases] = useState<ResearchCase[]>([]);
  const [selectedCase, setSelectedCase] = useState<ResearchCase | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [guides, setGuides] = useState<Array<{ title: string; description?: string; url?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [personId, setPersonId] = useState("");
  const [caseStatus, setCaseStatus] = useState("open");
  const [caseConfidence, setCaseConfidence] = useState("unreviewed");
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [evidenceType, setEvidenceType] = useState<ResearchEvidenceType>("document");
  const [evidenceConfidence, setEvidenceConfidence] = useState("possible");
  const [sourceUrl, setSourceUrl] = useState("");
  const [citation, setCitation] = useState("");
  const [evidenceNotes, setEvidenceNotes] = useState("");
  const [noteBody, setNoteBody] = useState("");

  const activeFamilies = useMemo(() => families.filter((f) => f.status !== "inactive"), [families]);

  async function loadFamilies() {
    const res = await api("/api/family/mine");
    if (!res.ok) throw new Error("Unable to load Family Spaces.");
    const data = await res.json();
    const next = (data.families ?? []) as Family[];
    setFamilies(next);
    const first = next.find((f) => f.status === "active") ?? next[0];
    if (first) setFamilyId(first.id);
  }

  async function loadFamilyData(nextFamilyId: number) {
    const [membersRes, casesRes] = await Promise.all([
      api(`/api/family/${nextFamilyId}/members`),
      api(`/api/diaspora/research/cases?family_id=${nextFamilyId}`),
    ]);
    if (!membersRes.ok || !casesRes.ok) throw new Error("Unable to load research workspace.");
    const members = await membersRes.json();
    const caseData = await casesRes.json();
    setPeople((members.members ?? []).filter((m: Person & { status?: string }) => m.status !== "inactive"));
    setCases(caseData.cases ?? []);
  }

  async function loadGuides() {
    const res = await api("/api/diaspora/research/guides");
    if (res.ok) {
      const data = await res.json();
      setGuides(data.guides ?? []);
    }
  }

  async function openCase(caseId: number) {
    const res = await api(`/api/diaspora/research/cases/${caseId}`);
    if (!res.ok) throw new Error("Unable to open research case.");
    const data = await res.json();
    setSelectedCase(data.case);
    setCaseStatus(data.case.status);
    setCaseConfidence(data.case.confidence);
    setPersonId(data.case.person_member_id ? String(data.case.person_member_id) : "");
    setEvidence(data.evidence ?? []);
    setNotes(data.notes ?? []);
    setError("");
  }

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    Promise.all([loadFamilies(), loadGuides()]).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [currentUser]);

  useEffect(() => {
    if (!familyId) return;
    loadFamilyData(familyId).catch((err) => setError(err.message));
  }, [familyId]);

  async function createCase() {
    if (!familyId || !caseTitle.trim() || !question.trim()) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const res = await api("/api/diaspora/research/cases", { method: "POST", body: JSON.stringify({ family_id: familyId, person_member_id: personId ? Number(personId) : null, title: caseTitle.trim(), research_question: question.trim() }) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not create research case.");
      const data = await res.json();
      setCaseTitle(""); setQuestion(""); setPersonId("");
      await loadFamilyData(familyId);
      await openCase(data.case.id);
      setSuccess("Research case opened.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create research case."); } finally { setSaving(false); }
  }

  async function updateCase(updates: Partial<ResearchCase>) {
    if (!selectedCase) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const res = await api(`/api/diaspora/research/cases/${selectedCase.id}`, { method: "PATCH", body: JSON.stringify(updates) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not update research case.");
      const data = await res.json();
      if (familyId) await loadFamilyData(familyId);
      setSelectedCase(data.case);
      setCaseStatus(data.case.status);
      setCaseConfidence(data.case.confidence);
      setPersonId(data.case.person_member_id ? String(data.case.person_member_id) : "");
      setSuccess("Case updated.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update research case."); } finally { setSaving(false); }
  }

  async function addEvidence() {
    if (!selectedCase || !evidenceTitle.trim()) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const res = await api(`/api/diaspora/research/cases/${selectedCase.id}/evidence`, { method: "POST", body: JSON.stringify({ title: evidenceTitle.trim(), evidence_type: evidenceType, confidence: evidenceConfidence, source_url: sourceUrl.trim() || undefined, citation: citation.trim() || undefined, notes: evidenceNotes.trim() || undefined }) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not save evidence.");
      setEvidenceTitle(""); setSourceUrl(""); setCitation(""); setEvidenceNotes("");
      await openCase(selectedCase.id);
      setSuccess("Evidence saved.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save evidence."); } finally { setSaving(false); }
  }

  async function addNote() {
    if (!selectedCase || !noteBody.trim()) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const res = await api(`/api/diaspora/research/cases/${selectedCase.id}/notes`, { method: "POST", body: JSON.stringify({ body: noteBody.trim() }) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not save note.");
      setNoteBody(""); await openCase(selectedCase.id);
      setSuccess("Note saved.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save note."); } finally { setSaving(false); }
  }

  async function handoffTimeline() {
    if (!selectedCase) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const res = await api(`/api/diaspora/research/cases/${selectedCase.id}/handoff/timeline`, { method: "POST", body: JSON.stringify({ title: selectedCase.title, description: selectedCase.research_question }) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Timeline handoff failed.");
      navigate("/diaspora/timeline");
    } catch (err) { setError(err instanceof Error ? err.message : "Timeline handoff failed."); } finally { setSaving(false); }
  }

  if (loading) return <main className={`${diasporaTheme.page} min-h-screen p-8 flex items-center justify-center`}><Loader2 className="animate-spin" /></main>;
  if (!currentUser) return <main className={`${diasporaTheme.page} min-h-screen p-8`}><p>Please sign in to enter the Research workspace.</p></main>;

  return (
    <main className={`${diasporaTheme.page} min-h-screen ${diasporaTheme.pageGlow}`}>
      <div className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <button onClick={() => navigate("/diaspora")} className={`${diasporaTheme.focus} mb-6 inline-flex items-center gap-2 text-sm text-white/60 hover:text-white`}><ArrowLeft size={16} /> Diaspora journey</button>
        <header className="mb-8 max-w-4xl">
          <p className={`text-xs uppercase tracking-[0.22em] ${diasporaTheme.teal.text}`}>Research · evidence · handoff</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">Turn family questions into a living case.</h1>
          <p className="mt-3 text-white/60">Keep sources, oral history, pedigree clues, place history, DNA leads, and your own reasoning together. Nothing here silently resolves a question.</p>
        </header>

        {error && <div className="mb-5 rounded-xl border border-rose-300/20 bg-rose-300/10 p-3 text-sm text-rose-100">{error}</div>}
        {success && <div className="mb-5 rounded-xl border border-teal-300/20 bg-teal-300/10 p-3 text-sm text-teal-100">{success}</div>}

        <section className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <aside className={`${diasporaTheme.panel} ${diasporaTheme.radius} p-4`}>
            <label className="text-xs text-white/50">Family Space</label>
            <select value={familyId ?? ""} onChange={(e) => setFamilyId(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white">
              {activeFamilies.map((family) => <option key={family.id} value={family.id} className="bg-[#0b1917]">{family.name}</option>)}
            </select>
            <div className="mt-6 border-t border-white/10 pt-5">
              <div className="flex items-center justify-between"><span className="text-sm text-white/70">Cases</span><span className="text-xs text-white/40">{cases.length}</span></div>
              <div className="mt-3 space-y-2">{cases.map((item) => <button key={item.id} onClick={() => openCase(item.id)} className={`w-full rounded-xl border px-3 py-3 text-left ${selectedCase?.id === item.id ? "border-teal-300/30 bg-teal-300/10" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"}`}><div className="text-sm font-medium">{item.title}</div><div className="mt-1 text-[11px] text-white/40">{item.status} · {item.confidence}</div></button>)}</div>
            </div>
          </aside>

          <div className="space-y-5">
            {!selectedCase ? <section className={`${diasporaTheme.panelStrong} ${diasporaTheme.radiusHero} ${diasporaTheme.shadow} p-6 md:p-8`}>
              <div className="flex items-center gap-3"><div className={`rounded-xl ${diasporaTheme.teal.soft} p-3 ${diasporaTheme.teal.text}`}><Plus size={20} /></div><div><h2 className="text-xl font-semibold">Open a research case</h2><p className="text-sm text-white/50">Start with a question worth carrying forward.</p></div></div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <input value={caseTitle} onChange={(e) => setCaseTitle(e.target.value)} placeholder="Case title" className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30" />
                <select value={personId} onChange={(e) => setPersonId(e.target.value)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"><option value="" className="bg-[#0b1917]">No person attached yet</option>{people.map((p) => <option key={p.id} value={p.id} className="bg-[#0b1917]">{p.display_name}</option>)}</select>
                <textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What are you trying to learn?" rows={5} className="md:col-span-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30" />
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button disabled={saving || !caseTitle.trim() || !question.trim()} onClick={createCase} className="inline-flex items-center gap-2 rounded-xl bg-teal-300 px-4 py-3 text-sm font-semibold text-[#071312] disabled:opacity-40"><Save size={16} /> Create case</button>
                {saving && <Loader2 className="w-5 h-5 animate-spin text-teal-300/50"/>}
              </div>
            </section> : <>
              <section className={`${diasporaTheme.panelStrong} ${diasporaTheme.radiusHero} p-6 md:p-8`}>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><p className={`text-xs uppercase tracking-[0.2em] ${diasporaTheme.teal.text}`}>Active case</p><h2 className="mt-2 text-2xl font-semibold">{selectedCase.title}</h2><p className="mt-2 text-white/60">{selectedCase.research_question}</p></div><button onClick={() => setSelectedCase(null)} className="text-sm text-white/50 hover:text-white">New case</button></div>

                <div className="mt-6 border-t border-white/10 pt-6">
                  <div className="flex items-center gap-2 mb-4"><FileSearch size={16} className="text-amber-300"/><h3 className="text-sm font-semibold text-white/80">Case status & resolution</h3></div>
                  <div className="flex flex-wrap items-center gap-3">
                    <select disabled={saving} value={caseStatus} onChange={(e) => updateCase({ status: e.target.value })} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                      <option value="open" className="bg-[#0b1917]">Status: Open</option>
                      <option value="paused" className="bg-[#0b1917]">Status: Paused</option>
                      <option value="resolved" className="bg-[#0b1917]">Status: Resolved</option>
                    </select>
                    <select disabled={saving} value={caseConfidence} onChange={(e) => updateCase({ confidence: e.target.value })} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                      <option value="unreviewed" className="bg-[#0b1917]">Confidence: Unreviewed</option>
                      <option value="possible" className="bg-[#0b1917]">Confidence: Possible</option>
                      <option value="supported" className="bg-[#0b1917]">Confidence: Supported</option>
                      <option value="strong" className="bg-[#0b1917]">Confidence: Strong</option>
                    </select>
                    <select disabled={saving} value={personId} onChange={(e) => updateCase({ person_member_id: e.target.value ? Number(e.target.value) : null })} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                      <option value="" className="bg-[#0b1917]">No person attached</option>
                      {people.map((p) => <option key={p.id} value={p.id} className="bg-[#0b1917]">{p.display_name}</option>)}
                    </select>
                    {selectedCase.status !== 'resolved' && <button disabled={saving} onClick={() => updateCase({ status: 'resolved' })} className="rounded-xl border border-teal-300/20 bg-teal-300/10 px-4 py-2 text-sm font-medium text-teal-100 disabled:opacity-40 hover:bg-teal-300/20 transition-colors">Resolve after review</button>}
                    {saving && <Loader2 className="w-4 h-4 animate-spin text-white/50"/>}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2"><button disabled={!selectedCase.person_member_id || saving} onClick={handoffTimeline} className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-sm text-amber-100 disabled:opacity-40 hover:bg-amber-300/20 transition-colors">Send to Legacy Timeline</button></div>
              </section>

              <section className="grid gap-5 xl:grid-cols-2">
                <div className={`${diasporaTheme.panel} ${diasporaTheme.radius} p-5`}><div className="flex items-center gap-2"><FileSearch size={18} className={diasporaTheme.teal.text} /><h3 className="font-semibold">Add evidence</h3></div><div className="mt-4 space-y-3"><input value={evidenceTitle} onChange={(e) => setEvidenceTitle(e.target.value)} placeholder="Evidence title" className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white placeholder:text-white/30" /><ResearchEvidenceTypeSelect value={evidenceType} onChange={setEvidenceType} disabled={saving} /><select value={evidenceConfidence} onChange={(e) => setEvidenceConfidence(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white"><option value="unreviewed" className="bg-[#0b1917]">Unreviewed</option><option value="possible" className="bg-[#0b1917]">Possible</option><option value="supported" className="bg-[#0b1917]">Supported</option><option value="strong" className="bg-[#0b1917]">Strong</option></select><input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="Source URL (optional)" className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white placeholder:text-white/30" /><input value={citation} onChange={(e) => setCitation(e.target.value)} placeholder="Citation / archive reference (optional)" className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white placeholder:text-white/30" /><textarea value={evidenceNotes} onChange={(e) => setEvidenceNotes(e.target.value)} rows={3} placeholder="Why does this matter?" className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white placeholder:text-white/30" /><div className="flex items-center gap-3"><button disabled={saving || !evidenceTitle.trim()} onClick={addEvidence} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#071312] disabled:opacity-40"><Plus size={16} /> Save evidence</button>{saving && <Loader2 className="w-4 h-4 animate-spin text-white/50"/>}</div></div></div>
                <div className={`${diasporaTheme.panel} ${diasporaTheme.radius} p-5`}><div className="flex items-center gap-2"><StickyNote size={18} className="text-amber-300" /><h3 className="font-semibold">Research notes</h3></div><textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} rows={4} placeholder="Record your reasoning, contradiction, next step, or family clue…" className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white placeholder:text-white/30" /><div className="mt-2 flex items-center gap-3"><button disabled={saving || !noteBody.trim()} onClick={addNote} className="inline-flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-sm text-amber-100 disabled:opacity-40"><Save size={16} /> Save note</button>{saving && <Loader2 className="w-4 h-4 animate-spin text-amber-100/50"/>}</div><div className="mt-4 space-y-2">{notes.map((note) => <div key={note.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm text-white/65">{note.body}</div>)}</div></div>
              </section>

              <section className={`${diasporaTheme.panel} ${diasporaTheme.radius} p-5`}><h3 className="font-semibold">Evidence ledger</h3><div className="mt-4 grid gap-3">{evidence.length ? evidence.map((item) => <article key={item.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-medium">{item.title}</div><div className="flex gap-2 text-[11px]"><span className="rounded-full bg-white/5 px-2 py-1">{RESEARCH_EVIDENCE_LABELS[item.evidence_type]}</span><span className="rounded-full bg-amber-300/10 px-2 py-1 text-amber-100">{item.confidence}</span></div></div>{item.citation && <p className="mt-2 text-sm text-white/50">{item.citation}</p>}{item.notes && <p className="mt-2 text-sm text-white/55">{item.notes}</p>}{item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-teal-300">Open source <ExternalLink size={12} /></a>}</article>) : <p className="text-sm text-white/40">No evidence captured yet.</p>}</div></section>
            </>}

            {guides.length > 0 && <section className={`${diasporaTheme.panel} ${diasporaTheme.radius} p-5`}><div className="flex items-center gap-2"><BookOpen size={18} className="text-emerald-300" /><h3 className="font-semibold">Research guides</h3></div><div className="mt-3 grid gap-3 md:grid-cols-2">{guides.slice(0, 6).map((guide, index) => <a key={`${guide.title}-${index}`} href={guide.url || "#"} target={guide.url ? "_blank" : undefined} rel="noreferrer" className="rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:bg-white/[0.05]"><div className="font-medium">{guide.title}</div>{guide.description && <div className="mt-1 text-sm text-white/45">{guide.description}</div>}</a>)}</div></section>}
          </div>
        </section>
      </div>
    </main>
  );
}
