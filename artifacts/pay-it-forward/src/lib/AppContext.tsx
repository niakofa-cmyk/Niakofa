import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useLocation } from "wouter";
import type { User } from "@workspace/api-client-react";
import { useUpdateUserLocation, useUpdateHelperMode } from "@workspace/api-client-react";
import { useWebSocket } from "./useWebSocket";
import { GratitudeModal } from "../components/GratitudeModal";

interface Location {
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
}

interface AppContextType {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem("niakofa_user");
      if (stored) return JSON.parse(stored) as User;
    } catch {}
    return null;
  });

  const [location, setLocation] = useLocation();

  // Redirect to login if no user — except already on /login
  useEffect(() => {
    if (!currentUser && location !== "/login") {
      setLocation("/login");
    }
  }, [currentUser, location, setLocation]);

  const [helperModeActive, setHelperModeActiveState] = useState(false);
  const [myLocation, setMyLocation] = useState<Location | null>({ lat: 32.75, lng: -97.33 });
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

  // Refs for GPS broadcasting (avoids stale closures)
  const locationRef = useRef<Location | null>({ lat: 32.75, lng: -97.33 });
  const prevBroadcastRef = useRef<Location | null>(null);
  const prevLocationRef = useRef<Location | null>(null);
  const smoothedRef = useRef<{ lat: number; lng: number } | null>(null);

  const updateLocation = useUpdateUserLocation();
  const updateHelperMode = useUpdateHelperMode();

  const setHelperModeActive = (active: boolean) => {
    setHelperModeActiveState(active);
    setCurrentUser(u => u ? { ...u, helper_mode_active: active } : u);
    if (currentUser) {
      updateHelperMode.mutate(
        { id: currentUser.id, data: { active } },
        { onError: () => {} }
      );
    }
  };

  // Show gratitude prompt when the current user's request is completed
  // Fixed: useWebSocket now supports (eventType, handler) overload
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

  // GPS watchPosition — high-accuracy continuous stream
  useEffect(() => {
    if (!navigator.geolocation) return;

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
        // alpha = 0.4: responsive but smooth (lower = smoother, higher = more responsive)
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

        prevLocationRef.current = raw; // raw for heading calc
        locationRef.current = newLoc;
        setMyLocation(newLoc);
      },
      () => {},
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 1000, // accept positions up to 1s old
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Smart GPS broadcast loop:
  // - 2s when actively navigating (activeRequestId set)
  // - 15s when helper mode on (per spec requirement for live map dots)
  // - 30s otherwise (battery conservation)
  // - Skip broadcast if position hasn't moved enough (threshold-gated)
  useEffect(() => {
    if (!currentUser) return;

    const interval = activeRequestId ? 2000 : helperModeActive ? 15000 : 30000;
    const MOVEMENT_THRESHOLD_M = activeRequestId ? 2 : helperModeActive ? 3 : 10;

    const id = setInterval(() => {
      const loc = locationRef.current;
      if (!loc) return;

      const prev = prevBroadcastRef.current;
      const movedEnough = !prev || distanceMeters(prev, loc) >= MOVEMENT_THRESHOLD_M;
      if (!movedEnough) return;

      prevBroadcastRef.current = loc;
      updateLocation.mutate({
        id: currentUser.id,
        data: {
          lat: loc.lat,
          lng: loc.lng,
          heading: loc.heading ?? null,
          speed: loc.speed ?? null,
        },
      });
    }, interval);

    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, helperModeActive, activeRequestId]);

  return (
    <AppContext.Provider value={{
      currentUser,
      setCurrentUser,
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
