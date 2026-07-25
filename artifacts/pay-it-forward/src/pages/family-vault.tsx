/**
 * Family Vault — memories list for a single Family Space
 * Route: /family/:id
 */

import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft, Plus, Search, Image, Mic, FileText, Video,
  Users, Settings, BookHeart, Loader2, Calendar, MapPin, Tag,
  ChevronRight, Trash2, UserPlus,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "sonner";

interface Family {
  id: number;
  name: string;
  description: string | null;
  cover_image_url: string | null;
}

interface FamilyMember {
  id: number;
  display_name: string;
  role: string;
  status: string;
  user_id: number | null;
  relation_note: string | null;
}

interface Memory {
  id: number;
  title: string | null;
  description: string | null;
  memory_date: string | null;
  memory_date_precision: string;
  location_label: string | null;
  source: string;
  visibility: string;
  created_at: string;
  updated_at: string;
  primary_asset: {
    id: number;
    asset_type: string;
    storage_key: string;
    thumbnail_key: string | null;
    processing_status: string;
  } | null;
}

function formatMemoryDate(date: string | null, precision: string) {
  if (!date) return null;
  const d = new Date(date);
  if (precision === "year") return d.getFullYear().toString();
  if (precision === "month") return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
  if (precision === "circa") return `c. ${d.getFullYear()}`;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function sourceIcon(source: string) {
  switch (source) {
    case "interview": return <Mic className="w-3.5 h-3.5" />;
    case "document":  return <FileText className="w-3.5 h-3.5" />;
    default:          return <Image className="w-3.5 h-3.5" />;
  }
}

type TabId = "memories" | "members" | "interviews";

export default function FamilyVaultPage() {
  const { currentUser } = useAppContext();
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const familyId = Number(id);

  const [tab, setTab] = useState<TabId>("memories");
  const [family, setFamily] = useState<Family | null>(null);
  const [myRole, setMyRole] = useState<string>("contributor");
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [memoryCount, setMemoryCount] = useState(0);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [showAddMemory, setShowAddMemory] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  // add memory form
  const [mTitle, setMTitle]  = useState("");
  const [mDesc, setMDesc]    = useState("");
  const [mDate, setMDate]    = useState("");
  const [mLoc, setMLoc]      = useState("");
  const [mTags, setMTags]    = useState("");
  const [mSaving, setMSaving] = useState(false);

  // invite form
  const [iName, setIName]   = useState("");
  const [iEmail, setIEmail] = useState("");
  const [iRel, setIRel]     = useState("");
  const [iRole, setIRole]   = useState<"contributor" | "viewer">("contributor");
  const [iSaving, setISaving] = useState(false);

  useEffect(() => {
    if (!currentUser || !familyId) return;
    loadFamily();
    loadMemories();
  }, [currentUser, familyId]);

  async function loadFamily() {
    try {
      const res = await fetch(`/api/family/${familyId}`, { headers: authHeaders() });
      if (res.status === 403) { navigate("/family"); return; }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFamily(data.family);
      setMyRole(data.my_role);
      setMembers(data.members ?? []);
      setMemoryCount(data.memory_count ?? 0);
    } catch {
      toast.error("Couldn't load Family Space");
      navigate("/family");
    }
  }

  async function loadMemories(q?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (q) params.set("q", q);
      const res = await fetch(`/api/family/${familyId}/memories?${params}`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMemories(data.memories ?? []);
    } catch {
      toast.error("Couldn't load memories");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddMemory(e: React.FormEvent) {
    e.preventDefault();
    if (!mTitle.trim() && !mDesc.trim()) {
      toast.error("Add a title or description");
      return;
    }
    setMSaving(true);
    try {
      const tags = mTags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
      const res = await fetch(`/api/family/${familyId}/memories`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          title:          mTitle.trim() || undefined,
          description:    mDesc.trim() || undefined,
          memory_date:    mDate || undefined,
          location_label: mLoc.trim() || undefined,
          tags:           tags.length ? tags : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success("Memory added!");
      setShowAddMemory(false);
      setMTitle(""); setMDesc(""); setMDate(""); setMLoc(""); setMTags("");
      loadMemories(searchQ || undefined);
    } catch (err: any) {
      toast.error(err.message ?? "Couldn't save memory");
    } finally {
      setMSaving(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!iName.trim()) { toast.error("Name is required"); return; }
    setISaving(true);
    try {
      const res = await fetch(`/api/family/${familyId}/members`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name:  iName.trim(),
          invite_email:  iEmail.trim() || undefined,
          relation_note: iRel.trim() || undefined,
          role:          iRole,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success(`${iName} invited!`);
      setShowInvite(false);
      setIName(""); setIEmail(""); setIRel(""); setIRole("contributor");
      loadFamily();
    } catch (err: any) {
      toast.error(err.message ?? "Couldn't invite member");
    } finally {
      setISaving(false);
    }
  }

  async function handleDeleteMemory(memoryId: number) {
    if (!confirm("Delete this memory permanently?")) return;
    try {
      const res = await fetch(`/api/family/${familyId}/memories/${memoryId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success("Memory deleted");
      setMemories(ms => ms.filter(m => m.id !== memoryId));
    } catch (err: any) {
      toast.error(err.message ?? "Couldn't delete memory");
    }
  }

  const canWrite  = ["owner", "curator", "contributor"].includes(myRole);
  const canManage = ["owner", "curator"].includes(myRole);

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Sign in to view your Family Vault</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/family")} className="p-2 -ml-2 rounded-lg active:bg-muted">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-foreground truncate">{family?.name ?? "Family Vault"}</h1>
            <p className="text-xs text-muted-foreground capitalize">{myRole} · {memoryCount} memories</p>
          </div>
          {canWrite && (
            <button
              onClick={() => setShowAddMemory(true)}
              className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-medium active:opacity-80"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="max-w-lg mx-auto flex border-b border-border">
          {(["memories", "members", "interviews"] as TabId[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        {/* ── Memories tab ── */}
        {tab === "memories" && (
          <>
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={searchQ}
                onChange={e => {
                  setSearchQ(e.target.value);
                  if (e.target.value.length === 0 || e.target.value.length >= 2) {
                    loadMemories(e.target.value || undefined);
                  }
                }}
                placeholder="Search memories…"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                style={{ fontSize: "16px" }}
              />
            </div>

            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
              </div>
            ) : memories.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <BookHeart className="w-12 h-12 text-primary/40 mx-auto" />
                <p className="font-semibold text-foreground">No memories yet</p>
                <p className="text-sm text-muted-foreground">
                  {canWrite ? "Start preserving your family's story." : "No memories have been added yet."}
                </p>
                {canWrite && (
                  <button
                    onClick={() => setShowAddMemory(true)}
                    className="mt-2 bg-primary text-primary-foreground px-5 py-2 rounded-xl text-sm font-medium"
                  >
                    Add a Memory
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {memories.map(m => (
                  <div
                    key={m.id}
                    className="bg-card rounded-2xl border border-border overflow-hidden"
                  >
                    <button
                      onClick={() => navigate(`/family/${familyId}/memory/${m.id}`)}
                      className="w-full flex gap-3 p-4 text-left active:bg-muted/50"
                    >
                      {/* Thumbnail / icon */}
                      <div className="w-14 h-14 rounded-xl flex-shrink-0 bg-muted flex items-center justify-center overflow-hidden">
                        {m.primary_asset?.asset_type === "photo" && m.primary_asset.thumbnail_key ? (
                          <img
                            src={`/api/family/assets/${m.primary_asset.thumbnail_key}`}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="text-muted-foreground">
                            {m.source === "interview" ? (
                              <Mic className="w-6 h-6" />
                            ) : (
                              <Image className="w-6 h-6" />
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-foreground line-clamp-1">
                          {m.title ?? "Untitled memory"}
                        </p>
                        {m.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{m.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {m.memory_date && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="w-3 h-3" />
                              {formatMemoryDate(m.memory_date, m.memory_date_precision)}
                            </span>
                          )}
                          {m.location_label && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="w-3 h-3" />
                              {m.location_label}
                            </span>
                          )}
                          <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${
                            m.visibility === "private"
                              ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                              : "bg-primary/10 text-primary"
                          }`}>
                            {sourceIcon(m.source)}
                            {m.source}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 self-center" />
                    </button>

                    {canWrite && (
                      <div className="px-4 pb-3 flex justify-end">
                        <button
                          onClick={() => handleDeleteMemory(m.id)}
                          className="text-xs text-destructive flex items-center gap-1 active:opacity-70"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Members tab ── */}
        {tab === "members" && (
          <div className="space-y-3">
            {canManage && (
              <button
                onClick={() => setShowInvite(true)}
                className="w-full flex items-center justify-center gap-2 border border-dashed border-primary text-primary rounded-xl py-3 text-sm font-medium active:opacity-70"
              >
                <UserPlus className="w-4 h-4" /> Invite a family member
              </button>
            )}
            {members.map(m => (
              <div key={m.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary">
                    {m.display_name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{m.display_name}</p>
                  <div className="flex items-center gap-2">
                    {m.relation_note && (
                      <span className="text-xs text-muted-foreground">{m.relation_note}</span>
                    )}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium capitalize ${
                      m.role === "owner"
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {m.role}
                    </span>
                    {m.status === "invited" && (
                      <span className="text-xs text-orange-500">pending</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Interviews tab ── */}
        {tab === "interviews" && (
          <InterviewsTab familyId={familyId} canWrite={canWrite} />
        )}
      </div>

      {/* Add Memory modal */}
      {showAddMemory && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card rounded-2xl p-5 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-3">Add a Memory</h2>
            <form onSubmit={handleAddMemory} className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-1">Title</label>
                <input
                  value={mTitle}
                  onChange={e => setMTitle(e.target.value)}
                  placeholder="e.g. Grandma's birthday 1985"
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  style={{ fontSize: "16px" }}
                  maxLength={200}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Description / Story</label>
                <textarea
                  value={mDesc}
                  onChange={e => setMDesc(e.target.value)}
                  placeholder="What's the story behind this memory?"
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  style={{ fontSize: "16px" }}
                  rows={3}
                  maxLength={2000}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium block mb-1">Date (optional)</label>
                  <input
                    type="date"
                    value={mDate}
                    onChange={e => setMDate(e.target.value)}
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    style={{ fontSize: "16px" }}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Location</label>
                  <input
                    value={mLoc}
                    onChange={e => setMLoc(e.target.value)}
                    placeholder="City, country…"
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    style={{ fontSize: "16px" }}
                    maxLength={200}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Tags (comma-separated)</label>
                <input
                  value={mTags}
                  onChange={e => setMTags(e.target.value)}
                  placeholder="wedding, Nigeria, 1970s"
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  style={{ fontSize: "16px" }}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddMemory(false)}
                  className="flex-1 border border-input rounded-lg py-2 text-sm font-medium active:opacity-70"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={mSaving}
                  className="flex-1 bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {mSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Save Memory
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card rounded-2xl p-5 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold mb-3">Invite a Family Member</h2>
            <form onSubmit={handleInvite} className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-1">Name *</label>
                <input
                  value={iName}
                  onChange={e => setIName(e.target.value)}
                  placeholder='e.g. "Grandma Rose"'
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  style={{ fontSize: "16px" }}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Relation</label>
                <input
                  value={iRel}
                  onChange={e => setIRel(e.target.value)}
                  placeholder='e.g. "Grandmother on Dad\'s side"'
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  style={{ fontSize: "16px" }}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Email (optional)</label>
                <input
                  type="email"
                  value={iEmail}
                  onChange={e => setIEmail(e.target.value)}
                  placeholder="to send an invite link later"
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  style={{ fontSize: "16px" }}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Role</label>
                <select
                  value={iRole}
                  onChange={e => setIRole(e.target.value as "contributor" | "viewer")}
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  style={{ fontSize: "16px" }}
                >
                  <option value="contributor">Contributor — can add memories & comment</option>
                  <option value="viewer">Viewer — read-only access</option>
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="flex-1 border border-input rounded-lg py-2 text-sm font-medium active:opacity-70"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={iSaving}
                  className="flex-1 bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {iSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Invite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Interviews sub-component ──────────────────────────────────────────────────

function InterviewsTab({ familyId, canWrite }: { familyId: number; canWrite: boolean }) {
  const [interviews, setInterviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    loadInterviews();
  }, []);

  async function loadInterviews() {
    setLoading(true);
    try {
      const res = await fetch(`/api/family/${familyId}/interviews`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setInterviews(data.interviews ?? []);
    } catch {
      toast.error("Couldn't load interviews");
    } finally {
      setLoading(false);
    }
  }

  async function startInterview() {
    setStarting(true);
    try {
      const res = await fetch(`/api/family/${familyId}/interviews`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ prompts_used: [] }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success("Interview session started!");
      loadInterviews();
    } catch (err: any) {
      toast.error(err.message ?? "Couldn't start interview");
    } finally {
      setStarting(false);
    }
  }

  const statusColor: Record<string, string> = {
    scheduled:    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    recording:    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    transcribing: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    review:       "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    published:    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-3">
      {canWrite && (
        <button
          onClick={startInterview}
          disabled={starting}
          className="w-full flex items-center justify-center gap-2 bg-primary/10 text-primary rounded-xl py-3 text-sm font-medium active:opacity-70 border border-primary/20"
        >
          {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
          Start an Oral History Interview
        </button>
      )}

      {interviews.length === 0 && (
        <div className="text-center py-12">
          <Mic className="w-10 h-10 text-primary/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No interviews yet. Capture an elder's voice before it's too late.</p>
        </div>
      )}

      {interviews.map((iv: any) => (
        <div key={iv.id} className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Interview #{iv.id}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date(iv.created_at).toLocaleDateString()}
              </p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${statusColor[iv.status] ?? "bg-muted text-muted-foreground"}`}>
              {iv.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
