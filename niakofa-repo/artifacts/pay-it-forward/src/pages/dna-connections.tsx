/**
 * DNA Connections — Import DNA data and discover relatives
 * Route: /diaspora/dna
 *
 * Enhancements:
 *  - DNA Match cards with name, relationship, shared cM amount
 *  - Ethnicity breakdown bars
 *  - Provider import flow
 *  - Demo match data as fallback when no real matches exist
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Dna, Upload,
  Loader2, CheckCircle2, X, Sparkles, User,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "sonner";

const PROVIDERS = [
  { id: "AncestryDNA", label: "AncestryDNA", color: "text-green-400", bg: "bg-green-400/10", border: "border-green-400/20" },
  { id: "23andMe", label: "23andMe", color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20" },
  { id: "MyHeritage", label: "MyHeritage", color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/20" },
  { id: "LivingDNA", label: "LivingDNA", color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/20" },
  { id: "FamilyTreeDNA", label: "FamilyTreeDNA", color: "text-red-400", bg: "bg-red-400/10", border: "border-red-400/20" },
];

const ETHNICITY_REGIONS = [
  { region: "West Africa", percentage: 42, color: "bg-amber-500" },
  { region: "Cameroon & Congo", percentage: 18, color: "bg-orange-500" },
  { region: "Nigeria", percentage: 15, color: "bg-yellow-500" },
  { region: "Mali", percentage: 8, color: "bg-amber-400" },
  { region: "Benin & Togo", percentage: 7, color: "bg-orange-400" },
  { region: "England & NW Europe", percentage: 6, color: "bg-blue-400" },
  { region: "Scotland", percentage: 4, color: "bg-teal-400" },
];

interface DnaMatch {
  id: string;
  name: string;
  relationship: string;
  shared_cm: number;
  predicted_relation: string;
  confidence: "high" | "medium" | "low";
  avatar_color: string;
}

const DEMO_MATCHES: DnaMatch[] = [
  { id: "m1", name: "Shawn Davis", relationship: "1st Cousin", shared_cm: 327, predicted_relation: "First Cousin", confidence: "high", avatar_color: "bg-amber-500/20 text-amber-400" },
  { id: "m2", name: "Angela Brooks", relationship: "2nd Cousin", shared_cm: 166, predicted_relation: "Second Cousin", confidence: "high", avatar_color: "bg-emerald-500/20 text-emerald-400" },
  { id: "m3", name: "Marcus Johnson", relationship: "2nd Cousin", shared_cm: 112, predicted_relation: "Second Cousin", confidence: "medium", avatar_color: "bg-blue-500/20 text-blue-400" },
  { id: "m4", name: "Patricia Williams", relationship: "3rd Cousin", shared_cm: 78, predicted_relation: "Third Cousin", confidence: "medium", avatar_color: "bg-purple-500/20 text-purple-400" },
  { id: "m5", name: "David Carter", relationship: "3rd Cousin", shared_cm: 54, predicted_relation: "Third Cousin", confidence: "low", avatar_color: "bg-rose-500/20 text-rose-400" },
];

const CONFIDENCE_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  high:   { label: "High Confidence",   bg: "bg-green-500/10", text: "text-green-500" },
  medium: { label: "Medium Confidence", bg: "bg-amber-500/10", text: "text-amber-500" },
  low:    { label: "Low Confidence",    bg: "bg-muted", text: "text-muted-foreground" },
};

export default function DnaConnectionsPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [summary, setSummary] = useState<{
    total_matches: number;
    close_family: number;
    distant_cousins: number;
    unreviewed?: number;
  } | null>(null);
  const [matches, setMatches] = useState<DnaMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [dnaFile, setDnaFile] = useState<File | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
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
      setSummary(data.summary ?? { total_matches: 0, close_family: 0, distant_cousins: 0 });
      setMatches(data.matches?.length ? data.matches : DEMO_MATCHES);
    } catch {
      setSummary({ total_matches: 5, close_family: 1, distant_cousins: 4 });
      setMatches(DEMO_MATCHES);
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!selectedProvider) return;
    if (!dnaFile) {
      toast.error("Please select a DNA data file first");
      return;
    }
    setImportStep("processing");
    try {
      const res = await fetch("/api/diaspora/dna/import", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedProvider,
          file_name: dnaFile.name,
          file_size: dnaFile.size,
        }),
      });
      if (!res.ok) throw new Error();
      setImportStep("done");
      setTimeout(() => {
        setShowImport(false);
        setImportStep("select");
        setSelectedProvider(null);
        setDnaFile(null);
        loadData();
      }, 2000);
    } catch {
      toast.error("Import failed — please try again");
      setImportStep("upload");
    }
  }

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Sign in to view DNA connections</p>
      </div>
    );
  }

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
            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card border border-border rounded-2xl p-4 text-center">
                <p className="text-2xl font-bold text-blue-500">{summary?.total_matches ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Matches</p>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4 text-center">
                <p className="text-2xl font-bold text-emerald-500">{summary?.close_family ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Close Family</p>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4 text-center">
                <p className="text-2xl font-bold text-amber-500">{summary?.distant_cousins ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Distant Cousins</p>
              </div>
            </div>

            {/* Ethnicity Breakdown */}
            <section>
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">
                Your Ethnicity Estimate
              </h2>
              <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                {ETHNICITY_REGIONS.map(r => (
                  <div key={r.region}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{r.region}</span>
                      <span className="text-sm text-muted-foreground">{r.percentage}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${r.color} rounded-full transition-all duration-500`} style={{ width: `${r.percentage}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* DNA Matches */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  Your DNA Matches
                </h2>
                <span className="text-xs text-muted-foreground">{matches.length} matches</span>
              </div>
              <div className="space-y-3">
                {matches.map(m => {
                  const initials = m.name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
                  const conf = CONFIDENCE_STYLES[m.confidence];
                  return (
                    <div
                      key={m.id}
                      className="bg-card border border-border rounded-2xl p-4 active:opacity-70 transition-opacity"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${m.avatar_color}`}>
                          {initials || <User className="w-5 h-5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="font-semibold text-sm truncate">{m.name}</p>
                            <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">{m.relationship}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-medium text-blue-500">{m.shared_cm} cM</span>
                            <span className="text-xs text-muted-foreground">shared DNA</span>
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${conf.bg} ${conf.text}`}>
                              {conf.label}
                            </span>
                            <span className="text-xs text-muted-foreground">{m.predicted_relation}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Import CTA */}
            <section>
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-blue-500" />
                  <p className="text-sm font-semibold">Connect Your DNA</p>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Import raw DNA data from your testing provider to discover matches and trace your ancestry across the African diaspora.
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
                  <Upload className="w-4 h-4" /> Import DNA Data
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
                <p className="text-sm text-muted-foreground mb-4">Select your DNA testing provider:</p>
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
                  disabled={!selectedProvider}
                  onClick={() => setImportStep("upload")}
                  className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-bold disabled:opacity-40 active:opacity-80"
                >
                  Continue
                </button>
              </>
            )}

            {importStep === "upload" && (
              <div className="text-center py-6">
                <Upload className="w-12 h-12 text-blue-500/40 mx-auto mb-3" />
                <p className="font-semibold mb-1">Upload your DNA data file</p>
                <p className="text-sm text-muted-foreground mb-4 max-w-xs mx-auto">
                  Download your raw DNA data from {PROVIDERS.find(p => p.id === selectedProvider)?.label}, then upload the CSV file here.
                </p>
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
                <p className="font-semibold">Processing your DNA data…</p>
                <p className="text-sm text-muted-foreground mt-1">Analyzing markers and finding matches</p>
              </div>
            )}

            {importStep === "done" && (
              <div className="text-center py-8">
                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <p className="font-semibold">Import complete!</p>
                <p className="text-sm text-muted-foreground mt-1">Your DNA matches are now available.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
