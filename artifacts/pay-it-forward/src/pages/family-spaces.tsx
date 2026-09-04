/**
 * Family Spaces — Diaspora Platform
 * Lists all Family Spaces the current user belongs to and allows creating new ones.
 * Includes My Spaces / Invitations tabs with real invitation status and member counts.
 *
 * Route: /diaspora/family (also accessible at legacy /family)
 */

import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  Users, Plus, ChevronRight, BookHeart, Lock, Globe, Loader2,
  Mail, Crown, UserCheck, Check, X, Clock, UserPlus,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "sonner";
import { parseOralHistoryIntent, persistPreserveScanContext, readPreserveScanIdFromSearch } from "@/lib/diaspora/oralHistoryDeepLink";

interface FamilySpace {
  id: number;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  created_at: string;
  my_role: "owner" | "curator" | "contributor" | "viewer";
  member_count: number;   // active members (from API)
  memory_count?: number;
  status: "active" | "invited"; // real membership status from API
}

type SpaceTab = "mine" | "invitations";

const ROLE_BADGE: Record<string, { icon: typeof Crown; label: string; color: string }> = {
  owner:       { icon: Crown,      label: "Owner",       color: "text-amber-500" },
  curator:     { icon: UserCheck,  label: "Curator",     color: "text-blue-500" },
  contributor: { icon: Users,      label: "Contributor", color: "text-emerald-500" },
  viewer:      { icon: Users,      label: "Viewer",      color: "text-muted-foreground" },
};

export default function FamilySpacesPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [families, setFamilies] = useState<FamilySpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [spaceTab, setSpaceTab] = useState<SpaceTab>("mine");
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const oralHistoryRedirected = useRef(false);
  const oralHistoryIntent = typeof window !== "undefined" && parseOralHistoryIntent(window.location.search);
  const preserveScanId = typeof window !== "undefined" ? readPreserveScanIdFromSearch(window.location.search) : null;

  useEffect(() => {
    if (!currentUser) return;
    loadFamilies();
  }, [currentUser]);

  async function loadFamilies() {
    setLoading(true);
    try {
      const res = await fetch("/api/family/mine", { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load families");
      const data = await res.json();
      setFamilies(data.families ?? []);
    } catch {
      toast.error("Couldn't load your Family Spaces");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/family", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName.trim(), description: formDesc.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to create");
      }
      const { family } = await res.json();
      toast.success(`"${family.name}" created!`);
      setShowCreate(false);
      setFormName("");
      setFormDesc("");
      navigate(`/family/${family.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Couldn't create Family Space";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  // Accept or decline an invitation
  async function handleInvitationAction(familyId: number, action: "accept" | "decline") {
    setActionLoading(familyId);
    try {
      // Find the member record for this family
      const memRes = await fetch(`/api/family/${familyId}/members`, { headers: authHeaders() });
      if (!memRes.ok) throw new Error("Failed to load members");
      const memData = await memRes.json();
      const myMember = (memData.members as Array<{ id: number; user_id: number | null; status: string }>)
        .find(m => m.status === "invited" && (m.user_id === currentUser?.id || m.user_id === null));
      if (!myMember) throw new Error("Invitation not found");

      if (action === "accept") {
        const res = await fetch(`/api/family/${familyId}/members/${myMember.id}`, {
          method: "PATCH",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ status: "active" }),
        });
        if (!res.ok) throw new Error("Failed to accept invitation");
        toast.success("Invitation accepted!");
      } else {
        const res = await fetch(`/api/family/${familyId}/members/${myMember.id}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
        if (!res.ok) throw new Error("Failed to decline invitation");
        toast.success("Invitation declined");
      }
      loadFamilies();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Action failed";
      toast.error(msg);
    } finally {
      setActionLoading(null);
    }
  }

  // Split by real membership status returned from API
  const mySpaces    = families.filter(f => f.status === "active");
  const invitations = families.filter(f => f.status === "invited");

  // Auto-switch to invitations tab if user has pending invites and no active spaces
  useEffect(() => {
    if (!loading && mySpaces.length === 0 && invitations.length > 0) {
      setSpaceTab("invitations");
    }
  }, [loading, mySpaces.length, invitations.length]);

  useEffect(() => {
    if (!loading && oralHistoryIntent && mySpaces.length > 0 && !oralHistoryRedirected.current) {
      oralHistoryRedirected.current = true;
      const scanId = preserveScanId ? persistPreserveScanContext(preserveScanId) : null;
      navigate(`/family/${mySpaces[0].id}?tab=record${scanId ? `&preserve_scan_id=${encodeURIComponent(scanId)}` : ""}`);
    }
  }, [loading, mySpaces, oralHistoryIntent, navigate, preserveScanId]);

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen bg-background">
        <p className="text-muted-foreground">Sign in to access your Family Spaces</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-4">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <BookHeart className="w-5 h-5 text-primary" />
              Family Spaces
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Diaspora · Legacy · Community
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm font-medium active:opacity-80 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            New Space
          </button>
        </div>

        {/* My Spaces / Invitations Tabs */}
        <div className="max-w-lg mx-auto flex mt-3 border-b border-border -mb-4">
          <button
            onClick={() => setSpaceTab("mine")}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
              spaceTab === "mine" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"
            }`}
          >
            <BookHeart className="w-3.5 h-3.5" />
            My Spaces
            {mySpaces.length > 0 && (
              <span className="ml-1 bg-primary/15 text-primary text-xs px-1.5 py-0.5 rounded-full">{mySpaces.length}</span>
            )}
          </button>
          <button
            onClick={() => setSpaceTab("invitations")}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
              spaceTab === "invitations" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            Invitations
            {invitations.length > 0 && (
              <span className="ml-1 bg-amber-500/20 text-amber-500 text-xs px-1.5 py-0.5 rounded-full font-semibold">{invitations.length}</span>
            )}
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        {/* Create modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
            <div className="bg-card rounded-2xl p-6 w-full max-w-md shadow-xl">
              <h2 className="text-lg font-bold mb-1">Create a Family Space</h2>
              <p className="text-sm text-muted-foreground mb-4">
                A private space for your family's stories, photos, and memories.
              </p>
              <form onSubmit={handleCreate} className="space-y-3">
                <div>
                  <label className="text-sm font-medium block mb-1">Family name *</label>
                  <input
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder='e.g. "The Johnson Family"'
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    style={{ fontSize: "16px" }}
                    maxLength={120}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Description (optional)</label>
                  <textarea
                    value={formDesc}
                    onChange={e => setFormDesc(e.target.value)}
                    placeholder="A few words about this family space…"
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    style={{ fontSize: "16px" }}
                    rows={3}
                    maxLength={1000}
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="flex-1 border border-input rounded-lg py-2 text-sm font-medium active:opacity-70"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating || !formName.trim()}
                    className="flex-1 bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Create
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading your Family Spaces…</p>
          </div>
        )}

        {/* Invitations tab */}
        {!loading && spaceTab === "invitations" && (
          <div className="space-y-3">
            {invitations.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <Mail className="w-12 h-12 text-muted-foreground/30 mx-auto" />
                <p className="font-semibold text-muted-foreground">No pending invitations</p>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  When family members invite you to their Family Space, you'll see it here.
                </p>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">
                  Pending Invitations ({invitations.length})
                </p>
                {invitations.map(f => (
                  <div
                    key={f.id}
                    className="bg-card border border-amber-500/30 rounded-2xl p-4 space-y-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                        <Mail className="w-7 h-7 text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate">{f.name}</p>
                        {f.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{f.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="inline-flex items-center gap-1 text-xs text-amber-500 font-medium">
                            <Clock className="w-3 h-3" />
                            Pending invitation
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="w-3 h-3" />
                            {f.member_count} active {f.member_count === 1 ? "member" : "members"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleInvitationAction(f.id, "accept")}
                        disabled={actionLoading === f.id}
                        className="flex-1 bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm font-medium active:opacity-80 disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {actionLoading === f.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                        Accept
                      </button>
                      <button
                        onClick={() => handleInvitationAction(f.id, "decline")}
                        disabled={actionLoading === f.id}
                        className="flex-1 border border-input text-muted-foreground px-3 py-2 rounded-lg text-sm font-medium active:opacity-70 disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        <X className="w-4 h-4" />
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Empty state (My Spaces tab) */}
        {!loading && spaceTab === "mine" && mySpaces.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-4 px-4">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <BookHeart className="w-10 h-10 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold mb-1">Start your Family Vault</h2>
              <p className="text-sm text-muted-foreground max-w-xs">
                Preserve photos, stories, and memories for generations. Private by default — your family's history stays in your family.
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-medium flex items-center gap-2 active:opacity-80"
            >
              <Plus className="w-4 h-4" />
              Create your first Family Space
            </button>

            {/* Feature highlights */}
            <div className="mt-6 grid grid-cols-3 gap-3 w-full">
              {[
                { icon: <Lock className="w-5 h-5" />, label: "Private by default" },
                { icon: <Globe className="w-5 h-5" />, label: "Share oral histories" },
                { icon: <Users className="w-5 h-5" />, label: "Invite family members" },
              ].map(ftr => (
                <div key={ftr.label} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-muted/50 text-center">
                  <div className="text-primary">{ftr.icon}</div>
                  <span className="text-xs text-muted-foreground leading-tight">{ftr.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Family list (My Spaces tab) */}
        {!loading && spaceTab === "mine" && mySpaces.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">
              Your Family Spaces ({mySpaces.length})
            </p>
            {mySpaces.map(f => {
              const badge = ROLE_BADGE[f.my_role] ?? ROLE_BADGE.viewer;
              const RoleIcon = badge.icon;
              return (
                <button
                  key={f.id}
                  onClick={() => navigate(`/family/${f.id}`)}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl bg-card border border-border active:opacity-80 transition-opacity text-left"
                >
                  {/* Cover / Avatar */}
                  <div
                    className="w-14 h-14 rounded-xl flex-shrink-0 overflow-hidden bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center"
                  >
                    {f.cover_image_url ? (
                      <img src={f.cover_image_url} alt={f.name} className="w-full h-full object-cover" />
                    ) : (
                      <BookHeart className="w-7 h-7 text-primary" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{f.name}</p>
                    {f.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{f.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${badge.color}`}>
                        <RoleIcon className="w-3 h-3" />
                        {badge.label}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="w-3 h-3" />
                        {f.member_count} {f.member_count === 1 ? "member" : "members"}
                      </span>
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </button>
              );
            })}

            {/* Invite hint */}
            <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/15 text-xs text-muted-foreground">
              <UserPlus className="w-4 h-4 text-primary flex-shrink-0" />
              <span>Tap a space to invite family members and preserve memories together.</span>
            </div>
          </div>
        )}

        {/* Diaspora mission strip */}
        <div className="mt-8 p-4 rounded-2xl bg-gradient-to-br from-primary/5 to-primary/15 border border-primary/20">
          <p className="text-sm font-semibold text-foreground mb-1">Diaspora · Legacy · Community</p>
          <p className="text-xs text-muted-foreground">
            Family Spaces are the heart of Niakofa's Diaspora Platform — preserve who you are,
            where you came from, and what you pass on.
          </p>
        </div>
      </div>
    </div>
  );
}
