/**
 * DNA Connections — Import validated provider data into a Family Space
 * Route: /diaspora/dna
 *
 * Enhancements:
 *  - Family-scoped provider import flow
 *  - Explicit derived-data retention and deletion
 *  - Trust gate: never show estimated results without a parsed dataset
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Dna, Upload,
  Loader2, CheckCircle2, X, Sparkles, Trash2,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "sonner";
import { safeDnaPresentation, type DnaConnectionState } from "@/lib/diaspora/dnaTrustGate";
import { DnaMatchingPanel } from "@/components/DnaMatchingPanel";

const PROVIDERS = [
  { id: "AncestryDNA", label: "AncestryDNA", color: "text-green-400", bg: "bg-green-400/10", border: "border-green-400/20" },
  { id: "23andMe", label: "23andMe", color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20" },
  { id: "MyHeritage", label: "MyHeritage", color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/20" },
  { id: "LivingDNA", label: "LivingDNA", color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/20" },
  { id: "FamilyTreeDNA", label: "FamilyTreeDNA", color: "text-red-400", bg: "bg-red-400/10", border: "border-red-400/20" },
];

interface DnaFamilyProfile {
  id: number;
  family_id: number;
  provider: string;
  status: "failed" | "ready";
  source_file_name: string;
  source_format: string;
  marker_count: number;
  raw_data_retained: boolean;
  retention_expires_at: string;
}

interface DnaFamily {
  id: number;
  name: string;
  profile: DnaFamilyProfile | null;
}

export default function DnaConnectionsPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [families, setFamilies] = useState<DnaFamily[]>([]);
  const [connectionState, setConnectionState] = useState<DnaConnectionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [dnaFile, setDnaFile] = useState<File | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedFamilyId, setSelectedFamilyId] = useState<number | null>(null);
  const [importStep, setImportStep] = useState<"select" | "upload" | "processing" | "done">("select");

  useEffect(() => {
    if (!currentUser) return;
    loadData();
  }, [currentUser]);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch("/api/diaspora/dna/connections", { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const availableFamilies = Array.isArray(data.families) ? data.families : [];
      setFamilies(availableFamilies);
      setSelectedFamilyId((current) => current ?? availableFamilies[0]?.id ?? null);
      setConnectionState({
        status: data.status ?? "not_connected",
        hasParsedDataset: data.has_parsed_dataset === true,
        matchCount: typeof data.match_count === "number" ? data.match_count : null,
        ethnicityAvailable: data.ethnicity_available === true,
      });
    } catch {
      setFamilies([]);
      setConnectionState(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!selectedProvider) return;
    if (!selectedFamilyId) {
      toast.error("Choose a Family Space first");
      return;
    }
    if (!dnaFile) {
      toast.error("Please select a DNA data file first");
      return;
    }
    if (dnaFile.size > 30 * 1024 * 1024) {
      toast.error("DNA files must be 30 MB or smaller");
      return;
    }
    setImportStep("processing");
    try {
      const fileBytes = await dnaFile.arrayBuffer();
      const res = await fetch("/api/diaspora/dna/import", {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/octet-stream",
          "x-dna-provider": selectedProvider,
          "x-dna-family-id": String(selectedFamilyId),
          "x-dna-file-name": dnaFile.name,
        },
        body: fileBytes,
      });
      const data = await res.json().catch(() => ({})) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Import failed");
      setImportStep("done");
      toast.success("DNA export validated");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "DNA import failed");
      setImportStep("upload");
    }
  }

  async function handleDelete(profileId: number) {
    if (!window.confirm("Delete this derived DNA profile? The original file was not stored.")) return;
    try {
      const res = await fetch(`/api/diaspora/dna/connections/${profileId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Could not delete DNA profile");
      toast.success("DNA profile deleted");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete DNA profile");
    }
  }

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Sign in to view DNA connections</p>
      </div>
    );
  }

  const presentation = safeDnaPresentation(connectionState);
  const connectedFamilies = families.filter((family) => family.profile?.status === "ready");

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
              <Dna className="w-4 h-4 text-blue-500" />
              DNA Connections
            </h1>
            <p className="text-xs text-muted-foreground">Discover relatives across the African diaspora</p>
          </div>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-medium active:opacity-80"
          >
            <Upload className="w-3.5 h-3.5" /> Import
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-6">
        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        )}

        {!loading && (
          <>
             {presentation.connected ? (
                 <>
                    <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                        <div>
                          <h2 className="text-sm font-semibold">DNA data connected</h2>
                          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                            {presentation.matchCount == null
                              ? "Your export was parsed into a private marker summary. Relative matching and ethnicity results are not available from this dataset alone."
                              : `${presentation.matchCount} verified matches are available.`}
                          </p>
                        </div>
                      </div>
                    </section>

                   {presentation.showEthnicity && (
                     <section className="rounded-2xl border border-border bg-card p-4">
                       <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">Your ethnicity estimate</h2>
                       <p className="text-xs text-muted-foreground">Your connected provider’s parsed ethnicity results will appear here.</p>
                     </section>
                   )}
                 </>
               ) : (
                 <section className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5">
                   <div className="flex items-center gap-2 mb-2">
                     <Dna className="h-5 w-5 text-blue-400" />
                     <h2 className="text-sm font-semibold">{presentation.headline}</h2>
                   </div>
                   <p className="text-sm leading-relaxed text-muted-foreground">{presentation.body}</p>
                 </section>
                )}

             {connectedFamilies.length > 0 && (
               <section>
                 <div className="mb-3 flex items-center justify-between">
                   <h2 className="text-sm font-semibold uppercase tracking-wide">Connected Family Spaces</h2>
                   <span className="text-xs text-muted-foreground">{connectedFamilies.length}</span>
                 </div>
                 <div className="space-y-2">
                   {connectedFamilies.map((family) => (
                     <div key={family.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                       <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                         <Dna className="h-4 w-4 text-blue-400" />
                       </div>
                       <div className="min-w-0 flex-1">
                         <p className="truncate text-sm font-semibold">{family.name}</p>
                         <p className="mt-1 text-xs text-muted-foreground">
                           {family.profile?.provider} · {family.profile?.marker_count.toLocaleString()} markers · raw file discarded
                         </p>
                       </div>
                       {family.profile && (
                         <button
                           onClick={() => void handleDelete(family.profile!.id)}
                           className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                           aria-label={`Delete DNA profile from ${family.name}`}
                         >
                           <Trash2 className="h-4 w-4" />
                         </button>
                       )}
                     </div>
                   ))}
                 </div>
               </section>
             )}

            {/* Matching is deliberately separate from import consent. */}
            {connectedFamilies.map((family) => (
              <DnaMatchingPanel key={family.id} familyId={family.id} familyName={family.name} />
            ))}

            {/* Import CTA */}
            <section>
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-blue-500" />
                  <p className="text-sm font-semibold">Connect Your DNA</p>
                </div>
                 <p className="text-xs text-muted-foreground mb-3">
                    Upload a raw export from a supported provider. We parse it in memory, retain only a derived marker summary for 90 days, and never store the original file.
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {["AncestryDNA", "23andMe", "MyHeritage"].map(p => (
                    <div key={p} className="bg-blue-500/5 rounded-lg py-2 px-1">
                      <p className="text-xs font-medium text-blue-400">{p}</p>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setShowImport(true)}
                  className="mt-3 w-full flex items-center justify-center gap-2 bg-blue-500 text-white rounded-xl py-2.5 text-sm font-medium active:opacity-80"
                >
                    <Upload className="w-4 h-4" /> Import raw DNA export
                </button>
              </div>
            </section>
          </>
        )}
      </div>

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={() => setShowImport(false)}>
          <div className="bg-background w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Dna className="w-5 h-5 text-blue-500" /> Import DNA Data
              </h2>
              <button onClick={() => setShowImport(false)} className="p-1">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {importStep === "select" && (
              <>
                 <p className="text-sm text-muted-foreground mb-4">Choose the provider and Family Space for this upload. The file is parsed in memory and discarded after validation.</p>
                <div className="space-y-2 mb-4">
                  {PROVIDERS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProvider(p.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                        selectedProvider === p.id
                          ? `${p.bg} ${p.border} ${p.color}`
                          : "bg-card border-border"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg ${p.bg} flex items-center justify-center`}>
                        <Dna className={`w-4 h-4 ${p.color}`} />
                      </div>
                      <span className="font-medium text-sm">{p.label}</span>
                      {selectedProvider === p.id && <CheckCircle2 className="w-4 h-4 ml-auto" />}
                    </button>
                  ))}
                </div>
                 <button
                   disabled={!selectedProvider || families.length === 0}
                   onClick={() => setImportStep("upload")}
                   className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"
                 >
                    Continue to secure upload
                 </button>
              </>
            )}

            {importStep === "upload" && (
              <div className="text-center py-6">
                <Upload className="w-12 h-12 text-blue-500/40 mx-auto mb-3" />
                <p className="font-semibold mb-1">Upload your DNA data file</p>
                 <p className="text-sm text-muted-foreground mb-4 max-w-xs mx-auto">
                   Download your raw DNA data from {PROVIDERS.find(p => p.id === selectedProvider)?.label}, then upload the CSV, TXT, or JSON file here.
                </p>
                 <label className="mb-4 block text-left">
                   <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Family Space</span>
                   <select
                     value={selectedFamilyId ?? ""}
                     onChange={(event) => setSelectedFamilyId(Number(event.target.value) || null)}
                     className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
                   >
                     <option value="" disabled>Select a Family Space</option>
                     {families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}
                   </select>
                 </label>
                <label className="block border-2 border-dashed border-border rounded-2xl py-8 px-4 mb-4 cursor-pointer active:bg-muted/50">
                  <input
                    type="file"
                    accept=".csv,.txt,.json"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0] ?? null;
                      setDnaFile(f);
                      if (f) toast.success(`Selected: ${f.name}`);
                    }}
                  />
                  {dnaFile ? (
                    <div>
                      <CheckCircle2 className="w-6 h-6 text-green-500 mx-auto mb-1" />
                      <p className="text-sm font-medium text-foreground">{dnaFile.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">{(dnaFile.size / 1024).toFixed(0)} KB — tap to change</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Tap to select your CSV file</p>
                  )}
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setImportStep("select")}
                    className="flex-1 border border-border rounded-xl py-2.5 text-sm font-medium active:opacity-70"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={!dnaFile}
                    className="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-bold active:opacity-80 disabled:opacity-40"
                  >
                    Process DNA
                  </button>
                </div>
              </div>
            )}

            {importStep === "processing" && (
              <div className="text-center py-8">
                <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-3" />
                   <p className="font-semibold">Validating your DNA export…</p>
                   <p className="text-sm text-muted-foreground mt-1">The file is processed in memory and not saved.</p>
              </div>
            )}

            {importStep === "done" && (
              <div className="text-center py-8">
                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <p className="font-semibold">DNA export connected</p>
                <p className="text-sm text-muted-foreground mt-1">Your derived marker summary is ready. Matching and ethnicity results remain unavailable until a supported result source is connected.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
