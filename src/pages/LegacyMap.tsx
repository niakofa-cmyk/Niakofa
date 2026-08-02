import { useState, useEffect } from "react";
import {
  ChevronLeft, MapPin, CheckCircle2, Lock, Loader2,
  Map as MapIcon, Navigation, Star,
} from "lucide-react";
import { useRoute } from "@/lib/router";
import { getPlaces, discoverPlace, type LegacyPlace } from "@/lib/api";

const PLACE_ICONS: Record<string, string> = {
  home: "🏠", church: "⛪", school: "🎓", market: "🏪", cemetery: "⚰",
  workplace: "🏢", landmark: "📍",
};

export default function LegacyMap() {
  const [, navigate] = useRoute();
  const [places, setPlaces] = useState<LegacyPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlace, setSelectedPlace] = useState<LegacyPlace | null>(null);

  useEffect(() => {
    (async () => {
      const pl = await getPlaces();
      setPlaces(pl);
      setLoading(false);
    })();
  }, []);

  const handleDiscover = async (place: LegacyPlace) => {
    await discoverPlace(place.id);
    setPlaces((prev: LegacyPlace[]) => prev.map(p => p.id === place.id ? { ...p, is_discovered: true, discovered_at: new Date().toISOString() } : p));
    setSelectedPlace((prev: LegacyPlace | null) => prev && prev.id === place.id ? { ...prev, is_discovered: true, discovered_at: new Date().toISOString() } : prev);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen" style={{ background: "#1A0F08" }}>
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  const discovered = places.filter(p => p.is_discovered);
  const undiscovered = places.filter(p => !p.is_discovered);

  return (
    <div className="min-h-screen pb-20" style={{ background: "#1A0F08" }}>
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
        style={{ background: "linear-gradient(to bottom, #0A0604 0%, #1A0F08 100%)", borderBottom: "1px solid rgba(180,120,40,0.15)" }}>
        <button onClick={() => navigate("legacy")} className="text-amber-500 active:opacity-70"><ChevronLeft className="w-5 h-5" /></button>
        <div className="flex-1">
          <h1 className="text-sm font-black text-amber-100 uppercase tracking-widest">Family World Map</h1>
          <p className="text-xs text-amber-700">{discovered.length} discovered · {undiscovered.length} to explore</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5">
        {/* Migration timeline */}
        <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg mb-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center">
              <MapIcon className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-100">Your Family's Journey</p>
              <p className="text-xs text-amber-600">Follow the migration path of your ancestors</p>
            </div>
          </div>

          <div className="relative pl-6">
            <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-gradient-to-b from-amber-500/40 via-amber-700/30 to-amber-900/20" />
            {places.map((p, i) => (
              <button key={p.id} onClick={() => setSelectedPlace(p)}
                className="relative flex items-start gap-3 pb-5 w-full text-left active:opacity-70">
                {/* Timeline dot */}
                <div className={`absolute -left-[18px] w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                  p.is_discovered ? "bg-emerald-500 border-emerald-300" : p.lat !== null ? "bg-amber-500 border-amber-300" : "bg-amber-900 border-amber-700"
                }`}>
                  {p.is_discovered && <CheckCircle2 className="w-2.5 h-2.5 text-emerald-100" />}
                </div>

                {/* Place card */}
                <div className={`flex-1 rounded-xl p-3 border transition-all ${
                  selectedPlace?.id === p.id ? "bg-amber-500/10 border-amber-500/40 ring-2 ring-amber-500" :
                  p.is_discovered ? "bg-[#3A2A1A] border-amber-700/30" : "bg-[#2A1A0F] border-amber-900/30"
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{PLACE_ICONS[p.place_type ?? "landmark"] ?? "📍"}</span>
                    <p className="text-sm font-bold text-amber-200 flex-1 truncate">{p.label}</p>
                    {p.year && <span className="text-xs text-amber-500 font-bold flex-shrink-0">{p.year}</span>}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-amber-700">
                    {p.country && <span>{p.country}</span>}
                    {p.region && <span>· {p.region}</span>}
                    {p.is_discovered && <span className="text-emerald-400 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" /> Visited</span>}
                    {!p.is_discovered && p.lat !== null && <span className="text-amber-500 flex items-center gap-0.5"><Navigation className="w-3 h-3" /> Has GPS</span>}
                  </div>
                  {p.chapter_numbers.length > 0 && (
                    <p className="text-xs text-amber-800 mt-1">Appears in Chapter {p.chapter_numbers.join(", ")}</p>
                  )}
                  {p.notes && <p className="text-xs text-amber-600 mt-1 italic">{p.notes}</p>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Selected place detail */}
        {selectedPlace && (
          <div className="bg-[#2A1A0F] border border-amber-700/30 rounded-2xl p-4 shadow-lg mb-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">{PLACE_ICONS[selectedPlace.place_type ?? "landmark"] ?? "📍"}</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-100">{selectedPlace.label}</p>
                <p className="text-xs text-amber-600">{selectedPlace.country ?? "Unknown"} {selectedPlace.region ? `· ${selectedPlace.region}` : ""}</p>
              </div>
            </div>
            {selectedPlace.notes && <p className="text-xs text-amber-200/80 leading-relaxed mb-3">{selectedPlace.notes}</p>}
            {selectedPlace.lat !== null && selectedPlace.lng !== null && (
              <p className="text-xs text-amber-700 mb-3">GPS: {selectedPlace.lat.toFixed(4)}, {selectedPlace.lng.toFixed(4)}</p>
            )}
            {!selectedPlace.is_discovered ? (
              <button onClick={() => handleDiscover(selectedPlace)}
                className="w-full bg-teal-500/15 border border-teal-600/30 text-teal-300 font-bold text-xs uppercase tracking-wide py-3 rounded-xl active:opacity-70 flex items-center justify-center gap-2">
                <MapPin className="w-4 h-4" /> Check In Here
              </button>
            ) : (
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <p className="text-xs font-bold">You've discovered this place!</p>
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-xl p-3 text-center">
            <p className="text-lg font-black text-amber-400">{places.length}</p>
            <p className="text-xs text-amber-700">Total Places</p>
          </div>
          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-xl p-3 text-center">
            <p className="text-lg font-black text-emerald-400">{discovered.length}</p>
            <p className="text-xs text-amber-700">Discovered</p>
          </div>
          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-xl p-3 text-center">
            <p className="text-lg font-black text-teal-400">{places.filter(p => p.lat !== null).length}</p>
            <p className="text-xs text-amber-700">On Map</p>
          </div>
        </div>
      </div>
    </div>
  );
}
