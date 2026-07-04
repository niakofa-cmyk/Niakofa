import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useLocation } from "wouter";
import type { User } from "@workspace/api-client-react";
import { useUpdateUserLocation, useUpdateHelperMode } from "@workspace/api-client-react";
import { useWebSocket } from "./useWebSocket";
import { wsStart, wsRegister, wsUnregister } from "./wsClient";
import { GratitudeModal } from "../components/GratitudeModal";
import { clearToken, getToken } from "./auth";
import { getIpLocation } from "./locale-utils";

interface Location {
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
}

interface UserPlace {
  city: string | null;
  county: string | null;
  state: string | null;
  label?: string | null;
}

interface AppContextType {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  helperModeActive: boolean;
  setHelperModeActive: (active: boolean) => void;
  myLocation: Location | null;
  activeRequestId: number | null;
  setActiveRequestId: (id: number | null) => void;
  userPlace: UserPlace | null;
  setUserPlace: (place: UserPlace | null) => void;
  logout: () => void;
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
  // ── All useState calls first ─────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem("niakofa_user");
      if (stored) return JSON.parse(stored) as User;
    } catch {}
    return null;
  });

  const [location, setLocation] = useLocation();

  const [helperModeActive, setHelperModeActiveState] = useState(false);
  // Start null — GPS or IP fallback populates this once the useEffect below runs.
  // Never hardcode a US default: a user in Lagos or London must not have their
  // location silently pinned to Fort Worth when GPS is unavailable.
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
  const [userPlace, setUserPlace] = useState<UserPlace | null>(null);

  // ── All useRef calls ─────────────────────────────────────────────────────
  const locationRef = useRef<Location | null>(null);
  const prevBroadcastRef = useRef<Location | null>(null);
  const prevLocationRef = useRef<Location | null>(null);
  const smoothedRef = useRef<{ lat: number; lng: number } | null>(null);

  // ── Custom hooks ─────────────────────────────────────────────────────────
  const updateLocation = useUpdateUserLocation();
  const updateHelperMode = useUpdateHelperMode();

  // ── Non-hook helper ──────────────────────────────────────────────────────
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

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = () => {
    clearToken();
    try { localStorage.removeItem("niakofa_user"); } catch {}
    setCurrentUser(null);
    setActiveRequestId(null);
    wsUnregister();
    setLocation("/login");
  };

  // ── useWebSocket subscriptions ────────────────────────────────────────────
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

  // Redirect to login if no user.
  // Excluded paths that handle their own auth or are public:
  //   /login   — already on the login page
  //   /admin   — AdminScreen has its own auth gate (shield + secret / is_admin check);
  //              sending it to /login first breaks that flow entirely
  //   /status  — public unauthenticated status page
  const NO_REDIRECT_PATHS = ["/login", "/admin", "/admin/analytics", "/status"];
  useEffect(() => {
    if (!currentUser && !NO_REDIRECT_PATHS.some(p => location === p || location.startsWith(p + "/"))) {
      setLocation("/login");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, location, setLocation]);

  // GPS watchPosition — high-accuracy continuous stream.
  // Falls back to IP geolocation (ipapi.co, 24h cache) when:
  //   • The browser has no GPS hardware at all
  //   • The user denies the permission prompt
  //   • watchPosition fires any error and we have no location yet
  // This ensures a user in Lagos, Nairobi, or London isn't silently placed at
  // Fort Worth when GPS is unavailable.
  useEffect(() => {
    // Shared IP fallback — called on any path that lacks a GPS fix
    const tryIpFallback = () => {
      if (locationRef.current) return; // GPS already gave us a fix — skip
      getIpLocation().then(loc => {
        if (!loc || locationRef.current) return; // double-check after async
        const ipLoc: Location = { lat: loc.lat, lng: loc.lng };
        locationRef.current = ipLoc;
        setMyLocation(ipLoc);
      });
    };

    if (!navigator.geolocation) {
      tryIpFallback(); // no GPS hardware — fall back immediately
      return;
    }

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
      },
      (_err) => {
        // Any GPS error (PERMISSION_DENIED, TIMEOUT, POSITION_UNAVAILABLE) →
        // fall back to IP if we haven't gotten a fix yet.
        tryIpFallback();
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 1000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

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

  // Startup token validation — runs once on mount.
  // Without this, a user whose JWT has expired appears "logged in" (the stored
  // niakofa_user is still in localStorage) but every API call returns 401,
  // creating a confusing stuck state where the app renders their profile but
  // nothing works. This effect validates the stored token against the server
  // and either refreshes stale user data or cleanly redirects to login.
  //
  // Race-safety: we capture the userId and token at the start of the effect, then
  // confirm they still match what's in localStorage *before* applying the server
  // response. If the user logs out (or logs in as a different account) before the
  // fetch resolves, `active` is false and we discard the stale response entirely.
  //
  // MUST be declared LAST so it never affects the hook order above.
  useEffect(() => {
    let active = true; // flipped to false in the cleanup to cancel late responses

    const token = getToken();
    let storedId: number | null = null;
    try {
      const j = localStorage.getItem("niakofa_user");
      storedId = j ? ((JSON.parse(j) as { id?: number }).id ?? null) : null;
    } catch { storedId = null; }
    if (!token || !storedId) return;

    const capturedId = storedId; // stable reference for the async callback

    fetch(`/api/users/${capturedId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => {
        if (!active) return; // component unmounted or auth changed — discard

        // Verify the session hasn't changed while the request was in-flight.
        // (User logged out → localStorage cleared; or logged in as someone else.)
        let currentStoredId: number | null = null;
        try {
          const j2 = localStorage.getItem("niakofa_user");
          currentStoredId = j2 ? ((JSON.parse(j2) as { id?: number }).id ?? null) : null;
        } catch {}
        if (currentStoredId !== capturedId) return; // stale — a different session is now active

        if (r.status === 401 || r.status === 403) {
          // Token expired or revoked — wipe stored session and show a clear message
          clearToken();
          try { localStorage.removeItem("niakofa_user"); } catch {}
          setCurrentUser(null);
          sessionStorage.setItem("niakofa_session_expired", "1");
          return;
        }
        if (r.ok) {
          // Refresh with latest server data so the app always reflects current
          // approval_status, helper_status, is_admin, trust_score, etc.
          const fresh = await r.json() as User;
          if (!active) return; // raced between r.ok check and json() parsing
          try { localStorage.setItem("niakofa_user", JSON.stringify(fresh)); } catch {}
          setCurrentUser(fresh);
        }
      })
      .catch(() => {
        // Network failure — keep the stored user. They'll see API errors inline.
        // Never wipe a valid session just because the device is temporarily offline.
      });

    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppContext.Provider value={{
      currentUser,
      setCurrentUser,
      helperModeActive,
      setHelperModeActive,
      myLocation,
      activeRequestId,
      setActiveRequestId,
      userPlace,
      setUserPlace,
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
