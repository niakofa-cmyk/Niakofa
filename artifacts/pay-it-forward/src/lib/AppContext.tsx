import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useLocation } from "wouter";
import type { User } from "@workspace/api-client-react";
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
  /** City name from onboarding, profile, or IP fallback (e.g. "Atlanta, GA") */
  userCity: string | null;
  /** Full resolved place: city, county, state — auto-populated from GPS reverse geocode */
  userPlace: UserPlace;
}

/** Resolved place info from reverse geocoding — City, County, State */
interface UserPlace {
  city: string | null;
  county: string | null;
  state: string | null;
  /** Formatted short label, e.g. "Fort Worth, TX" */
  label: string | null;
  /** Source that resolved this: "gps" | "ip" */
  source: "gps" | "ip" | null;
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

const LAST_PLACE_KEY = "niakofa_last_place";

function loadLastPlace(): UserPlace {
  try {
    const stored = localStorage.getItem(LAST_PLACE_KEY);
    if (stored) return JSON.parse(stored) as UserPlace;
  } catch {}
  return { city: null, county: null, state: null, label: null, source: null };
}

const STATE_ABBR: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR",
  California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE",
  Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID",
  Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS",
  Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK",
  Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT",
  Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV",
  Wisconsin: "WI", Wyoming: "WY", "District of Columbia": "DC",
};
function stateNameToAbbr(name: string): string | null { return STATE_ABBR[name] ?? null; }

async function reverseGeocode(lat: number, lng: number): Promise<UserPlace | null> {
  const token = (import.meta as { env?: { VITE_MAPBOX_TOKEN?: string } }).env?.VITE_MAPBOX_TOKEN;
  if (!token) return null;
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place,district,region&access_token=${token}&language=en`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as {
      features: Array<{ place_type: string[]; text: string; context?: Array<{ id: string; text: string }> }>;
    };
    let city: string | null = null;
    let county: string | null = null;
    let state: string | null = null;
    for (const feature of data.features) {
      if (feature.place_type.includes("place") && !city) {
        city = feature.text;
        for (const ctx of feature.context ?? []) {
          if (ctx.id.startsWith("district.") && !county) county = ctx.text;
          if (ctx.id.startsWith("region.") && !state) state = ctx.text;
        }
      }
      if (feature.place_type.includes("district") && !county) {
        county = feature.text;
        for (const ctx of feature.context ?? []) {
          if (ctx.id.startsWith("region.") && !state) state = ctx.text;
        }
      }
      if (feature.place_type.includes("region") && !state) state = feature.text;
    }
    if (!city && !county && !state) return null;
    const stateAbbr = state ? stateNameToAbbr(state) : null;
    const labelCity = city ?? county ?? "";
    const label = labelCity
      ? (stateAbbr ? `${labelCity}, ${stateAbbr}` : `${labelCity}, ${state ?? ""}`)
      : null;
    return { city, county, state, label, source: "gps" };
  } catch { return null; }
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
  // City from onboarding, profile, or IP fallback — shared so Nia has context
  const [userCity, setUserCity] = useState<string | null>(() => {
    try { return localStorage.getItem("niakofa_user_city"); } catch { return null; }
  });
  // Full place: City, County, State — resolved via GPS reverse geocoding or IP fallback
  const [userPlace, setUserPlace] = useState<UserPlace>(loadLastPlace);
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
  // Tracks the last lat/lng sent to reverse geocoder — prevents hammering on tiny moves
  const lastGeocodedLocRef = useRef<{ lat: number; lng: number } | null>(null);

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

  // Redirect to login if no user — except already on /login or /admin (admin has its own auth)
  useEffect(() => {
    if (!currentUser && location !== "/login" && location !== "/admin") {
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

        // Reverse geocode → City, County, State (throttled: only re-geocode after >800m move)
        const lastGeo = lastGeocodedLocRef.current;
        const movedFarEnough = !lastGeo
          || Math.abs(smoothed.lat - lastGeo.lat) > 0.007
          || Math.abs(smoothed.lng - lastGeo.lng) > 0.01;
        if (movedFarEnough) {
          lastGeocodedLocRef.current = { lat: smoothed.lat, lng: smoothed.lng };
          reverseGeocode(smoothed.lat, smoothed.lng).then((place) => {
            if (!place) return;
            setUserPlace(place);
            const label = place.label ?? place.city ?? place.county ?? "";
            if (label) {
              setUserCity(label);
              try { localStorage.setItem("niakofa_user_city", label); } catch {}
            }
            try { localStorage.setItem(LAST_PLACE_KEY, JSON.stringify(place)); } catch {}
            (window as unknown as { __niakofaRegion?: string }).__niakofaRegion = label || undefined;
          });
        }
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
              const ipData = await ipRes.json() as { latitude?: number; longitude?: number; city?: string; region_code?: string; region?: string };
              if (ipData.latitude && ipData.longitude) {
                const fallbackLoc: Location = { lat: ipData.latitude, lng: ipData.longitude };
                locationRef.current = fallbackLoc;
                setMyLocation(fallbackLoc);
                // Capture city/state from IP fallback — populate UserPlace for Nia context
                if (ipData.city) {
                  const stateAbbr = ipData.region_code ?? null;
                  const ipCity = stateAbbr ? `${ipData.city}, ${stateAbbr}` : ipData.city;
                  const ipPlace: UserPlace = {
                    city: ipData.city,
                    county: null,
                    state: ipData.region ?? stateAbbr,
                    label: ipCity,
                    source: "ip",
                  };
                  setUserPlace(ipPlace);
                  setUserCity(ipCity);
                  try {
                    localStorage.setItem("niakofa_user_city", ipCity);
                    localStorage.setItem(LAST_PLACE_KEY, JSON.stringify(ipPlace));
                  } catch {}
                  (window as unknown as { __niakofaRegion?: string }).__niakofaRegion = ipCity;
                  // Refine with Mapbox if possible (IP coords → proper city/county/state)
                  reverseGeocode(ipData.latitude, ipData.longitude).then((place) => {
                    if (!place) return;
                    setUserPlace(place);
                    const label = place.label ?? ipCity;
                    setUserCity(label);
                    try {
                      localStorage.setItem("niakofa_user_city", label);
                      localStorage.setItem(LAST_PLACE_KEY, JSON.stringify(place));
                    } catch {}
                    (window as unknown as { __niakofaRegion?: string }).__niakofaRegion = label;
                  });
                }
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
      // Include GPS-resolved city in the broadcast so the DB stays current
      const cityLabel = userPlace.city ?? userPlace.county ?? null;
      updateLocation.mutate(
        {
          id: currentUser.id,
          data: {
            lat: loc.lat,
            lng: loc.lng,
            heading: loc.heading ?? null,
            speed: loc.speed ?? null,
            ...(cityLabel ? ({ city: cityLabel } as any) : {}),
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
      userCity,
      userPlace,
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
