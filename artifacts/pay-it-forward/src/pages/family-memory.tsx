/**
 * Family Memory Detail
 * Route: /family/:id/memory/:memoryId
 */

import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft, Image, Mic, FileText, Calendar, MapPin, Tag,
  MessageCircle, Loader2, Send, Trash2, Edit3, Lock, Globe, Users,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "sonner";

interface Memory {
  id: number;
  family_id: number;
  author_id: number | null;
  title: string | null;
  description: string | null;
  story: string | null;
  memory_date: string | null;
  memory_date_precision: string;
  location_label: string | null;
  source: string;
  visibility: string;
  created_at: string;
  updated_at: string;
}

interface Asset {
  id: number;
  asset_type: string;
  storage_key: string;
  thumbnail_key: string | null;
  mime_type: string;
  transcript: string | null;
  processing_status: string;
}

interface Tag { id: number; tag: string; }
interface Person { id: number; name_text: string | null; member_id: number | null; }
interface Comment {
  id: number;
  author_id: number | null;
  body: string;
  created_at: string;
}

function formatDate(date: string | null, precision: string) {
  if (!date) return null;
  const d = new Date(date);
  if (precision === "year") return d.getFullYear().toString();
  if (precision === "month") return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
  if (precision === "circa") return `c. ${d.getFullYear()}`;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function visibilityIcon(v: string) {
  if (v === "private") return <Lock className="w-3.5 h-3.5" />;
  if (v === "family")  return <Users className="w-3.5 h-3.5" />;
  return <Globe className="w-3.5 h-3.5" />;
}

export default function FamilyMemoryPage() {
  const { currentUser } = useAppContext();
  const { id, memoryId } = useParams<{ id: string; memoryId: string }>();
  const [, navigate] = useLocation();
  const familyId = Number(id);
  const memId    = Number(memoryId);

  const [memory,   setMemory]   = useState<Memory | null>(null);
  const [assets,   setAssets]   = useState<Asset[]>([]);
  const [tags,     setTags]     = useState<Tag[]>([]);
  const [people,   setPeople]   = useState<Person[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc,  setEditDesc]  = useState("");
  const [editStory, setEditStory] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!currentUser || !familyId || !memId) return;
    loadMemory();
  }, [currentUser, familyId, memId]);

  async function loadMemory() {
    setLoading(true);
    try {
      const res = await fetch(`/api/family/${familyId}/memories/${memId}`, { headers: authHeaders() });
      if (res.status === 404) { toast.error("Memory not found"); navigate(`/family/${familyId}`); return; }
      if (res.status === 403) { toast.error("Access denied"); navigate(`/family/${familyId}`); return; }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMemory(data.memory);
      setAssets(data.assets ?? []);
      setTags(data.tags ?? []);
      setPeople(data.people ?? []);
      setComments(data.comments ?? []);
      setEditTitle(data.memory.title ?? "");
      setEditDesc(data.memory.description ?? "");
      setEditStory(data.memory.story ?? "");
    } catch {
      toast.error("Couldn't load memory");
      navigate(`/family/${familyId}`);
    } finally {
      setLoading(false);
    }
  }

  async function handlePostComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentText.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/family/${familyId}/memories/${memId}/comments`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentText.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const { comment } = await res.json();
      setComments(cs => [...cs, comment]);
      setCommentText("");
    } catch (err: any) {
      toast.error(err.message ?? "Couldn't post comment");
    } finally {
      setPosting(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/family/${familyId}/memories/${memId}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          title:       editTitle.trim() || null,
          description: editDesc.trim()  || null,
          story:       editStory.trim() || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const { memory: updated } = await res.json();
      setMemory(updated);
      setEditing(false);
      toast.success("Memory updated");
    } catch (err: any) {
      toast.error(err.message ?? "Couldn't save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this memory permanently? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/family/${familyId}/memories/${memId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success("Memory deleted");
      navigate(`/family/${familyId}`);
    } catch (err: any) {
      toast.error(err.message ?? "Couldn't delete memory");
    }
  }

  const isAuthor = memory?.author_id === currentUser?.id;

  if (!currentUser) {
    return <div className="flex items-center justify-center h-screen"><p className="text-muted-foreground">Sign in to view memories</p></div>;
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading memory…</p>
      </div>
    );
  }

  if (!memory) return null;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button onClick={() => navigate(`/family/${familyId}`)} className="p-2 -ml-2 rounded-lg active:bg-muted">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 font-bold truncate text-foreground">
            {memory.title ?? "Untitled Memory"}
          </h1>
          <div className="flex items-center gap-1">
            {isAuthor && (
              <button
                onClick={() => setEditing(!editing)}
                className="p-2 rounded-lg active:bg-muted text-muted-foreground"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}
            {isAuthor && (
              <button
                onClick={handleDelete}
                className="p-2 rounded-lg active:bg-muted text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* Edit form */}
        {editing && (
          <div className="bg-card border border-primary/30 rounded-2xl p-4">
            <h3 className="font-semibold mb-3 text-sm">Edit Memory</h3>
            <form onSubmit={handleSaveEdit} className="space-y-3">
              <input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder="Title"
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                style={{ fontSize: "16px" }}
              />
              <textarea
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                placeholder="Description"
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                style={{ fontSize: "16px" }}
                rows={3}
              />
              <textarea
                value={editStory}
                onChange={e => setEditStory(e.target.value)}
                placeholder="Full story or transcript…"
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                style={{ fontSize: "16px" }}
                rows={6}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="flex-1 border border-input rounded-lg py-2 text-sm active:opacity-70"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Save
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Meta card */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
          {memory.description && (
            <p className="text-sm text-foreground">{memory.description}</p>
          )}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {memory.memory_date && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {formatDate(memory.memory_date, memory.memory_date_precision)}
              </span>
            )}
            {memory.location_label && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {memory.location_label}
              </span>
            )}
            <span className="flex items-center gap-1">
              {visibilityIcon(memory.visibility)}
              {memory.visibility}
            </span>
            <span className="flex items-center gap-1 capitalize">
              {memory.source === "interview" ? <Mic className="w-3.5 h-3.5" /> : <Image className="w-3.5 h-3.5" />}
              {memory.source}
            </span>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {tags.map(t => (
                <span
                  key={t.id}
                  className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full"
                >
                  <Tag className="w-3 h-3" />
                  {t.tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* People */}
        {people.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">People in this memory</p>
            <div className="flex flex-wrap gap-2">
              {people.map(p => (
                <span key={p.id} className="flex items-center gap-1.5 text-sm bg-muted px-3 py-1 rounded-full">
                  <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                    {(p.name_text ?? "?").charAt(0).toUpperCase()}
                  </span>
                  {p.name_text ?? "Unknown"}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Assets */}
        {assets.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Attachments</p>
            <div className="grid grid-cols-2 gap-2">
              {assets.map(a => (
                <div key={a.id} className="rounded-xl bg-muted aspect-square flex flex-col items-center justify-center gap-1 text-muted-foreground overflow-hidden">
                  {a.asset_type === "photo" ? (
                    a.thumbnail_key ? (
                      <img src={a.thumbnail_key} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Image className="w-8 h-8" />
                    )
                  ) : a.asset_type === "audio" ? (
                    <>
                      <Mic className="w-8 h-8" />
                      <span className="text-xs">{a.processing_status}</span>
                    </>
                  ) : a.asset_type === "video" ? (
                    <>
                      <FileText className="w-8 h-8" />
                      <span className="text-xs">{a.mime_type}</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-8 h-8" />
                      <span className="text-xs">{a.mime_type}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
            {/* Transcripts */}
            {assets.filter(a => a.transcript).map(a => (
              <div key={a.id} className="mt-3 p-3 rounded-xl bg-muted/50 border border-border">
                <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                  <Mic className="w-3 h-3" /> Transcript
                </p>
                <p className="text-sm text-foreground leading-relaxed">{a.transcript}</p>
              </div>
            ))}
          </div>
        )}

        {/* Story */}
        {memory.story && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Story</p>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{memory.story}</p>
          </div>
        )}

        {/* Comments */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5" />
            Comments ({comments.length})
          </p>

          <div className="space-y-3 mb-3">
            {comments.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">Be the first to comment on this memory.</p>
            )}
            {comments.map(c => (
              <div key={c.id} className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex-shrink-0 flex items-center justify-center">
                  <span className="text-xs font-bold text-primary">#</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-0.5">
                    {new Date(c.created_at).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-foreground">{c.body}</p>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handlePostComment} className="flex gap-2">
            <input
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="Add a comment…"
              className="flex-1 border border-input rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              style={{ fontSize: "16px" }}
              maxLength={5000}
            />
            <button
              type="submit"
              disabled={posting || !commentText.trim()}
              className="bg-primary text-primary-foreground px-3 py-2 rounded-xl disabled:opacity-50"
            >
              {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
