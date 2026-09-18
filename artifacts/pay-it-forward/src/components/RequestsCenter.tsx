import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, ClipboardList, Loader2, MapPin, RefreshCw, Route, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";

type RequestStatus = "open" | "claimed" | "en_route" | "arrived" | "completed" | "cancelled" | string;

type HelpRequest = {
  id: number;
  title: string;
  description?: string | null;
  category?: string | null;
  urgency?: string | null;
  status: RequestStatus;
  requester_id: number;
  helper_id: number | null;
  requester_name?: string | null;
  helper_name?: string | null;
  created_at?: string | null;
};

type RequestsCenterProps = {
  embedded?: boolean;
};

type CenterTab = "open" | "mine" | "helping" | "completed";

const ACTIVE_STATUSES = ["claimed", "en_route", "arrived"] as const;
const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

function labelStatus(status: string) {
  return status.replace(/_/g, " ");
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function mergeUnique(rows: HelpRequest[]) {
  const byId = new Map<number, HelpRequest>();
  for (const row of rows) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => b.id - a.id);
}

function isActive(status: string): boolean {
  return ACTIVE_STATUSES.includes(status as typeof ACTIVE_STATUSES[number]);
}

export default function RequestsCenter({ embedded = false }: RequestsCenterProps) {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<CenterTab>("open");
  const [rows, setRows] = useState<HelpRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = currentUser?.id ?? null;

  const fetchRows = useCallback(async (nextTab: CenterTab, silent = false) => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }

    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const get = async (query: string) => {
        const response = await fetch(`${BASE}/api/requests?${query}`, { headers: authHeaders() });
        const data = await response.json().catch(() => ({})) as { error?: string } | HelpRequest[];
        if (!response.ok) {
          throw new Error(!Array.isArray(data) && data.error ? data.error : `Could not load requests (HTTP ${response.status}).`);
        }
        return Array.isArray(data) ? data : [];
      };

      if (nextTab === "open") {
        setRows(await get("status=open&limit=100"));
      } else if (nextTab === "mine") {
        setRows(await get(`requester_id=${encodeURIComponent(String(userId))}&limit=100`));
      } else if (nextTab === "helping") {
        const active = await Promise.all(
          ACTIVE_STATUSES.map(status =>
            get(`helper_id=${encodeURIComponent(String(userId))}&status=${status}&limit=100`)
          ),
        );
        setRows(mergeUnique(active.flat()));
      } else {
        const [requested, helped] = await Promise.all([
          get(`requester_id=${encodeURIComponent(String(userId))}&status=completed&limit=100`),
          get(`helper_id=${encodeURIComponent(String(userId))}&status=completed&limit=100`),
        ]);
        setRows(mergeUnique([...requested, ...helped]));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load requests.");
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    void fetchRows(tab);
  }, [fetchRows, tab]);

  const tabs = useMemo(() => [
    { id: "open" as const, label: "Open", icon: <ClipboardList className="h-4 w-4" /> },
    { id: "mine" as const, label: "My Requests", icon: <Sparkles className="h-4 w-4" /> },
    { id: "helping" as const, label: "Helping", icon: <Route className="h-4 w-4" /> },
    { id: "completed" as const, label: "Completed", icon: <CheckCircle2 className="h-4 w-4" /> },
  ], []);

  return (
    <section className={embedded ? "space-y-4" : "mx-auto min-h-[70dvh] w-full max-w-5xl px-4 pb-28 pt-5"}>
      {!embedded && (
        <header className="mb-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Community</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Requests</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            One place to discover open help, manage your requests, and follow work already in progress.
          </p>
        </header>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Request status">
        {tabs.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`flex min-h-11 shrink-0 items-center gap-2 rounded-2xl border px-4 text-sm font-bold transition-colors ${
              tab === item.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {rows.length} {rows.length === 1 ? "request" : "requests"}
        </p>
        <button
          type="button"
          onClick={() => void fetchRows(tab, true)}
          disabled={refreshing}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-primary hover:bg-primary/10 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-44 items-center justify-center rounded-3xl border border-border bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
          <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-bold">
            {tab === "open" ? "No open requests right now." :
             tab === "mine" ? "You have not posted a request yet." :
             tab === "helping" ? "You are not helping on an active request." :
             "No completed requests yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(row => {
            const active = isActive(row.status);
            const canNavigate = active && row.helper_id === userId;
            const detailPath = canNavigate ? `/request/${row.id}` : `/request/${row.id}/view`;
            return (
              <article key={row.id} className="rounded-3xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                    {row.status === "completed"
                      ? <CheckCircle2 className="h-5 w-5 text-primary" />
                      : <ClipboardList className="h-5 w-5 text-primary" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-black">{row.title}</h3>
                    <p className="mt-1 text-xs capitalize text-muted-foreground">
                      {row.category ? row.category.replace(/_/g, " ") : "Community help"}
                      {row.urgency ? ` · ${row.urgency}` : ""}
                      {formatDate(row.created_at) ? ` · ${formatDate(row.created_at)}` : ""}
                    </p>
                    {row.description && (
                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{row.description}</p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="rounded-full border border-border bg-muted px-2.5 py-1 font-bold capitalize">
                        {labelStatus(row.status)}
                      </span>
                      {row.requester_name && <span className="text-muted-foreground">Requester: {row.requester_name}</span>}
                      {row.helper_name && <span className="text-muted-foreground">Helper: {row.helper_name}</span>}
                    </div>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => navigate(detailPath)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 text-sm font-bold"
                  >
                    <ClipboardList className="h-4 w-4" />
                    View request
                  </button>

                  {canNavigate && (
                    <button
                      type="button"
                      onClick={() => navigate(`/request/${row.id}`)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-black text-primary-foreground"
                    >
                      <MapPin className="h-4 w-4" />
                      Open navigation
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}