import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import type { User } from "@workspace/api-client-react";
import { useUpdateUserLocation, useUpdateHelperMode } from "@workspace/api-client-react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { useWebSocket } from "./useWebSocket";
import { GratitudeModal } from "../components/GratitudeModal";

// ── Auth token persistence ──────────────────────────────────────────────────
// Token is stored in localStorage under "niakofa_auth_token".
// The api-client-react customFetch will call getStoredToken() before every
// protected API request and attach it as "Authorization: Bearer <token>".

export const AUTH_TOKEN_KEY = "niakofa_auth_token";
export const AUTH_USER_KEY = "niakofa_user";

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredAuth(user: User, token: string): void {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  } catch { /* storage unavailable */ }
}

export function clearStoredAuth(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
  } catch { /* storage unavailable */ }
}

function loadStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

// Register the token getter with the API client so all generated hooks
// automatically include the Bearer token on every request.
setAuthTokenGetter(getStoredToken);

// ── Types ───────────────────────────────────────────────────────────────────

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
  logout: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// ── Utility math ─────────────────────────────────────────────────────────────

function calcHeading(from: Location, to: Location): number {
  const dLng = (to.lng - from.lng) * (Math.PI / 180);
  const lat1 = from.lat * (Math.PI / 180);
  const lat2 = to.lat * (Math.PI / 180);
  const x = Math.sin(dLng) * Math.cos(lat2);
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

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

function emaSmooth(prev: number, next: number, alpha = 0.3): number {
  return alpha * next + (1 - alpha) * prev;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  // Bootstrap from localStorage — null means not logged in yet (shows <LoginPage>)
  const [currentUser, setCurrentUserState] = useState<User | null>(loadStoredUser);
  const [helperModeActive, setHelperModeActiveState] = useState(false);
  const [myLocation, setMyLocation] = useState<Location | null>(null);
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

  const locationRef = useRef<Location | null>(null);
  const prevBroadcastRef = useRef<Location | null>(null);
  const prevLocationRef = useRef<Location | null>(null);
  const smoothedRef = useRef<{ lat: number; lng: number } | null>(null);

  const updateLocation = useUpdateUserLocation();
  const updateHelperMode = useUpdateHelperMode();

  const setCurrentUser = (user: User | null) => {
    setCurrentUserState(user);
    if (!user) clearStoredAuth();
  };

  const logout = () => {
    clearStoredAuth();
    setCurrentUserState(null);
    setHelperModeActiveState(false);
  };

  const setHelperModeActive = (active: boolean) => {
    setHelperModeActiveState(active);
    setCurrentUserState(u => u ? { ...u, helper_mode_active: active } : u);
    if (currentUser) {
      updateHelperMode.mutate(
        { id: currentUser.id, data: { active } },
        { onError: () => {} }
      );
    }
  };

  // Keep localStorage user data fresh when setCurrentUser is called externally
  useEffect(() => {
    if (currentUser) {
      try {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(currentUser));
      } catch { /* storage unavailable */ }
    }
  }, [currentUser]);

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

  // GPS watchPosition — only when logged in
  useEffect(() => {
    if (!currentUser || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const raw: Location = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          accuracy: pos.coords.accuracy,
        };

        let heading = raw.heading;
        if ((heading == null || isNaN(heading)) && prevLocationRef.current) {
          const d = distanceMeters(prevLocationRef.current, raw);
          if (d > 3) {
            heading = calcHeading(prevLocationRef.current, raw);
          } else {
            heading = prevLocationRef.current.heading ?? null;
          }
        }

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
      },
      () => {},
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 1000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [currentUser?.id]); // re-subscribe on login/logout

  // Smart GPS broadcast loop
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
      logout,
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
