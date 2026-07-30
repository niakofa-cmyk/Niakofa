/**
 * Family Tree — Interactive visual tree for a Family Space
 * Route: /diaspora/tree  (pick a family) or /diaspora/tree/:familyId
 *
 * Phase C enhancements:
 *  - Renders relationship edges (parent/child, spouse) as SVG connectors
 *  - Add Relation modal — link two people as parent→child or spouse
 *  - Remove relation directly from the tree
 *  - Relationship explorer — see how two people are connected
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft, TreePine, Users, Calendar, Plus, Search,
  Loader2, ChevronRight, User, Link2, AlertCircle,
  GitBranch, X, CheckCircle2, BookHeart,
  Heart, UserPlus, Trash2, Network,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "sonner";

interface TreeNode {
  id: number;
  name: string;
  role: string;
  relation: string | null;
  birth_year: string | null;
  is_linked_user: boolean;
  status?: string;
}

interface TreeEdge {
  id: number;
  from: number;
  to: number;
  type: "parent" | "spouse";
}

interface FamilySpace {
  id: number;
  name: string;
  my_role: string;
}

function TreePersonNode({
  person,
  isSelected,
  onClick,
}: {
  person: TreeNode;
  isSelected?: boolean;
  onClick: () => void;
}) {
  const initials = person.name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
  const isLiving = !person.birth_year || parseInt(person.birth_year) > 1940;
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all active:opacity-70 ${
        isSelected ? "bg-primary/20 ring-2 ring-primary" : "bg-card border border-border"
      }`}
      style={{ minWidth: 80, maxWidth: 100 }}
    >
      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold ${
        isLiving ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
      }`}>
        {initials || <User className="w-5 h-5" />}
      </div>
      <p className="text-xs font-medium text-center leading-tight line-clamp-2">{person.name}</p>
      {person.birth_year && (
        <p className="text-xs text-muted-foreground">{person.birth_year}–{isLiving ? "Living" : ""}</p>
      )}
      {person.relation && (
        <p className="text-xs text-primary/70 text-center leading-tight line-clamp-1">{person.relation}</p>
      )}
    </button>
  );
}

export default function FamilyTreePage() {
  const { currentUser } = useAppContext();
  const { familyId: fid } = useParams<{ familyId?: string }>();
  const [, navigate] = useLocation();
  const familyId = fid ? Number(fid) : null;

  const [families, setFamilies] = useState<FamilySpace[]>([]);
  const [selectedFamilyId, setSelectedFamilyId] = useState<number | null>(familyId);
  const [familyName, setFamilyName] = useState("");
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [edges, setEdges] = useState<TreeEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<TreeNode | null>(null);
  const [tab, setTab] = useState<"tree" | "people" | "timeline">("tree");
  const [showRelationModal, setShowRelationModal] = useState(false);
  const [showExplorer, setShowExplorer] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    loadFamilies();
  }, [currentUser]);

  useEffect(() => {
    if (selectedFamilyId) loadTree(selectedFamilyId);
  }, [selectedFamilyId]);

  const loadFamilies = useCallback(async () => {
    try {
      const res = await fetch("/api/family/mine", { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const spaces = data.families ?? [];
      setFamilies(spaces);
      if (!selectedFamilyId && spaces.length === 1) {
        setSelectedFamilyId(spaces[0].id);
      }
    } catch {
      toast.error("Couldn't load family spaces");
    }
  }, []);

  const loadTree = useCallback(async (id: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/family/${id}/tree`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setNodes(data.nodes ?? []);
      setEdges(data.edges ?? []);
      const fam = families.find(f => f.id === id);
      if (fam) setFamilyName(fam.name);
    } catch {
      toast.error("Couldn't load family tree");
    } finally {
      setLoading(false);
    }
  }, [families]);

  async function createRelation(fromId: number, toId: number, relationType: "parent" | "spouse") {
    if (!selectedFamilyId) return;
    try {
      const res = await fetch(`/api/family/${selectedFamilyId}/tree/relations`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ from_member_id: fromId, to_member_id: toId, relation_type: relationType }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed");
      }
      toast.success(relationType === "parent" ? "Parent-child link added" : "Spouse link added");
      setShowRelationModal(false);
      loadTree(selectedFamilyId);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add relation");
    }
  }

  async function deleteRelation(relationId: number) {
    if (!selectedFamilyId) return;
    try {
      const res = await fetch(`/api/family/${selectedFamilyId}/tree/relations/${relationId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error();
      toast.success("Relation removed");
      loadTree(selectedFamilyId);
    } catch {
      toast.error("Failed to remove relation");
    }
  }

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Sign in to view your family tree</p>
      </div>
    );
  }

  const filtered = nodes.filter(n =>
    !searchQ || n.name.toLowerCase().includes(searchQ.toLowerCase())
  );

  // Group by generation (by birth year buckets as best-effort)
  const generations: TreeNode[][] = (() => {
    if (!nodes.length) return [];
    const sorted = [...nodes].sort((a, b) => {
      const ay = a.birth_year ? parseInt(a.birth_year) : 9999;
      const by = b.birth_year ? parseInt(b.birth_year) : 9999;
      return ay - by;
    });
    const gens: TreeNode[][] = [];
    let currentGen: TreeNode[] = [];
    let lastYear = 0;
    for (const n of sorted) {
      const yr = n.birth_year ? parseInt(n.birth_year) : 0;
      if (yr && lastYear && Math.abs(yr - lastYear) > 30) {
        gens.push(currentGen);
        currentGen = [n];
      } else {
        currentGen.push(n);
      }
      if (yr) lastYear = yr;
    }
    if (currentGen.length) gens.push(currentGen);
    return gens.length ? gens : [sorted];
  })();

  // Get relations for a person
  const getRelationsForPerson = (personId: number) => {
    const parents = edges.filter(e => e.type === "parent" && e.to === personId)
      .map(e => ({ ...e, person: nodes.find(n => n.id === e.from) }));
    const children = edges.filter(e => e.type === "parent" && e.from === personId)
      .map(e => ({ ...e, person: nodes.find(n => n.id === e.to) }));
    const spouses = edges.filter(e => e.type === "spouse" && (e.from === personId || e.to === personId))
      .map(e => ({ ...e, person: nodes.find(n => n.id === (e.from === personId ? e.to : e.from)) }));
    return { parents, children, spouses };
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/diaspora")} className="p-2 -ml-2 rounded-lg active:bg-muted">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold flex items-center gap-2">
              <TreePine className="w-4 h-4 text-emerald-500" />
              Family Tree
            </h1>
            {familyName && <p className="text-xs text-muted-foreground">{familyName} · {nodes.length} people · {edges.length} links</p>}
          </div>
          <button
            onClick={() => setShowExplorer(true)}
            className="p-2 rounded-lg active:bg-muted"
            title="Relationship Explorer"
          >
            <Network className="w-4.5 h-4.5 text-emerald-500" />
          </button>
          <button
            onClick={() => navigate("/diaspora/family")}
            className="p-2 rounded-lg active:bg-muted"
            title="Manage Family Vault"
          >
            <BookHeart className="w-4.5 h-4.5 text-primary" />
          </button>
        </div>

        {/* Tabs */}
        <div className="max-w-lg mx-auto flex border-b border-border">
          {(["tree", "people", "timeline"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium capitalize transition-colors ${
                tab === t ? "text-primary border-b-2 border-primary" : "text-muted-foreground"
              }`}
            >
              {t === "tree" ? "Tree" : t === "people" ? "People" : "Timeline"}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        {/* Family Picker (if multiple families) */}
        {families.length > 1 && !selectedFamilyId && (
          <div className="mb-4 space-y-2">
            <p className="text-sm font-medium text-foreground mb-2">Choose a family space:</p>
            {families.map(f => (
              <button
                key={f.id}
                onClick={() => setSelectedFamilyId(f.id)}
                className="w-full flex items-center gap-3 p-3 bg-card border border-border rounded-xl active:opacity-70 text-left"
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BookHeart className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">{f.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{f.my_role}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}

        {families.length === 0 && !loading && (
          <div className="text-center py-16 space-y-3">
            <TreePine className="w-12 h-12 text-emerald-500/40 mx-auto" />
            <p className="font-semibold">No Family Spaces yet</p>
            <p className="text-sm text-muted-foreground">
              Create a Family Space first, then add members to build your tree.
            </p>
            <button
              onClick={() => navigate("/diaspora/family")}
              className="bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-medium"
            >
              Create Family Space
            </button>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        )}

        {selectedFamilyId && !loading && (
          <>
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Search family members…"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                style={{ fontSize: "16px" }}
              />
            </div>

            {/* ── Tree view ───────────────────────────────────────────────── */}
            {tab === "tree" && (
              <div className="space-y-6">
                {nodes.length === 0 ? (
                  <div className="text-center py-16 space-y-3">
                    <TreePine className="w-12 h-12 text-emerald-500/40 mx-auto" />
                    <p className="font-semibold">Tree is empty</p>
                    <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                      Add family members manually or import a GEDCOM file from Ancestry, MyHeritage, or FamilySearch.
                    </p>
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => navigate(`/family/${selectedFamilyId}`)}
                        className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium"
                      >
                        <span className="flex items-center gap-1.5">
                          <TreePine className="w-3.5 h-3.5" /> Import GEDCOM
                        </span>
                      </button>
                      <button
                        onClick={() => navigate(`/family/${selectedFamilyId}`)}
                        className="border border-primary text-primary px-4 py-2 rounded-xl text-sm font-medium"
                      >
                        <span className="flex items-center gap-1.5">
                          <Plus className="w-3.5 h-3.5" /> Add Person
                        </span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Draggable canvas with real SVG connectors */}
                    <DraggableTreeCanvas
                      nodes={nodes}
                      edges={edges}
                      generations={generations}
                      selectedPerson={selectedPerson}
                      onSelect={setSelectedPerson}
                    />

                    {/* Selected person detail with relations */}
                    {selectedPerson && (
                      <div className="bg-card border border-primary/30 rounded-2xl p-4 mt-4">
                        <div className="flex items-start gap-3">
                          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                            {selectedPerson.name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <p className="font-bold">{selectedPerson.name}</p>
                            {selectedPerson.birth_year && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Calendar className="w-3 h-3" /> Born {selectedPerson.birth_year}
                              </p>
                            )}
                            {selectedPerson.relation && (
                              <p className="text-xs text-primary mt-0.5">{selectedPerson.relation}</p>
                            )}
                            {selectedPerson.is_linked_user && (
                              <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 mt-0.5">
                                <Link2 className="w-3 h-3" /> Active Niakofa member
                              </p>
                            )}
                          </div>
                          <button onClick={() => setSelectedPerson(null)} className="p-1">
                            <X className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </div>

                        {/* Relations section */}
                        {(() => {
                          const { parents, children, spouses } = getRelationsForPerson(selectedPerson.id);
                          const hasRelations = parents.length || children.length || spouses.length;
                          if (!hasRelations) return null;
                          return (
                            <div className="mt-4 space-y-3">
                              {spouses.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                                    <Heart className="w-3 h-3" /> Spouse
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {spouses.map(s => s.person && (
                                      <button
                                        key={s.id}
                                        onClick={() => setSelectedPerson(s.person!)}
                                        className="flex items-center gap-1.5 bg-pink-500/10 border border-pink-500/20 rounded-lg px-2.5 py-1.5 text-sm active:opacity-70"
                                      >
                                        {s.person.name}
                                        <Trash2
                                          className="w-3 h-3 text-muted-foreground"
                                          onClick={(e) => { e.stopPropagation(); deleteRelation(s.id); }}
                                        />
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {parents.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Parents</p>
                                  <div className="flex flex-wrap gap-2">
                                    {parents.map(p => p.person && (
                                      <button
                                        key={p.id}
                                        onClick={() => setSelectedPerson(p.person!)}
                                        className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg px-2.5 py-1.5 text-sm active:opacity-70"
                                      >
                                        {p.person.name}
                                        <Trash2
                                          className="w-3 h-3 text-muted-foreground"
                                          onClick={(e) => { e.stopPropagation(); deleteRelation(p.id); }}
                                        />
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {children.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Children</p>
                                  <div className="flex flex-wrap gap-2">
                                    {children.map(c => c.person && (
                                      <button
                                        key={c.id}
                                        onClick={() => setSelectedPerson(c.person!)}
                                        className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1.5 text-sm active:opacity-70"
                                      >
                                        {c.person.name}
                                        <Trash2
                                          className="w-3 h-3 text-muted-foreground"
                                          onClick={(e) => { e.stopPropagation(); deleteRelation(c.id); }}
                                        />
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Add relation button */}
                        <button
                          onClick={() => setShowRelationModal(true)}
                          className="mt-3 w-full flex items-center justify-center gap-2 border border-dashed border-primary/50 text-primary rounded-xl py-2 text-sm font-medium active:opacity-70"
                        >
                          <UserPlus className="w-4 h-4" /> Link a relation
                        </button>
                        <button
                          onClick={() => navigate(`/family/${selectedFamilyId}`)}
                          className="mt-2 w-full border border-border rounded-xl py-2 text-sm font-medium text-primary active:opacity-70"
                        >
                          View Family Vault
                        </button>
                      </div>
                    )}

                    {/* Stats */}
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 mt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <GitBranch className="w-4 h-4 text-emerald-500" />
                        <p className="text-sm font-semibold">Tree Statistics</p>
                      </div>
                      <div className="grid grid-cols-4 gap-3 text-center">
                        <div>
                          <p className="text-xl font-bold text-emerald-500">{nodes.length}</p>
                          <p className="text-xs text-muted-foreground">People</p>
                        </div>
                        <div>
                          <p className="text-xl font-bold text-emerald-500">{generations.length}</p>
                          <p className="text-xs text-muted-foreground">Generations</p>
                        </div>
                        <div>
                          <p className="text-xl font-bold text-emerald-500">{edges.length}</p>
                          <p className="text-xs text-muted-foreground">Links</p>
                        </div>
                        <div>
                          <p className="text-xl font-bold text-emerald-500">
                            {nodes.filter(n => n.is_linked_user).length}
                          </p>
                          <p className="text-xs text-muted-foreground">Active</p>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowRelationModal(true)}
                        className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-medium active:opacity-80"
                      >
                        <UserPlus className="w-4 h-4" /> Add Relation
                      </button>
                      <button
                        onClick={() => navigate(`/family/${selectedFamilyId}`)}
                        className="flex-1 flex items-center justify-center gap-2 border border-primary text-primary rounded-xl py-2.5 text-sm font-medium active:opacity-70"
                      >
                        <Plus className="w-4 h-4" /> Add Person
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── People view ──────────────────────────────────────────────── */}
            {tab === "people" && (
              <div className="space-y-2">
                {filtered.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    {searchQ ? "No matches found" : "No people yet — add family members in the vault"}
                  </div>
                ) : (
                  filtered.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPerson(selectedPerson?.id === p.id ? null : p)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left active:opacity-70 ${
                        selectedPerson?.id === p.id ? "border-primary bg-primary/5" : "bg-card border-border"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                        {p.name.split(" ").map(x => x[0]).slice(0, 2).join("").toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{p.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {p.birth_year && <span className="text-xs text-muted-foreground">{p.birth_year}</span>}
                          {p.relation && <span className="text-xs text-primary/70">{p.relation}</span>}
                          {p.is_linked_user && (
                            <span className="text-xs text-green-500">Active</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </button>
                  ))
                )}
                <button
                  onClick={() => navigate(`/family/${selectedFamilyId}`)}
                  className="w-full flex items-center justify-center gap-2 border border-dashed border-primary text-primary rounded-xl py-3 text-sm font-medium mt-2 active:opacity-70"
                >
                  <Plus className="w-4 h-4" /> Add family member
                </button>
              </div>
            )}

            {/* ── Timeline view ─────────────────────────────────────────────── */}
            {tab === "timeline" && (
              <FamilyTimelineTab familyId={selectedFamilyId} />
            )}
          </>
        )}
      </div>

      {/* ─── Add Relation Modal ─────────────────────────────────────────────── */}
      {showRelationModal && selectedFamilyId && (
        <AddRelationModal
          familyId={selectedFamilyId}
          nodes={nodes}
          preselectedFrom={selectedPerson?.id ?? null}
          onClose={() => setShowRelationModal(false)}
          onCreate={createRelation}
        />
      )}

      {/* ─── Relationship Explorer Modal ────────────────────────────────────── */}
      {showExplorer && selectedFamilyId && (
        <RelationshipExplorer
          nodes={nodes}
          edges={edges}
          onClose={() => setShowExplorer(false)}
        />
      )}
    </div>
  );
}

// ─── Draggable Tree Canvas ─────────────────────────────────────────────────────

const NODE_W = 88;
const NODE_H = 84;

function DraggableTreeCanvas({
  nodes,
  edges,
  generations,
  selectedPerson,
  onSelect,
}: {
  nodes: TreeNode[];
  edges: TreeEdge[];
  generations: TreeNode[][];
  selectedPerson: TreeNode | null;
  onSelect: (p: TreeNode | null) => void;
}) {
  const GEN_V_GAP = 68;
  const H_GAP     = 14;
  const CANVAS_REF_W = 340;

  const computeInitial = useCallback((): Record<number, { x: number; y: number }> => {
    const pos: Record<number, { x: number; y: number }> = {};
    generations.forEach((gen, gi) => {
      const rowW   = gen.length * NODE_W + Math.max(0, gen.length - 1) * H_GAP;
      const startX = Math.max(8, (CANVAS_REF_W - rowW) / 2);
      gen.forEach((node, ni) => {
        pos[node.id] = {
          x: startX + ni * (NODE_W + H_GAP),
          y: gi * (NODE_H + GEN_V_GAP) + 8,
        };
      });
    });
    return pos;
  }, [generations]);

  const [positions, setPositions] = useState<Record<number, { x: number; y: number }>>(computeInitial);

  // Sync positions when the node list changes (additions/removals)
  useEffect(() => {
    setPositions(prev => {
      const initial = computeInitial();
      const next: Record<number, { x: number; y: number }> = {};
      for (const node of nodes) {
        next[node.id] = prev[node.id] ?? initial[node.id] ?? { x: 8, y: 8 };
      }
      return next;
    });
  }, [nodes, computeInitial]);

  const dragging = useRef<{
    nodeId: number;
    ptrId: number;
    startPx: number; startPy: number;
    origX: number; origY: number;
  } | null>(null);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>, nodeId: number) {
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation();
    const pos = positions[nodeId] ?? { x: 0, y: 0 };
    dragging.current = {
      nodeId, ptrId: e.pointerId,
      startPx: e.clientX, startPy: e.clientY,
      origX: pos.x, origY: pos.y,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current || dragging.current.ptrId !== e.pointerId) return;
    const { nodeId, startPx, startPy, origX, origY } = dragging.current;
    setPositions(prev => ({
      ...prev,
      [nodeId]: {
        x: Math.max(0, origX + (e.clientX - startPx)),
        y: Math.max(0, origY + (e.clientY - startPy)),
      },
    }));
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>, nodeId: number) {
    if (!dragging.current) return;
    const moved = Math.abs(e.clientX - dragging.current.startPx) + Math.abs(e.clientY - dragging.current.startPy);
    dragging.current = null;
    if (moved < 6) {
      const node = nodes.find(n => n.id === nodeId);
      if (node) onSelect(selectedPerson?.id === nodeId ? null : node);
    }
  }

  // Canvas bounds
  const allPos = Object.values(positions);
  const canvasW = Math.max(360, ...allPos.map(p => p.x + NODE_W + 16));
  const canvasH = Math.max(240, ...allPos.map(p => p.y + NODE_H + 24));

  // SVG bezier for parent→child; dashed line for spouse
  function edgePath(fromId: number, toId: number, type: "parent" | "spouse"): string | null {
    const from = positions[fromId];
    const to   = positions[toId];
    if (!from || !to) return null;
    const fx = from.x + NODE_W / 2;
    const tx = to.x   + NODE_W / 2;
    if (type === "spouse") {
      const fy = from.y + NODE_H / 2;
      const ty = to.y   + NODE_H / 2;
      return `M ${from.x + (from.x < to.x ? NODE_W : 0)} ${fy} L ${to.x + (from.x < to.x ? 0 : NODE_W)} ${ty}`;
    }
    // Parent → child: bezier from bottom-center to top-center
    const fy = from.y + NODE_H;
    const ty = to.y;
    const cy = (fy + ty) / 2;
    return `M ${fx} ${fy} C ${fx} ${cy}, ${tx} ${cy}, ${tx} ${ty}`;
  }

  // Generation guide line Y positions for visual generation connectors
  const genLineYs = generations.map((_, gi) => gi * (NODE_H + GEN_V_GAP) + 8);

  function resetLayout() {
    setPositions(computeInitial());
  }

  return (
    <div className="relative rounded-2xl border border-border bg-muted/10 overflow-auto" style={{ maxHeight: 420 }}>
      <div
        style={{ width: canvasW, height: canvasH, position: "relative" }}
        onPointerMove={onPointerMove}
        onPointerUp={() => { dragging.current = null; }}
        onPointerLeave={() => { dragging.current = null; }}
      >
        {/* SVG connector + generation guide layer */}
        <svg
          style={{
            position: "absolute", inset: 0,
            width: canvasW, height: canvasH,
            pointerEvents: "none", overflow: "visible",
          }}
        >
          {/* Generation guide lines — horizontal dashed separators between rows */}
          {genLineYs.map((y, gi) => (
            <g key={`gen-${gi}`}>
              <line
                x1={0} y1={y - GEN_V_GAP / 2 + 4}
                x2={canvasW} y2={y - GEN_V_GAP / 2 + 4}
                stroke="hsl(var(--border))"
                strokeWidth={1}
                strokeDasharray="4 6"
                opacity={0.35}
              />
              <text
                x={6}
                y={y + 12}
                fill="hsl(var(--muted-foreground))"
                fontSize={9}
                opacity={0.5}
                style={{ userSelect: "none" }}
              >
                Gen {gi + 1}
              </text>
            </g>
          ))}
          {edges.map(edge => {
            const d = edgePath(edge.from, edge.to, edge.type);
            if (!d) return null;
            return (
              <path
                key={edge.id}
                d={d}
                fill="none"
                stroke={edge.type === "spouse" ? "#f43f5e" : "hsl(var(--primary))"}
                strokeWidth={2}
                strokeOpacity={edge.type === "spouse" ? 0.55 : 0.5}
                strokeDasharray={edge.type === "spouse" ? "6 3" : undefined}
              />
            );
          })}
        </svg>

        {/* Node layer */}
        {nodes.map(node => {
          const pos = positions[node.id];
          if (!pos) return null;
          const initials  = node.name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
          const isSelected = selectedPerson?.id === node.id;
          return (
            <div
              key={node.id}
              style={{
                position: "absolute",
                left: pos.x, top: pos.y,
                width: NODE_W,
                touchAction: "none",
                userSelect: "none",
                zIndex: isSelected ? 10 : 1,
              }}
              onPointerDown={e => onPointerDown(e, node.id)}
              onPointerMove={onPointerMove}
              onPointerUp={e => onPointerUp(e, node.id)}
            >
              <div
                className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-center cursor-grab active:cursor-grabbing ${
                  isSelected
                    ? "bg-primary/15 border-primary shadow-lg ring-1 ring-primary/40"
                    : "bg-card border-border shadow-sm"
                }`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  node.is_linked_user ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                }`}>
                  {initials}
                </div>
                <p className="text-[11px] font-medium leading-tight line-clamp-2 w-full">{node.name}</p>
                {node.birth_year && (
                  <p className="text-[10px] text-muted-foreground leading-none">{node.birth_year}</p>
                )}
                {node.relation && (
                  <p className="text-[10px] text-primary/70 leading-tight line-clamp-1">{node.relation}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between px-3 py-1.5 bg-background/80 sticky bottom-0 border-t border-border">
        <p className="text-[10px] text-muted-foreground">
          Drag nodes to rearrange · Tap to select
        </p>
        <button
          onClick={resetLayout}
          className="text-[10px] text-primary font-medium active:opacity-70"
        >
          Reset Layout
        </button>
      </div>
    </div>
  );
}

// ─── Add Relation Modal ────────────────────────────────────────────────────────

function AddRelationModal({
  familyId,
  nodes,
  preselectedFrom,
  onClose,
  onCreate,
}: {
  familyId: number;
  nodes: TreeNode[];
  preselectedFrom: number | null;
  onClose: () => void;
  onCreate: (from: number, to: number, type: "parent" | "spouse") => void;
}) {
  const [fromId, setFromId] = useState<number | null>(preselectedFrom);
  const [toId, setToId] = useState<number | null>(null);
  const [relationType, setRelationType] = useState<"parent" | "spouse">("parent");

  const availableTargets = nodes.filter(n => n.id !== fromId);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-background w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-5 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" /> Add Relation
          </h2>
          <button onClick={onClose} className="p-1">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Relation type selector */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setRelationType("parent")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
              relationType === "parent"
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            Parent → Child
          </button>
          <button
            onClick={() => setRelationType("spouse")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
              relationType === "spouse"
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            Spouse
          </button>
        </div>

        {/* From person */}
        <div className="mb-3">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
            {relationType === "parent" ? "Parent" : "Person 1"}
          </label>
          <select
            value={fromId ?? ""}
            onChange={e => setFromId(Number(e.target.value))}
            className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Select…</option>
            {nodes.map(n => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
        </div>

        {/* To person */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
            {relationType === "parent" ? "Child" : "Person 2"}
          </label>
          <select
            value={toId ?? ""}
            onChange={e => setToId(Number(e.target.value))}
            className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Select…</option>
            {availableTargets.map(n => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
        </div>

        <button
          disabled={!fromId || !toId}
          onClick={() => fromId && toId && onCreate(fromId, toId, relationType)}
          className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-bold disabled:opacity-40 active:opacity-80"
        >
          Add {relationType === "parent" ? "Parent-Child" : "Spouse"} Link
        </button>
      </div>
    </div>
  );
}

// ─── Relationship Explorer ─────────────────────────────────────────────────────

function RelationshipExplorer({
  nodes,
  edges,
  onClose,
}: {
  nodes: TreeNode[];
  edges: TreeEdge[];
  onClose: () => void;
}) {
  const [personA, setPersonA] = useState<number | null>(null);
  const [personB, setPersonB] = useState<number | null>(null);

  // Find relationship path via BFS through edges
  function findPath(from: number, to: number): Array<{ node: TreeNode; relation: string }> | null {
    if (from === to) return [{ node: nodes.find(n => n.id === from)!, relation: "Same person" }];
    const visited = new Set<number>([from]);
    const queue: Array<{ id: number; path: Array<{ node: TreeNode; relation: string }> }> = [
      { id: from, path: [{ node: nodes.find(n => n.id === from)!, relation: "Start" }] },
    ];
    while (queue.length) {
      const { id, path } = queue.shift()!;
      const connected = edges.filter(e => e.from === id || e.to === id);
      for (const edge of connected) {
        const otherId = edge.from === id ? edge.to : edge.from;
        const otherNode = nodes.find(n => n.id === otherId);
        if (!otherNode || visited.has(otherId)) continue;
        const relLabel = edge.type === "spouse"
          ? "spouse of"
          : edge.from === id
            ? "parent of"
            : "child of";
        const newPath = [...path, { node: otherNode, relation: relLabel }];
        if (otherId === to) return newPath;
        visited.add(otherId);
        queue.push({ id: otherId, path: newPath });
      }
    }
    return null;
  }

  const path = personA && personB ? findPath(personA, personB) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-background w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-5 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <Network className="w-5 h-5 text-emerald-500" /> Relationship Explorer
          </h2>
          <button onClick={onClose} className="p-1">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Person A</label>
            <select
              value={personA ?? ""}
              onChange={e => setPersonA(Number(e.target.value))}
              className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select…</option>
              {nodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Person B</label>
            <select
              value={personB ?? ""}
              onChange={e => setPersonB(Number(e.target.value))}
              className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select…</option>
              {nodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          </div>
        </div>

        {personA && personB && (
          <div className="bg-card border border-border rounded-2xl p-4">
            {path ? (
              <>
                <p className="text-sm font-semibold mb-3">Connection found ({path.length - 1} {path.length - 1 === 1 ? "step" : "steps"}):</p>
                <div className="space-y-2">
                  {path.map((step, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                        {step.node.name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{step.node.name}</p>
                        {i > 0 && <p className="text-xs text-muted-foreground">{step.relation}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <AlertCircle className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No connection found between these two people. Add parent-child or spouse links to connect them.
                </p>
              </div>
            )}
          </div>
        )}

        {!personA && !personB && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Select two people to discover how they're connected through your family tree.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Timeline Sub-component ────────────────────────────────────────────────────

function FamilyTimelineTab({ familyId }: { familyId: number }) {
  const [events, setEvents] = useState<Array<{
    id: number; year: number | null; date: string | null; title: string;
    description: string | null; location: string | null; type: string; memory_id: number;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [, navigate] = useLocation();

  useEffect(() => {
    loadTimeline();
  }, [familyId]);

  async function loadTimeline() {
    setLoading(true);
    try {
      const res = await fetch(`/api/family/${familyId}/timeline`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setEvents(data.events ?? []);
    } catch {
      toast.error("Couldn't load timeline");
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  if (!events.length) {
    return (
      <div className="text-center py-16 space-y-3">
        <Calendar className="w-12 h-12 text-muted-foreground/40 mx-auto" />
        <p className="font-semibold">No dated memories yet</p>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          Add memories with dates to your Family Vault to build the legacy timeline.
        </p>
        <button
          onClick={() => navigate(`/family/${familyId}`)}
          className="bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-medium"
        >
          Add Memories
        </button>
      </div>
    );
  }

  // Group by decade
  const byDecade = events.reduce((acc, e) => {
    const decade = e.year ? `${Math.floor(e.year / 10) * 10}s` : "Unknown";
    if (!acc[decade]) acc[decade] = [];
    acc[decade].push(e);
    return acc;
  }, {} as Record<string, typeof events>);

  return (
    <div className="space-y-6">
      {Object.entries(byDecade)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([decade, decEvents]) => (
          <div key={decade}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <h3 className="text-sm font-semibold text-primary">{decade}</h3>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="space-y-2 ml-4">
              {decEvents.map(e => (
                <button
                  key={e.id}
                  onClick={() => navigate(`/family/${familyId}/memory/${e.memory_id}`)}
                  className="w-full text-left bg-card border border-border rounded-xl p-3 active:opacity-70"
                >
                  <div className="flex items-start gap-2">
                    <div className="w-1 h-full bg-primary/30 rounded-full mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-sm">{e.title}</p>
                      {e.year && <p className="text-xs text-muted-foreground mt-0.5">{e.year}</p>}
                      {e.location && <p className="text-xs text-muted-foreground">{e.location}</p>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
