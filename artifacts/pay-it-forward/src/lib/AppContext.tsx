import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useLocation } from "wouter";
import type { User as GeneratedUser } from "@workspace/api-client-react";

/**
 * Extends the generated User type with fields that exist in the database
 * and API responses but aren't part of the OpenAPI spec yet (same pattern
 * as how `password` is handled — kept out of codegen to avoid spec churn).
 */
export type User = GeneratedUser & {
  approval_status?: "pending" | "approved" | "denied";
  account_type?: "individual" | "business" | "sponsor";
  organization_name?: string | null;
  organization_description?: string | null;
};
import { useUpdateUserLocation, useUpdateHelperMode } from "@workspace/api-client-react";
import { useWebSocket } from "./useWebSocket";
import { wsStart, wsRegister, wsUnregister } from "./wsClient";
import { GratitudeModal } from "../components/GratitudeModal";
import { clearToken } from "./auth";

interface Location {
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
}

const LAST_LOCATION_KEY = "niakofa_last_location";

interface AppContextType {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  logout: () => void;
  helperModeActive: boolean;
  setHelperModeActive: (active: boolean) => void;
  myLocation: Location | null;
  activeRequestId: number | null;
  setActiveRequestId: (id: number | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Calculate heading between two lat/lng positions (degrees, 0=North)
function calcHeading(from: Location, to: Location): number {
  const dLng = (to.lng - from.lng) * (Math.PI / 180);
  const lat1 = from.lat * (Math.PI / 180);
  const lat2 = to.lat * (Math.PI / 180);
  const x = Math.sin(dLng) * Math.cos(lat2);
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

// Haversine distance in meters
function distanceMeters(a: Location, b: Location): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const aa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

// Exponential moving average — smooths GPS jitter
function emaSmooth(prev: number, next: number, alpha = 0.3): number {
  return alpha * next + (1 - alpha) * prev;
}

// Load last-known location from localStorage (avoids hardcoded default)
function loadLastLocation(): Location | null {
  try {
    const stored = localStorage.getItem(LAST_LOCATION_KEY);
    if (stored) return JSON.parse(stored) as Location;
  } catch {}
  return null;
}

export function AppProvider({ children }: { children: ReactNode }) {
  // ── All useState calls first ─────────────────────────────────────────────
  const [currentUser, setCurrentUserState] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem("niakofa_user");
      if (stored) return JSON.parse(stored) as User;
    } catch {}
    return null;
  });

  const [location, setLocation] = useLocation();

  const [helperModeActive, setHelperModeActiveState] = useState(false);
  // Use last-known location from localStorage; fall back to null (not a hardcoded city)
  const [myLocation, setMyLocation] = useState<Location | null>(loadLastLocation);
  const [gratitudePrompt, setGratitudePrompt] = useState<{
    requestId: number;
    requestTitle: string;
    helperName: string;
    helperId?: number;
    authorId: number;
    authorName: string;
    authorAvatar?: string;
  } | null>(null);
  const [activeRequestId, setActiveRequestId] = useState<number | null>(null);

  // ── All useRef calls ─────────────────────────────────────────────────────
  const locationRef = useRef<Location | null>(loadLastLocation());
  const prevBroadcastRef = useRef<Location | null>(null);
  const prevLocationRef = useRef<Location | null>(null);
  const smoothedRef = useRef<{ lat: number; lng: number } | null>(null);

  // ── Custom hooks ─────────────────────────────────────────────────────────
  const updateLocation = useUpdateUserLocation();
  const updateHelperMode = useUpdateHelperMode();

  // ── Centralized setCurrentUser — persists to localStorage ────────────────
  const setCurrentUser = (user: User | null) => {
    setCurrentUserState(user);
    if (user) {
      localStorage.setItem("niakofa_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("niakofa_user");
    }
  };

  // ── Centralized logout — clears all auth state ───────────────────────────
  const logout = () => {
    clearToken();
    localStorage.removeItem("niakofa_user");
    setCurrentUserState(null);
    wsUnregister();
    setLocation("/login");
  };

  // ── Non-hook helper ──────────────────────────────────────────────────────
  const setHelperModeActive = (active: boolean) => {
    setHelperModeActiveState(active);
    setCurrentUserState(u => {
      if (!u) return u;
      const updated = { ...u, helper_mode_active: active };
      localStorage.setItem("niakofa_user", JSON.stringify(updated));
      return updated;
    });
    if (currentUser) {
      updateHelperMode.mutate(
        { id: currentUser.id, data: { active } },
        { onError: () => {} }
      );
    }
  };

  // ── useWebSocket subscriptions ────────────────────────────────────────────

  // Listen for helper application approval/denial — update the current user in real-time
  useWebSocket("helper_application_approved", (event) => {
    const p = event.payload as { user_id: number; decision: string };
    if (currentUser && currentUser.id === p.user_id) {
      const updated = { ...currentUser, helper_status: "approved" as const, is_helper: true };
      setCurrentUser(updated);
      import("sonner").then(({ toast }) => {
        toast.success("🎉 You're approved as a helper!", {
          description: "Enable Helper Mode in your profile to start accepting requests.",
          duration: 8000,
        });
      }).catch(() => {});
    }
  });

  useWebSocket("helper_application_denied", (event) => {
    const p = event.payload as { user_id: number; decision: string };
    if (currentUser && currentUser.id === p.user_id) {
      const updated = { ...currentUser, helper_status: "denied" as const, is_helper: false };
      setCurrentUser(updated);
      import("sonner").then(({ toast }) => {
        toast.error("Helper application update", {
          description: "Your application was not approved. Check your email for details.",
          duration: 8000,
        });
      }).catch(() => {});
    }
  });

  // Show gratitude prompt when the current user's request is completed
  useWebSocket("new_gratitude_prompt", (event) => {
    const p = event.payload as {
      request_id: number;
      requester_id: number;
      request_title: string;
      helper_name: string | null;
      helper_id: number;
    };
    if (currentUser && currentUser.id === p.requester_id) {
      setGratitudePrompt({
        requestId: p.request_id,
        requestTitle: p.request_title,
        helperName: p.helper_name ?? "your helper",
        helperId: p.helper_id,
        authorId: currentUser.id,
        authorName: currentUser.name,
        authorAvatar: currentUser.avatar_url ?? undefined,
      });
    }
  });

  // ── All useEffect calls last ──────────────────────────────────────────────

  // Redirect to login if no user — except already on /login
  useEffect(() => {
    if (!currentUser && location !== "/login") {
      setLocation("/login");
    }
  }, [currentUser, location, setLocation]);

  // GPS watchPosition — high-accuracy continuous stream
  useEffect(() => {
    if (!navigator.geolocation) return;

    const gpsOpts: PositionOptions = {
      enableHighAccuracy: true,
      timeout: activeRequestId ? 7000 : 10000,
      maximumAge: activeRequestId ? 1000 : 5000,
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const raw: Location = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          accuracy: pos.coords.accuracy,
        };

        // Compute derived heading if device doesn't provide one
        let heading = raw.heading;
        if ((heading == null || isNaN(heading)) && prevLocationRef.current) {
          const d = distanceMeters(prevLocationRef.current, raw);
          if (d > 3) {
            heading = calcHeading(prevLocationRef.current, raw);
          } else {
            heading = prevLocationRef.current.heading ?? null;
          }
        }

        // Smooth lat/lng with EMA to reduce GPS jitter
        const alpha = 0.4;
        const smoothed = smoothedRef.current
          ? {
              lat: emaSmooth(smoothedRef.current.lat, raw.lat, alpha),
              lng: emaSmooth(smoothedRef.current.lng, raw.lng, alpha),
            }
          : { lat: raw.lat, lng: raw.lng };
        smoothedRef.current = smoothed;

        const newLoc: Location = {
          lat: smoothed.lat,
          lng: smoothed.lng,
          heading,
          speed: raw.speed,
          accuracy: raw.accuracy,
        };

        prevLocationRef.current = raw;
        locationRef.current = newLoc;
        setMyLocation(newLoc);

        // Persist last-known location so next session starts near here
        try {
          localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify({ lat: smoothed.lat, lng: smoothed.lng }));
        } catch {}
      },
      async (err) => {
        const msgs: Record<number, string> = {
          1: "Location access denied. Enable it in your browser settings to use navigation.",
          2: "Location unavailable. Move to an open area or check your device settings.",
          3: "Location request timed out. Check your GPS signal.",
        };
        const msg = msgs[err.code] ?? "Unable to determine your location.";
        const { toast: sonnerToast } = await import("sonner");
        sonnerToast.warning("GPS issue", { description: msg, id: "gps-error", duration: 8000 });

        // IP-based geolocation fallback (very coarse, ~city-level)
        if (err.code !== 1 && !locationRef.current) {
          try {
            const ipRes = await fetch("https://ipapi.co/json/");
            if (ipRes.ok) {
              const ipData = await ipRes.json() as { latitude?: number; longitude?: number };
              if (ipData.latitude && ipData.longitude) {
                const fallbackLoc: Location = { lat: ipData.latitude, lng: ipData.longitude };
                locationRef.current = fallbackLoc;
                setMyLocation(fallbackLoc);
                sonnerToast.info("Using approximate location", {
                  description: "GPS unavailable — using IP-based location. Accuracy is limited.",
                  id: "ip-fallback",
                  duration: 6000,
                });
              }
            }
          } catch {}
        }
      },
      gpsOpts
    );

    return () => navigator.geolocation.clearWatch(watchId);
  // Re-run when activeRequestId changes so GPS opts tighten/loosen accordingly
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRequestId]);

  // Smart GPS broadcast loop — adaptive intervals based on activity state
  useEffect(() => {
    if (!currentUser) return;

    // Adaptive polling: most aggressive during active request, light otherwise
    const interval = activeRequestId ? 2000 : helperModeActive ? 15000 : 30000;
    const MOVEMENT_THRESHOLD_M = activeRequestId ? 2 : helperModeActive ? 3 : 10;

    const id = setInterval(() => {
      const loc = locationRef.current;
      if (!loc) return;

      const prev = prevBroadcastRef.current;
      const movedEnough = !prev || distanceMeters(prev, loc) >= MOVEMENT_THRESHOLD_M;
      if (!movedEnough) return;

      // Speed-based stationary suppression: skip broadcast when helper is
      // stationary (speed < 0.5 m/s ≈ 1mph) and NOT in an active request.
      // This reduces battery drain during idle waits.
      if (!activeRequestId && loc.speed != null && loc.speed < 0.5) return;

      prevBroadcastRef.current = loc;
      updateLocation.mutate(
        {
          id: currentUser.id,
          data: {
            lat: loc.lat,
            lng: loc.lng,
            heading: loc.heading ?? null,
            speed: loc.speed ?? null,
          },
        },
        { onError: () => {} }
      );
    }, interval);

    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, helperModeActive, activeRequestId]);

  // Start the shared WS singleton and register/unregister as the user changes.
  // This effect is LAST so it never disturbs the hook order above.
  useEffect(() => {
    wsStart();
    if (currentUser) {
      wsRegister(currentUser.id);
    } else {
      wsUnregister();
    }
  }, [currentUser?.id]);

  return (
    <AppContext.Provider value={{
      currentUser,
      setCurrentUser,
      logout,
      helperModeActive,
      setHelperModeActive,
      myLocation,
      activeRequestId,
      setActiveRequestId,
    }}>
      {children}
      <GratitudeModal
        prompt={gratitudePrompt}
        onClose={() => setGratitudePrompt(null)}
      />
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within an AppProvider");
  return context;
}
