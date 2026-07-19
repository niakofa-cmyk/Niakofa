/**
 * CivicTaskNav — turn-by-turn navigation page for a claimed civic need.
 * Opened when a helper taps "Navigate" on a civic need they have claimed.
 *
 * URL: /civic-task-nav/:needId
 *
 * Flow:
 * 1. Fetch the civic need (title, lat, lng) from GET /api/civic/needs/:id
 * 2. Acquire GPS position via navigator.geolocation
 * 3. Request a route from GET /api/navigation/route
 * 4. Mount NavigationOverlay — handles all turn-by-turn logic
 * 5. On arrival, show a celebration banner and offer to mark complete
 */
import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, MapPin, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { NavigationOverlay } from "@/components/NavigationOverlay";
import { authHeaders } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";

// ── Types ──────────────────────────────────────────────────────────────────────

interface CivicNeed {
  id: number;
  title: string;
  description: string | null;
  category: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  status: string;
  sponsor_entity_name: string;
}

interface RouteStep {
  instruction: string;
  distance_meters: number;
  duration_seconds: number;
  maneuver_type: string | null;
  maneuver_direction: string | null;
}

interface RouteData {
  geometry: { coordinates: number[][] };
  steps: RouteStep[];
  distance_meters: number;
  duration_seconds: number;
  eta_text: string;
  distance_text: string;
  profile: string;
}

type PageState = "loading" | "gps" | "routing" | "navigating" | "arrived" | "error";

// ── Component ─────────────────────────────────────────────────────────────────

export default function CivicTaskNav() {
  const { needId } = useParams<{ needId: string }>();
  const [, setLocation] = useLocation();

  const [pageState, setPageState] = useState<PageState>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [need, setNeed] = useState<CivicNeed | null>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [route, setRoute] = useState<RouteData | null>(null);
  const [distanceM, setDistanceM] = useState<number | null>(null);

  // ── Step 1: Fetch civic need ───────────────────────────────────────────────
  useEffect(() => {
    if (!needId) { setErrorMsg("No need ID provided"); setPageState("error"); return; }
    const id = parseInt(needId, 10);
    if (isNaN(id)) { setErrorMsg("Invalid need ID"); setPageState("error"); return; }

    fetch(`/api/civic/needs/${id}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: CivicNeed) => {
        if (!data.lat || !data.lng) {
          setErrorMsg("This civic need doesn't have GPS coordinates yet. Contact your sponsor to add a location.");
          setPageState("error");
          return;
        }
        setNeed(data);
        setPageState("gps");
      })
      .catch(err => {
        setErrorMsg(`Failed to load civic need: ${err.message}`);
        setPageState("error");
      });
  }, [needId]);

  // ── Step 2: Get GPS position ───────────────────────────────────────────────
  useEffect(() => {
    if (pageState !== "gps") return;
    if (!navigator.geolocation) {
      setErrorMsg("GPS is not available in this browser.");
      setPageState("error");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setPageState("routing");
      },
      err => {
        setErrorMsg(`Location access denied: ${err.message}. Please enable GPS and try again.`);
        setPageState("error");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, [pageState]);

  // ── Step 3: Fetch route ────────────────────────────────────────────────────
  useEffect(() => {
    if (pageState !== "routing" || !userPos || !need?.lat || !need?.lng) return;

    const params = new URLSearchParams({
      from_lat: String(userPos.lat),
      from_lng: String(userPos.lng),
      to_lat: String(need.lat),
      to_lng: String(need.lng),
    });

    fetch(`/api/navigation/route?${params}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: RouteData & { arrived?: boolean }) => {
        if (data.arrived) {
          // Already at destination
          setPageState("arrived");
          return;
        }
        setRoute(data);
        setPageState("navigating");
      })
      .catch(err => {
        setErrorMsg(`Could not calculate route: ${err.message}`);
        setPageState("error");
      });
  }, [pageState, userPos, need]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleArrived = useCallback(() => {
    setPageState("arrived");
  }, []);

  const handleClose = useCallback(() => {
    setLocation("/community");
  }, [setLocation]);

  const handleMarkComplete = useCallback(async () => {
    if (!need) return;
    try {
      const res = await fetch(`/api/civic/needs/${need.id}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast({ title: "✅ Civic task marked complete!", description: "Great work serving your community." });
      setLocation("/community");
    } catch {
      toast({ title: "Could not mark complete", description: "Try again from the community page.", variant: "destructive" });
    }
  }, [need, setLocation]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe pb-3 pt-4 border-b border-border bg-card z-10">
        <button
          onClick={handleClose}
          className="w-9 h-9 rounded-full bg-muted flex items-center justify-center active:scale-95 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-black text-sm truncate">{need?.title ?? "Civic Task Navigation"}</div>
          {need?.sponsor_entity_name && (
            <div className="text-[10px] text-muted-foreground truncate">{need.sponsor_entity_name}</div>
          )}
        </div>
        {need?.address && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground max-w-[120px] truncate">
            <MapPin className="w-3 h-3 shrink-0" />
            {need.address}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">

          {/* Loading / GPS / Routing */}
          {(pageState === "loading" || pageState === "gps" || pageState === "routing") && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-muted-foreground"
            >
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm font-medium">
                {pageState === "loading" && "Loading civic task…"}
                {pageState === "gps"     && "Getting your location…"}
                {pageState === "routing" && "Calculating route…"}
              </p>
            </motion.div>
          )}

          {/* Error */}
          {pageState === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center"
            >
              <AlertCircle className="w-12 h-12 text-destructive" />
              <p className="text-sm text-muted-foreground max-w-xs">{errorMsg}</p>
              <button
                onClick={handleClose}
                className="px-6 py-3 rounded-xl bg-muted text-sm font-bold active:scale-95 transition-all"
              >
                Go Back
              </button>
            </motion.div>
          )}

          {/* Arrived */}
          {pageState === "arrived" && (
            <motion.div
              key="arrived"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-6 text-center"
            >
              <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-400" />
              </div>
              <div>
                <div className="font-black text-xl mb-1">You've Arrived!</div>
                <div className="text-sm text-muted-foreground max-w-xs">
                  You're at the civic task location. Complete the task and mark it done when finished.
                </div>
              </div>
              {distanceM !== null && (
                <div className="text-xs text-muted-foreground">
                  {Math.round(distanceM)}m from destination
                </div>
              )}
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <button
                  onClick={handleMarkComplete}
                  className="w-full py-4 rounded-2xl bg-green-500 text-white font-black text-base active:scale-[0.98] transition-all"
                >
                  Mark Task Complete
                </button>
                <button
                  onClick={handleClose}
                  className="w-full py-3 rounded-2xl border border-border text-sm font-bold text-muted-foreground active:scale-[0.98] transition-all"
                >
                  Go Back
                </button>
              </div>
            </motion.div>
          )}

          {/* Navigating */}
          {pageState === "navigating" && route && need?.lat && need?.lng && (
            <motion.div
              key="navigating"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="absolute inset-0"
            >
              <NavigationOverlay
                route={route}
                destination={{ lat: need.lat, lng: need.lng, name: need.title }}
                onClose={handleClose}
                onArrived={handleArrived}
                onDistanceUpdate={setDistanceM}
                speakEnabled
              />
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
