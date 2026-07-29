/**
 * DNA Connections — Import DNA data and discover relatives
 * Route: /diaspora/dna
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Dna, Upload, Users, ChevronRight,
  Loader2, AlertCircle, CheckCircle2, X, Sparkles,
  Globe, Share2,
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

export default function DnaConnectionsPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [summary, setSummary] = useState<{
    total_matches: number;
    close_family: number;
    distant_cousins: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    loadConnections();
  }, [currentUser]);

  async function loadConnections() {
    setLoading(true);
    try {
      const res = await fetch("/api/diaspora/dna/connections", { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSummary(data.summary);
    } catch {
      toast.error("Couldn't load DNA connections");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!selectedProvider) return;
    setImporting(true);
    try {
      const res = await fetch("/api/diaspora/dna/import", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ provider: selectedProvider }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(data.message ?? "DNA data queued for processing!");
      setImportDone(true);
      setShowImport(false);
    } catch {
      toast.error("Couldn't queue DNA import");
    } finally {
      setImporting(false);
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
          <div className="flex-1">
            <h1 className="font-bold flex items-center gap-2">
              <Dna className="w-4 h-4 text-blue-400" />
              DNA Connections
            </h1>
            <p className="text-xs text-muted-foreground">Discover relatives across the diaspora</p>
          </div>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-medium active:opacity-80"
          >
            <Upload className="w-3.5 h-3.5" /> Import
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-5">
        {/* Import success banner */}
        {importDone && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-700 dark:text-green-400">DNA import queued!</p>
              <p className="text-xs text-green-600 dark:text-green-500">You'll be notified when matches are found (24–48 hours).</p>
            </div>
            <button onClick={() => setImportDone(false)}><X className="w-4 h-4 text-green-500" /></button>
          </div>
        )}

        {/* Stats cards */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total Matches", value: summary?.total_matches ?? 0, color: "text-blue-400" },
              { label: "Close Family", value: summary?.close_family ?? 0, color: "text-green-400" },
              { label: "Cousins", value: summary?.distant_cousins ?? 0, color: "text-amber-400" },
            ].map(s => (
              <div key={s.label} className="bg-card border border-border rounded-2xl p-4 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-tight">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Ethnicity breakdown (demo) */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-4 h-4 text-amber-400" />
            <h2 className="font-semibold text-sm">Ancestry Composition</h2>
            <span className="ml-auto text-xs text-muted-foreground">Demo data</span>
          </div>
          <div className="space-y-2.5">
            {ETHNICITY_REGIONS.map(r => (
              <div key={r.region}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-foreground">{r.region}</span>
                  <span className="text-xs font-semibold text-muted-foreground">{r.percentage}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${r.color}`}
                    style={{ width: `${r.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3 text-center">
            Import your DNA data to see your real ancestry breakdown
          </p>
        </div>

        {/* African Diaspora Cousin Matching */}
        <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Share2 className="w-4 h-4 text-blue-400" />
            <h2 className="font-semibold text-sm">African Diaspora Matching</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Niakofa's DNA matching is designed specifically for the African diaspora — finding connections across families separated by the Middle Passage, migration, and history.
          </p>
          <div className="space-y-2">
            {[
              "Import DNA from any major provider",
              "Match with relatives across the diaspora",
              "African cousin relationship inference",
              "Private by default — you control sharing",
            ].map(f => (
              <div key={f} className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                <span className="text-xs text-foreground">{f}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowImport(true)}
            className="mt-4 w-full bg-blue-500 text-white rounded-xl py-2.5 text-sm font-semibold active:opacity-80"
          >
            Import DNA Data
          </button>
        </div>

        {/* Provider list */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Supported Providers
          </h2>
          <div className="space-y-2">
            {PROVIDERS.map(p => (
              <button
                key={p.id}
                onClick={() => { setSelectedProvider(p.id); setShowImport(true); }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border ${p.bg} ${p.border} active:opacity-70 text-left`}
              >
                <Dna className={`w-5 h-5 ${p.color} flex-shrink-0`} />
                <div className="flex-1">
                  <p className={`font-medium text-sm ${p.color}`}>{p.label}</p>
                  <p className="text-xs text-muted-foreground">Import raw DNA data or CSV matches</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>

        {/* Nia DNA Assistant */}
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold">Nia DNA Education</p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
            Nia can help you understand your DNA results, explain ethnicity estimates, and guide you through using DNA to break through genealogy brick walls.
          </p>
          <button
            onClick={() => navigate("/diaspora")}
            className="text-xs text-primary font-medium"
          >
            Ask Nia about DNA research →
          </button>
        </div>
      </div>

      {/* ── Import Modal ─────────────────────────────────────────────── */}
      {showImport && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card rounded-2xl p-5 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Dna className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-bold">Import DNA Data</h2>
              </div>
              <button onClick={() => setShowImport(false)} className="p-1 rounded-lg active:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              Choose your DNA testing provider. After selecting, you'll export your raw DNA file from their website and upload it here.
            </p>

            <div className="space-y-2 mb-4">
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProvider(p.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    selectedProvider === p.id
                      ? `${p.bg} ${p.border} ring-1 ring-current`
                      : "border-border bg-background"
                  } active:opacity-70`}
                >
                  <Dna className={`w-4 h-4 ${p.color}`} />
                  <span className={`text-sm font-medium ${selectedProvider === p.id ? p.color : "text-foreground"}`}>
                    {p.label}
                  </span>
                  {selectedProvider === p.id && (
                    <CheckCircle2 className={`w-4 h-4 ${p.color} ml-auto`} />
                  )}
                </button>
              ))}
            </div>

            {selectedProvider && (
              <div className="bg-muted/50 rounded-xl p-3 mb-4">
                <p className="text-xs font-medium mb-1">How to export from {selectedProvider}:</p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Log in to {selectedProvider}'s website</li>
                  <li>Go to your DNA Settings or Download page</li>
                  <li>Download your raw DNA data (CSV or .zip)</li>
                  <li>Return here and click Import below</li>
                </ol>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowImport(false)}
                className="flex-1 border border-input rounded-xl py-2.5 text-sm font-medium active:opacity-70"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!selectedProvider || importing}
                className="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 active:opacity-80"
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {importing ? "Queuing…" : "Import DNA"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
