import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/auth";

type DailyWatchInsight = {
  day: string;
  watch_time_ms: number;
  plays: number;
  retention_rate: number | null;
};

type WatchInsightsResponse = {
  days: number;
  retention_minimum_plays: number;
  retention_window_days: number;
  total_recorded_plays: number;
  retention_available: boolean;
  has_data: boolean;
  daily: DailyWatchInsight[];
};

function formatWatchTime(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export function CreatorInsightsPanel({ days = 30 }: { days?: number }) {
  const [data, setData] = useState<WatchInsightsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetch(`/api/community/creator/watch-insights?days=${encodeURIComponent(String(days))}`, {
      headers: authHeaders(),
      credentials: "same-origin",
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("Watch insights could not be loaded.");
      return response.json() as Promise<WatchInsightsResponse>;
    }).then(setData).catch((reason: unknown) => {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : "Watch insights could not be loaded.");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [days]);

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm" aria-labelledby="creator-watch-insights-title">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Creator analytics</p>
        <h2 id="creator-watch-insights-title" className="mt-1 text-lg font-semibold text-slate-900">Moment watch time</h2>
        <p className="mt-1 text-sm text-slate-500">Daily watch time for all your Moments, including expired ones. Retention requires {data?.retention_minimum_plays ?? 5} plays in the rolling {data?.retention_window_days ?? 90}-day window and {data?.retention_minimum_plays ?? 5} plays in that day’s cohort.</p>
      </div>
      {loading && <p className="py-6 text-sm text-slate-500" role="status">Loading your watch insights…</p>}
      {!loading && error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p>}
      {!loading && !error && data && !data.has_data && (
        <div className="rounded-xl bg-slate-50 px-4 py-6 text-center">
          <p className="font-medium text-slate-800">No watch activity yet</p>
          <p className="mt-1 text-sm text-slate-500">When people watch your published Moments, daily insights will appear here.</p>
        </div>
      )}
      {!loading && !error && data?.has_data && (
        <div className="space-y-2">
          {data.daily.filter((day) => day.plays > 0).map((day) => (
            <div key={day.day} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
              <time dateTime={day.day} className="font-medium text-slate-700">
                {new Date(`${day.day}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </time>
              <span className="text-slate-600">{formatWatchTime(day.watch_time_ms)} · {day.plays} {day.plays === 1 ? "play" : "plays"}</span>
              <span className="min-w-24 text-right font-semibold text-emerald-800">
                {data.retention_available && day.plays >= data.retention_minimum_plays && day.retention_rate !== null
                  ? `${Math.round(day.retention_rate * 100)}% retention`
                  : !data.retention_available
                    ? `Retention hidden (${data.total_recorded_plays}/${data.retention_minimum_plays} plays in ${data.retention_window_days} days)`
                    : `Retention hidden (<${data.retention_minimum_plays} plays that day)`}
              </span>
            </div>
          ))}
          <p className="pt-2 text-xs text-slate-500">
            Retention is the share of recorded plays completed. It is hidden until there are at least {data.retention_minimum_plays} total plays in the rolling {data.retention_window_days}-day window, and on any individual day with fewer than {data.retention_minimum_plays} plays.
          </p>
        </div>
      )}
    </section>
  );
}