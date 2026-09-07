import { ArrowRight, CircleDot, HeartHandshake, MapPin, Mic, Radio, Users } from "lucide-react";
import { authHeaders } from "@/lib/auth";
import { diasporaTheme } from "@/lib/diaspora/theme";
import { useEffect, useState } from "react";

type Hub = { member_count?: number; story_count?: number; open_requests?: number; activity?: { active_helpers?: number } | null };
type Presence = { hubs?: Array<{ live_user_count?: number }>; neighborhoods?: Array<{ live_user_count?: number; gps_verified?: boolean }> };

type PulseProps = { navigate?: (href: string) => void };

const ITEMS = [
  { key: "members", label: "Members", icon: Users, href: "/community", tone: "text-amber-300 bg-amber-300/10 border-amber-300/20" },
  { key: "live", label: "Live", icon: Radio, href: "/diaspora/heritage/globe", tone: "text-teal-300 bg-teal-300/10 border-teal-300/20" },
  { key: "neighborhood", label: "Neighborhood", icon: MapPin, href: "/community", tone: "text-emerald-300 bg-emerald-300/10 border-emerald-300/20" },
  { key: "helping", label: "Helping", icon: HeartHandshake, href: "/helper-dashboard", tone: "text-sky-300 bg-sky-300/10 border-sky-300/20" },
  { key: "stories", label: "Stories", icon: Mic, href: "/diaspora/family?intent=oral-history", tone: "text-rose-300 bg-rose-300/10 border-rose-300/20" },
  { key: "circles", label: "Circles", icon: CircleDot, href: "/audio-circles", tone: "text-violet-300 bg-violet-300/10 border-violet-300/20" },
] as const;

export function GlobalVillagePulse({ navigate }: PulseProps) {
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [presence, setPresence] = useState<Presence | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [hubRes, presenceRes] = await Promise.all([
          fetch("/api/griot/hubs", { headers: authHeaders() }),
          fetch("/api/griot/live-presence", { headers: authHeaders() }),
        ]);
        if (cancelled) return;
        if (hubRes.ok) {
          const data = await hubRes.json();
          setHubs(Array.isArray(data.hubs) ? data.hubs : []);
        }
        if (presenceRes.ok) setPresence(await presenceRes.json());
      } catch {
        // The surrounding page remains useful when live pulse data is unavailable.
      }
    }
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const values: Record<string, number | null> = {
    members: hubs.reduce((sum, hub) => sum + Number(hub.member_count ?? 0), 0),
    live: (presence?.hubs ?? []).reduce((sum, hub) => sum + Number(hub.live_user_count ?? 0), 0),
    neighborhood: (presence?.neighborhoods ?? []).filter((n) => n.gps_verified && Number(n.live_user_count ?? 0) > 0).length,
    helping: hubs.reduce((sum, hub) => sum + Number(hub.activity?.active_helpers ?? 0), 0),
    stories: hubs.reduce((sum, hub) => sum + Number(hub.story_count ?? 0), 0),
    circles: null,
  };

  return (
    <section aria-label="Global Village pulse" className={`${diasporaTheme.radiusHero} border border-teal-300/15 bg-white/[0.025] p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-teal-300/75">The Global Village</p>
          <h2 className="mt-1 text-lg font-black text-white">Alive from member to circle.</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-white/40">One connected journey: people gather, presence lights up neighborhoods, neighbors help, stories travel, and circles bring people back together.</p>
        </div>
        <span className="hidden rounded-full border border-teal-300/20 bg-teal-300/5 px-2.5 py-1 text-[10px] font-semibold text-teal-200 sm:inline-flex">Live pulse</span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {ITEMS.map((item, index) => {
          const Icon = item.icon;
          const value = values[item.key];
          const content = (
            <>
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${item.tone}`}><Icon className="h-4 w-4" /></span>
              <span className="mt-2 block text-xs font-bold text-white">{item.label}</span>
              <span className="mt-0.5 block text-[10px] text-white/40">{value == null ? "Explore" : value.toLocaleString()}</span>
              {index < ITEMS.length - 1 && <span aria-hidden="true" className="pointer-events-none absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 text-white/20 lg:block">›</span>}
            </>
          );
          return navigate ? (
            <button key={item.key} type="button" onClick={() => navigate(item.href)} className={`group relative rounded-2xl border border-white/10 bg-black/10 p-3 text-left transition hover:-translate-y-0.5 hover:bg-white/[0.055] ${diasporaTheme.focus}`}>
              {content}
              <ArrowRight className="absolute right-2.5 top-2.5 h-3 w-3 text-white/15 transition group-hover:text-white/50" />
            </button>
          ) : (
            <a key={item.key} href={item.href} className={`group relative rounded-2xl border border-white/10 bg-black/10 p-3 text-left transition hover:-translate-y-0.5 hover:bg-white/[0.055] ${diasporaTheme.focus}`}>
              {content}
              <ArrowRight className="absolute right-2.5 top-2.5 h-3 w-3 text-white/15 transition group-hover:text-white/50" />
            </a>
          );
        })}
      </div>
    </section>
  );
}
