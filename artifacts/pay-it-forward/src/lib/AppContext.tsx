import type { ReactNode } from "react";
import { createContext, useContext, useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@workspace/api-client-react";
import { useUpdateUserLocation, useUpdateHelperMode } from "@workspace/api-client-react";
import { useWebSocket } from "./useWebSocket";
import { wsStart, wsRegister, wsUnregister, wsSubscribe, type WsEventType } from "./wsClient";
import { GratitudeModal } from "../components/GratitudeModal";
import { clearToken, getToken } from "./auth";
import { getIpLocation } from "./locale-utils";
import { toast } from "../hooks/use-toast";

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
  /** Nia kill-switch: null = loading, false = disabled, true = enabled.
   *  Single source of truth — polled every 60s + instant via WS.
   *  All components that render any part of Nia must read this value. */
  niaEnabled: boolean | null;
  /** Map screen only: BottomNav is collapsed to a small tap-to-open handle
   *  by default on "/" so its ~64-90px bar never overlaps MapControlsPanel's
   *  bottom-perched buttons. False everywhere else (nav always shown there).
   *  Lives here (not local BottomNav state) so map.tsx can recede its own
   *  floating controls while the nav is pulled open. */
  mapNavOpen: boolean;
  setMapNavOpen: (open: boolean) => void;
  /** Map-screen settings Drawer open state — set true from the Sankofa bird
   *  menu's "Map Settings" tab (BottomNav), consumed by MapControlsPanel to
   *  open its filter/layer Drawer without a dedicated left-corner button. */
  mapSettingsOpen: boolean;
  setMapSettingsOpen: (open: boolean) => void;
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
  const queryClient = useQueryClient();
  // ── All useState calls first ─────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem("niakofa_user");
      if (stored) return JSON.parse(stored) as User;
    } catch {}
    return null;
  });

  // ── Nia kill-switch — single source of truth ─────────────────────────────
  // null = still loading (fail-closed: nothing shows until first poll resolves)
  // false = admin disabled (dormant orb shown; no chat, no draw, no workers)
  // true = active (full Nia experience)
  const [niaEnabled, setNiaEnabled] = useState<boolean | null>(null);

  // Map-screen bottom nav collapse state — see mapNavOpen doc on the context
  // type above. Defaults closed; BottomNav itself decides whether this even
  // applies (only meaningful on "/").
  const [mapNavOpen, setMapNavOpen] = useState(false);
  const [mapSettingsOpen, setMapSettingsOpen] = useState(false);

  const [location, setLocation] = useLocation();

  // Persist helper mode across page refreshes — read from the stored user object.
  // The startup token validation will refresh this from the server on mount.
  const [helperModeActive, setHelperModeActiveState] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("niakofa_user");
      if (stored) {
        const u = JSON.parse(stored) as { helper_mode_active?: boolean };
        return !!u.helper_mode_active;
      }
    } catch {}
    return false;
  });

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
  // Persist active request across page refreshes (helper en-route should survive reload)
  const [activeRequestId, setActiveRequestIdState] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem("niakofa_active_request");
      return v ? parseInt(v, 10) || null : null;
    } catch { return null; }
  });
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
  // setHelperModeActive does an optimistic update so the UI responds instantly,
  // then rolls back to the previous server-confirmed state if the PATCH fails.
  // This closes the "helper mode disagreeing after refresh" bug: previously the
  // app updated localStorage immediately and silently swallowed the error, so
  // the device kept showing the wrong status until the next full page load.
  const setHelperModeActive = (active: boolean) => {
    // Capture previous state BEFORE any optimistic update so we can roll back.
    const prevActive = helperModeActive;
    const prevUser = currentUser ? { ...currentUser } : null;

    // Optimistic: update UI + localStorage immediately for responsiveness.
    setHelperModeActiveState(active);
    setCurrentUser(u => {
      const updated = u ? { ...u, helper_mode_active: active } : u;
      if (updated) {
        try { localStorage.setItem("niakofa_user", JSON.stringify(updated)); } catch {}
      }
      return updated;
    });

    if (currentUser) {
      updateHelperMode.mutate(
        { id: currentUser.id, data: { active } },
        {
          onSuccess: (fresh) => {
            // Sync from server truth so any server-side side-effects are reflected.
            if (fresh && typeof fresh.helper_mode_active === "boolean") {
              const serverActive = fresh.helper_mode_active;
              setHelperModeActiveState(serverActive);
              setCurrentUser(u => {
                const updated = u ? { ...u, helper_mode_active: serverActive } : u;
                if (updated) {
                  try { localStorage.setItem("niakofa_user", JSON.stringify(updated)); } catch {}
                }
                return updated;
              });
            }
          },
          onError: (err) => {
            // Roll back optimistic update to the last server-confirmed state.
            setHelperModeActiveState(prevActive);
            if (prevUser) {
              setCurrentUser(prevUser);
              try { localStorage.setItem("niakofa_user", JSON.stringify(prevUser)); } catch {}
            } else {
              setCurrentUser(u => {
                const rolled = u ? { ...u, helper_mode_active: prevActive } : u;
                if (rolled) {
                  try { localStorage.setItem("niakofa_user", JSON.stringify(rolled)); } catch {}
                }
                return rolled;
              });
            }
            // Bug fixed: this used to always show "Server rejected the
            // change. Your status has been restored." — a generic message
            // that reads like a connectivity problem even when the real
            // reason is something actionable, like "you need to apply and
            // be approved as a helper first" (403 from PATCH
            // /users/:id/helper-mode). Surface the server's actual error
            // text when it sent one; fall back to the generic message only
            // when it didn't (e.g. a genuine network failure).
            const serverMessage =
              err && typeof err === "object" && "data" in err &&
              err.data && typeof err.data === "object" && "error" in err.data &&
              typeof (err.data as { error?: unknown }).error === "string"
                ? (err.data as { error: string }).error
                : null;
            toast({
              title: active ? "Couldn't go online" : "Couldn't go offline",
              description: serverMessage ?? "That didn't save — check your connection and try again.",
              variant: "destructive",
            });
          },
        }
      );
    }
  };

  // Wrapper that also persists to localStorage so active request survives refresh
  const setActiveRequestId = (id: number | null) => {
    setActiveRequestIdState(id);
    try {
      if (id == null) localStorage.removeItem("niakofa_active_request");
      else localStorage.setItem("niakofa_active_request", String(id));
    } catch {}
  };

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = () => {
    clearToken();
    try {
      localStorage.removeItem("niakofa_user");
      localStorage.removeItem("niakofa_active_request");
    } catch {}
    setCurrentUser(null);
    setActiveRequestIdState(null);
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
  //   /status    — public unauthenticated status page
  //   /bird-test — SankofaBird visual QA harness, intentionally public (dev tool)
  //   /impact    — public county-impact dashboard
    const NO_REDIRECT_PATHS = [
  "/login",
  "/admin",
  "/admin/analytics",
  "/status",
  "/bird-test",
  "/impact",
      ];
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
  // Battery scoping: only a helper who is online (helperModeActive) or has an
  // active claimed job (activeRequestId) needs continuous high-accuracy GPS.
  // A requester, or a helper just browsing with the toggle off, gets a much
  // cheaper low-frequency/foreground-only fix instead — same watchPosition
  // API, but enableHighAccuracy/maximumAge scale down, and the watch is torn
  // down entirely while the tab is hidden so it never runs in the background
  // for someone who doesn't need live tracking. This is the single flag check
  // the mode-switch battery fix calls for — no second binary, no new state.
  const isTrackingNeeded = helperModeActive || !!activeRequestId;

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

    const onPosition = (pos: GeolocationPosition) => {
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
    };

    const onError = (_err: GeolocationPositionError) => {
      // Any GPS error (PERMISSION_DENIED, TIMEOUT, POSITION_UNAVAILABLE) →
      // fall back to IP if we haven't gotten a fix yet.
      tryIpFallback();
    };

    let watchId: number | null = null;

    const startWatch = () => {
      if (watchId != null) return;
      watchId = navigator.geolocation.watchPosition(onPosition, onError, {
        enableHighAccuracy: isTrackingNeeded,
        timeout: isTrackingNeeded ? 8000 : 15000,
        // Passive browsers/requesters accept a much staler fix (20s) — this
        // lets the browser skip a fresh GPS chip read far more often than the
        // 1s window a working helper needs for live navigation.
        maximumAge: isTrackingNeeded ? 1000 : 20000,
      });
    };

    const stopWatch = () => {
      if (watchId == null) return;
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    };

    startWatch();

    // Foreground-only for passive users: a requester or an off-duty helper
    // gets zero location tracking while the tab/app is backgrounded. Helpers
    // who are online or mid-job keep tracking in the background since a
    // dispatch or an in-progress delivery needs a live position.
    const onVisibilityChange = () => {
      if (isTrackingNeeded) return; // background tracking is legitimate here
      if (document.hidden) {
        stopWatch();
      } else {
        startWatch();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopWatch();
    };
  }, [isTrackingNeeded]);

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
      }, {
        onSuccess: (fresh) => {
          // Location PATCH is also a county switch. Replace the stored user
          // and discard county-derived query caches so pool/civic/map surfaces
          // cannot render data from the county just left.
          if (!fresh) return;
          setCurrentUser(previous => {
            const changedCounty = previous?.community_id !== fresh.community_id;
            if (changedCounty) void queryClient.invalidateQueries();
            try { localStorage.setItem("niakofa_user", JSON.stringify(fresh)); } catch {}
            return fresh;
          });
        },
      });
    }, interval);

    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, helperModeActive, activeRequestId, queryClient, updateLocation]);

  // Start the shared WS singleton and register/unregister as the user changes.
  // This effect is LAST so it never disturbs the hook order above.
  useEffect(() => {
    wsStart();
    if (currentUser) {
      wsRegister(currentUser.id);
    } else {
      wsUnregister();
    }
  }, [currentUser]);

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

    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    fetch(`${base}/api/users/${capturedId}`, { headers: { Authorization: `Bearer ${token}` } })
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
          // Sync helper mode from server truth (handles the "refresh loses helper mode" bug)
          if (typeof fresh.helper_mode_active === "boolean") {
            setHelperModeActiveState(fresh.helper_mode_active);
          }

          // ── Active-request staleness check ────────────────────────────────
          // The stored activeRequestId persists across page reloads so a helper
          // en-route survives a refresh. But if the request was completed,
          // cancelled, or reassigned while the app was closed, we'd show a
          // ghost job forever. Verify the request is still live.
          const storedReqId = (() => {
            try {
              const v = localStorage.getItem("niakofa_active_request");
              return v ? parseInt(v, 10) || null : null;
            } catch { return null; }
          })();
          if (storedReqId && active) {
            fetch(`${base}/api/requests/${storedReqId}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
              .then(async rq => {
                if (!active) return;
                if (!rq.ok) {
                  // 404 or 403 — request gone or inaccessible; clear the ghost.
                  setActiveRequestIdState(null);
                  try { localStorage.removeItem("niakofa_active_request"); } catch {}
                  toast({
                    title: "Active job cleared",
                    description: "Your previous job is no longer available — it may have been cancelled or reassigned.",
                  });
                  return;
                }
                const req = await rq.json() as { status?: string };
                if (!active) return;
                const terminal = req.status === "completed" || req.status === "cancelled";
                if (terminal) {
                  setActiveRequestIdState(null);
                  try { localStorage.removeItem("niakofa_active_request"); } catch {}
                  toast({
                    title: req.status === "completed" ? "Job completed ✓" : "Job was cancelled",
                    description: req.status === "completed"
                      ? "Your previous job has been marked complete."
                      : "Your previous job was cancelled while you were away.",
                  });
                }
              })
              .catch(() => { /* network error — keep stored ID, let the UI surface it */ });
          }
        }
      })
      .catch(() => {
        // Network failure — keep the stored user. They'll see API errors inline.
        // Never wipe a valid session just because the device is temporarily offline.
      });

    return () => { active = false; };
  }, []);  

  // ── Nia kill-switch: poll + WS (single source of truth) ─────────────────
  // All components that need niaEnabled must read it from context — never
  // duplicate this poll/WS logic elsewhere (e.g. in a local component state).
  useEffect(() => {
    let cancelled = false;
    async function checkNiaStatus() {
      try {
        const res = await fetch("/api/admin/nia-status");
        if (res.ok && !cancelled) {
          const data = await res.json() as { enabled: boolean };
          setNiaEnabled(data.enabled);
        }
      } catch { /* network error — keep existing state, never flip to a guess */ }
    }
    checkNiaStatus();
    const interval = setInterval(checkNiaStatus, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // WS instant path — admin toggle fires a nia_status broadcast so the UI
  // responds within milliseconds rather than waiting up to 60s for the poll.
  useEffect(() => {
    const unsub = wsSubscribe((event) => {
      if (
        event.type === ("nia_status" as WsEventType) &&
        typeof (event.payload as Record<string, unknown>)?.enabled === "boolean"
      ) {
        setNiaEnabled((event.payload as { enabled: boolean }).enabled);
      }
    });
    return unsub;
  }, []);

  // ── WS: live active-request clearing ─────────────────────────────────────
  // When the server broadcasts REQUEST_COMPLETED or REQUEST_CANCELLED while
  // the app is open, clear activeRequestId immediately so the UI never shows
  // a stale "ghost job" — no reload required.
  //
  // This complements the startup staleness check (above) which handles the
  // case where the request changed while the app was closed.  Together they
  // guarantee the device and server are always in agreement.
  useEffect(() => {
    const unsub = wsSubscribe((event) => {
      if (
        event.type !== "REQUEST_COMPLETED" &&
        event.type !== "REQUEST_CANCELLED"
      ) return;

      const payload = event.payload as { id?: number; request_id?: number } | null;
      const eventRequestId = payload?.id ?? payload?.request_id ?? null;
      if (eventRequestId == null) return;

      // Only clear if it matches the request this device currently has active.
      setActiveRequestIdState(prevId => {
        if (prevId !== eventRequestId) return prevId;
        try { localStorage.removeItem("niakofa_active_request"); } catch {}
        toast({
          title: event.type === "REQUEST_COMPLETED" ? "Job completed ✓" : "Job was cancelled",
          description: event.type === "REQUEST_COMPLETED"
            ? "This request has been marked complete."
            : "This request was cancelled.",
        });
        return null;
      });
    });
    return unsub;
  }, []); // activeRequestIdState read via setState callback — no dep needed

  return (
    <AppContext.Provider value={{
      currentUser,
      setCurrentUser,
      helperModeActive,
      setHelperModeActive,
      myLocation,
      activeRequestId,
      setActiveRequestId: setActiveRequestId,
      userPlace,
      setUserPlace,
      logout,
      niaEnabled,
      mapNavOpen,
      setMapNavOpen,
      mapSettingsOpen,
      setMapSettingsOpen,
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
