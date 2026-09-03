import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Dna, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { authHeaders } from "@/lib/auth";
import { toast } from "sonner";
import { diasporaTheme } from "@/lib/diaspora/theme";

type Consent = {
  opted_in: boolean;
  consented_at: string | null;
  revoked_at: string | null;
};

type Match = {
  matched_family_id: number;
  matched_user_id: number;
  relationship_band: string;
  confidence: string;
  similarity_score: number;
  source?: string;
  expires_at?: string;
};

type MatchingPanelProps = {
  familyId: number;
  familyName: string;
};

export function DnaMatchingPanel({ familyId, familyName }: MatchingPanelProps) {
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [hasReadyProfile, setHasReadyProfile] = useState(false);
  const [consent, setConsent] = useState<Consent>({ opted_in: false, consented_at: null, revoked_at: null });
  const [matches, setMatches] = useState<Match[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const statusResponse = await fetch(`/api/diaspora/dna/matching/status?family_id=${familyId}`, { headers: authHeaders() });
      if (!statusResponse.ok) throw new Error("Could not load DNA matching status");
      const status = await statusResponse.json();
      setEnabled(status.enabled === true);
      setHasReadyProfile(status.has_ready_profile === true);
      setConsent(status.consent ?? { opted_in: false, consented_at: null, revoked_at: null });

      if (status.enabled === true && status.consent?.opted_in === true) {
        const resultResponse = await fetch(`/api/diaspora/dna/matching/results?family_id=${familyId}`, { headers: authHeaders() });
        if (resultResponse.ok) {
          const result = await resultResponse.json();
          setMatches(Array.isArray(result.matches) ? result.matches : []);
        }
      } else {
        setMatches([]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load DNA matching status");
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  useEffect(() => { void load(); }, [load]);

  async function updateConsent(optedIn: boolean) {
    setWorking(true);
    try {
      const response = await fetch("/api/diaspora/dna/matching/consent", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ family_id: familyId, opted_in: optedIn }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not update DNA matching consent");
      setConsent(data.consent);
      setAcknowledged(false);
      setMatches([]);
      toast.success(optedIn ? "DNA matching enabled for this Family Space" : "DNA matching revoked");
      if (optedIn) await refreshMatches();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update consent");
    } finally {
      setWorking(false);
    }
  }

  async function refreshMatches() {
    setWorking(true);
    try {
      const response = await fetch("/api/diaspora/dna/matching/refresh", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ family_id: familyId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not refresh DNA matches");
      setMatches(Array.isArray(data.matches) ? data.matches : []);
      toast.success("DNA matching results refreshed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh DNA matches");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className={`${diasporaTheme.radius} border border-teal-300/20 bg-teal-300/[0.06] p-4`}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-500/15">
          <Dna className="h-5 w-5 text-teal-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Private DNA matching</p>
              <p className="text-xs text-muted-foreground">{familyName}</p>
            </div>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-teal-400" />}
          </div>

          {!loading && !enabled && (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Your derived DNA profile is protected. Relative matching is not enabled in this environment yet, so no relationship results are generated.
            </p>
          )}

          {!loading && enabled && !hasReadyProfile && (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Import a supported raw export for this Family Space before opting in to private matching.
            </p>
          )}

          {!loading && enabled && hasReadyProfile && !consent.opted_in && (
            <div className="mt-3 space-y-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                 Opt in only if you want Niakofa to compare your derived marker sketch with other consenting, active members who have connected DNA. Matching can include members of other Family Spaces; importing DNA does not opt you in.
              </p>
              <label className="flex items-start gap-2 text-xs leading-relaxed text-foreground">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="mt-0.5 accent-teal-500"
                />
                I understand matching is probabilistic, and I can revoke it at any time.
              </label>
              <button
                type="button"
                disabled={!acknowledged || working}
                onClick={() => void updateConsent(true)}
                className="w-full rounded-xl bg-teal-400 px-3 py-2.5 text-sm font-bold text-teal-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {working ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Opt in to private matching"}
              </button>
            </div>
          )}

          {!loading && enabled && consent.opted_in && (
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-2 text-xs text-teal-300">
                <ShieldCheck className="h-4 w-4" />
                 <span>Opted in · consented members only · derived data only</span>
              </div>
              {matches.length === 0 ? (
                <p className="rounded-xl border border-border/70 bg-background/40 p-3 text-xs leading-relaxed text-muted-foreground">
                  No consenting comparison was found yet. Results stay empty when there is no eligible comparison source.
                </p>
              ) : (
                <div className="space-y-2">
                  {matches.map((match) => (
                    <div key={`${match.matched_family_id}-${match.matched_user_id}`} className="rounded-xl border border-border/70 bg-background/40 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{match.relationship_band}</span>
                        <span className="text-xs capitalize text-muted-foreground">{match.confidence} confidence</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                         Similarity signal: {Math.round(match.similarity_score * 100)}% · source: {match.source ?? "derived sketch"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <button type="button" disabled={working} onClick={() => void refreshMatches()} className="flex items-center gap-1.5 text-xs font-semibold text-teal-300 disabled:opacity-50">
                  <RefreshCw className={`h-3.5 w-3.5 ${working ? "animate-spin" : ""}`} /> Refresh results
                </button>
                <button type="button" disabled={working} onClick={() => void updateConsent(false)} className="text-xs font-semibold text-muted-foreground underline underline-offset-2 disabled:opacity-50">
                  Revoke matching
                </button>
              </div>
              <div className="flex items-start gap-1.5 border-t border-border/60 pt-2 text-[11px] leading-relaxed text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-400" />
                These are broad, probabilistic similarity signals—not shared-cM, relationship, legal, forensic, paternity, ethnicity, or provider-grade segment results.
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}