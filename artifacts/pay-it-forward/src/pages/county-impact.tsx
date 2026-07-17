/**
 * County-Branded Public Impact Dashboard
 *
 * No authentication required. Shows real local stats for a county:
 *   - Community Pool balance and health
 *   - Requests fulfilled, completion rate
 *   - Active helpers, recent activity
 *   - Sponsor branding (county name, logo)
 *
 * Route: /impact/:county  (e.g. /impact/tarrant)
 * Also renders /impact as a county picker.
 */
import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Users, CheckCircle, Heart, TrendingUp, DollarSign, MapPin, ArrowLeft, ExternalLink } from "lucide-react";

interface CommunityInfo {
  id: number;
  name: string;
  county: string | null;
  state: string | null;
  description: string | null;
  sponsor_name: string | null;
  sponsor_logo_url: string | null;
  hourly_rate: number | null;
  target_reserve: number;
}

interface ImpactData {
  community: CommunityInfo;
  pool: {
    balance: number;
    total_contributed: number;
    total_fronted: number;
    helpers_paid: number;
    health_pct: number;
  };
  requests: {
    total: number;
    completed: number;
    open: number;
    completion_rate: number;
  };
  helpers: {
    active_now: number;
  };
  activity: {
    completions_30d: number;
    top_categories: Array<{ category: string; count: number }>;
  };
  generated_at: string;
}

interface CommunityListItem {
  id: number;
  name: string;
  county: string | null;
  state: string | null;
  description: string | null;
  sponsor_name: string | null;
  sponsor_logo_url: string | null;
}

function formatDollars(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function categoryLabel(cat: string) {
  return cat.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function PoolHealthBar({ pct }: { pct: number }) {
  const color = pct >= 75 ? "#22c55e" : pct >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ background: "#1e2426", borderRadius: 8, height: 10, overflow: "hidden", marginTop: 8 }}>
      <div style={{
        width: `${Math.min(100, pct)}%`,
        height: "100%",
        background: color,
        borderRadius: 8,
        transition: "width 0.8s ease",
      }} />
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: "#141a1c",
      border: "1px solid #2a3335",
      borderRadius: 12,
      padding: "20px 24px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#64b3c4" }}>{icon}<span style={{ fontSize: 13, color: "#7a9ba8", fontWeight: 500 }}>{label}</span></div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#e8f4f7", letterSpacing: "-0.5px" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#5a7a87" }}>{sub}</div>}
    </div>
  );
}

// ── County Impact Dashboard ───────────────────────────────────────────────────
function CountyImpact({ county }: { county: string }) {
  const [data, setData] = useState<ImpactData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/impact/${encodeURIComponent(county)}`)
      .then(r => {
        if (!r.ok) throw new Error(r.status === 404 ? "County not found" : "Failed to load impact data");
        return r.json() as Promise<ImpactData>;
      })
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : "Unknown error"))
      .finally(() => setLoading(false));
  }, [county]);

  if (loading && !data) return (
    <div style={{ minHeight: "100vh", background: "#0e1111", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#64b3c4", fontSize: 16 }}>Loading impact data…</div>
    </div>
  );

  if (error || !data) return (
    <div style={{ minHeight: "100vh", background: "#0e1111", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div style={{ color: "#ef4444", fontSize: 18 }}>{error ?? "No data available"}</div>
      <button onClick={() => setLocation("/impact")} style={{ color: "#64b3c4", background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>← Back to counties</button>
    </div>
  );

  const { community, pool, requests, helpers, activity } = data;

  return (
    <div style={{ minHeight: "100vh", background: "#0e1111", color: "#e8f4f7", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#111719", borderBottom: "1px solid #1e2e32" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            onClick={() => setLocation("/impact")}
            style={{ display: "flex", alignItems: "center", gap: 8, color: "#64b3c4", background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 0 }}
          >
            <ArrowLeft size={16} /> All Counties
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {community.sponsor_logo_url && (
              <img src={community.sponsor_logo_url} alt={community.sponsor_name ?? community.name} style={{ height: 32, objectFit: "contain" }} />
            )}
            <span style={{ fontSize: 13, color: "#7a9ba8" }}>
              {community.sponsor_name ? `Sponsored by ${community.sponsor_name}` : "Community Impact"}
            </span>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div style={{ background: "linear-gradient(180deg, #111a1d 0%, #0e1111 100%)", borderBottom: "1px solid #1a2a2e" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px 40px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
            <MapPin size={22} style={{ color: "#64b3c4", marginTop: 2, flexShrink: 0 }} />
            <div>
              <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0, letterSpacing: "-0.5px" }}>
                {community.name}
              </h1>
              {community.state && (
                <div style={{ color: "#7a9ba8", fontSize: 14, marginTop: 4 }}>{community.state}</div>
              )}
            </div>
          </div>
          {community.description && (
            <p style={{ color: "#a0bfc8", fontSize: 16, maxWidth: 640, lineHeight: 1.6, margin: 0 }}>
              {community.description}
            </p>
          )}
          {community.hourly_rate && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 16, background: "#1a2f35", border: "1px solid #2a4a52", borderRadius: 8, padding: "8px 14px" }}>
              <DollarSign size={14} style={{ color: "#22c55e" }} />
              <span style={{ fontSize: 13, color: "#a0e0b0" }}>
                County livable wage: <strong>${community.hourly_rate}/hr</strong>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
          <StatCard
            icon={<CheckCircle size={18} />}
            label="Requests Fulfilled"
            value={requests.completed.toLocaleString()}
            sub={`${requests.completion_rate}% completion rate`}
          />
          <StatCard
            icon={<Users size={18} />}
            label="Active Helpers Now"
            value={helpers.active_now.toLocaleString()}
            sub={`${requests.open} open requests`}
          />
          <StatCard
            icon={<Heart size={18} />}
            label="Helpers Paid"
            value={pool.helpers_paid.toLocaleString()}
            sub="from Community Pool"
          />
          <StatCard
            icon={<TrendingUp size={18} />}
            label="Completions (30d)"
            value={activity.completions_30d.toLocaleString()}
            sub="requests in last 30 days"
          />
        </div>

        {/* Community Pool */}
        <div style={{ background: "#141a1c", border: "1px solid #2a3335", borderRadius: 12, padding: "24px", marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 20px", color: "#e8f4f7" }}>
            Community Pool
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 20 }}>
            <div>
              <div style={{ color: "#7a9ba8", fontSize: 12, marginBottom: 4 }}>Current Balance</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#22c55e" }}>{formatDollars(pool.balance)}</div>
            </div>
            <div>
              <div style={{ color: "#7a9ba8", fontSize: 12, marginBottom: 4 }}>Total Contributed</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{formatDollars(pool.total_contributed)}</div>
            </div>
            <div>
              <div style={{ color: "#7a9ba8", fontSize: 12, marginBottom: 4 }}>Paid to Helpers</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{formatDollars(pool.total_fronted)}</div>
            </div>
          </div>
          <div style={{ marginTop: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#7a9ba8" }}>Pool Health</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: pool.health_pct >= 75 ? "#22c55e" : pool.health_pct >= 40 ? "#f59e0b" : "#ef4444" }}>
                {pool.health_pct}%
              </span>
            </div>
            <PoolHealthBar pct={pool.health_pct} />
            <div style={{ fontSize: 11, color: "#4a6a77", marginTop: 6 }}>
              Target reserve: {formatDollars(community.target_reserve)}
            </div>
          </div>
        </div>

        {/* Top categories */}
        {activity.top_categories.length > 0 && (
          <div style={{ background: "#141a1c", border: "1px solid #2a3335", borderRadius: 12, padding: "24px" }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 20px", color: "#e8f4f7" }}>
              Top Help Categories
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {activity.top_categories.map((cat, i) => {
                const maxCount = activity.top_categories[0]?.count ?? 1;
                const pct = Math.round((cat.count / maxCount) * 100);
                return (
                  <div key={cat.category}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 14, color: "#c0d8e0" }}>{categoryLabel(cat.category)}</span>
                      <span style={{ fontSize: 13, color: "#7a9ba8" }}>{cat.count.toLocaleString()} completed</span>
                    </div>
                    <div style={{ background: "#1e2426", borderRadius: 4, height: 6 }}>
                      <div style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: i === 0 ? "#64b3c4" : "#3a6a7a",
                        borderRadius: 4,
                        transition: "width 0.6s ease",
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid #1a2426", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ fontSize: 12, color: "#4a6a77" }}>
            Data updated {new Date(data.generated_at).toLocaleTimeString()}
          </div>
          <a
            href="/"
            style={{ display: "flex", alignItems: "center", gap: 6, color: "#64b3c4", fontSize: 13, textDecoration: "none" }}
          >
            <ExternalLink size={14} /> Open Niakofa App
          </a>
        </div>
      </div>
    </div>
  );
}

// ── County Picker (landing) ───────────────────────────────────────────────────
function CountyPicker() {
  const [communities, setCommunities] = useState<CommunityListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    fetch("/api/impact")
      .then(r => r.json() as Promise<{ communities: CommunityListItem[] }>)
      .then(d => setCommunities(d.communities ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#0e1111", color: "#e8f4f7", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "60px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h1 style={{ fontSize: 36, fontWeight: 800, margin: "0 0 12px", letterSpacing: "-0.5px" }}>
            Community Impact
          </h1>
          <p style={{ color: "#7a9ba8", fontSize: 17, margin: 0 }}>
            Real-time impact data for every county powered by Niakofa.
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", color: "#64b3c4" }}>Loading counties…</div>
        ) : communities.length === 0 ? (
          <div style={{ textAlign: "center", color: "#7a9ba8" }}>No counties configured yet.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {communities.map(c => (
              <button
                key={c.id}
                onClick={() => setLocation(`/impact/${c.county ?? String(c.id)}`)}
                style={{
                  background: "#141a1c",
                  border: "1px solid #2a3335",
                  borderRadius: 12,
                  padding: "20px 22px",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "border-color 0.15s, background 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#64b3c4"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#2a3335"; }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  {c.sponsor_logo_url && (
                    <img src={c.sponsor_logo_url} alt={c.sponsor_name ?? c.name} style={{ height: 24, objectFit: "contain" }} />
                  )}
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#e8f4f7" }}>{c.name}</div>
                </div>
                {c.state && (
                  <div style={{ fontSize: 13, color: "#7a9ba8", marginBottom: 6 }}>{c.state}</div>
                )}
                {c.description && (
                  <div style={{ fontSize: 13, color: "#5a7a87", lineHeight: 1.5 }}>
                    {c.description.slice(0, 80)}{c.description.length > 80 ? "…" : ""}
                  </div>
                )}
                {c.sponsor_name && (
                  <div style={{ fontSize: 12, color: "#4a6a77", marginTop: 10 }}>
                    Sponsored by {c.sponsor_name}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 48 }}>
          <a href="/" style={{ color: "#64b3c4", fontSize: 14, textDecoration: "none" }}>
            ← Back to Niakofa
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Page entry point ──────────────────────────────────────────────────────────
export default function CountyImpactPage() {
  const params = useParams<{ county?: string }>();
  const county = params.county;
  if (county) return <CountyImpact county={county} />;
  return <CountyPicker />;
}
