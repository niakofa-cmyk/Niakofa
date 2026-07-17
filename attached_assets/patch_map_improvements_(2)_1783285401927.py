#!/usr/bin/env python3
"""
patch_map_improvements.py

Applies the outstanding map.tsx improvements from the audit:

  1. Settings-driven radius — the map fetched nearby requests and online
     helpers with radius_miles hardcoded to 10, ignoring the helper's own
     max_travel_miles / service_radius_miles in user_settings. The backend
     already enforces max_travel_miles at claim time (requests.ts), so a
     helper with a 5-mile setting could see (and get Best-Match-carded
     toward) a request 10 miles out, only to be rejected on claim. The map
     now reads the same setting the backend enforces.

  2. WS reconnect resync — on WebSocket "connected" (including reconnects),
     invalidate the nearby-requests and online-helpers queries. The map
     relies on the WS delta stream after its initial fetch; any
     REQUEST_CREATED/REQUEST_COMPLETED/etc. event that fired during a
     disconnect window was gone for good, and the map could stay stale
     until something else re-triggered a refetch. This complements (does
     not replace) the isSuccess-based empty-state fix already in this file.

  3. Accessibility — the Traffic and Heat toggle buttons had no aria-label
     or aria-pressed, unlike the zoom/recenter controls next to them.

Usage:
    cd ~/niakofa   # repo root
    python3 patch_map_improvements.py

Safe to re-run: each edit checks whether it's already applied and skips it
rather than erroring or double-patching.
"""

import sys
from pathlib import Path

REPO_ROOT = Path.cwd()
TARGET = REPO_ROOT / "artifacts" / "pay-it-forward" / "src" / "pages" / "map.tsx"


def apply_patch(text: str, old: str, new: str, label: str) -> tuple[str, bool]:
    if new in text:
        print(f"  [skip] {label} — already applied")
        return text, False
    if old not in text:
        print(f"  [FAIL] {label} — expected old text not found. "
              f"File may have changed since this patch was written; "
              f"apply manually or update the script.")
        return text, False
    count = text.count(old)
    if count != 1:
        print(f"  [FAIL] {label} — old text matched {count} times, expected exactly 1. Skipping to avoid corrupting the file.")
        return text, False
    text = text.replace(old, new)
    print(f"  [ok]   {label}")
    return text, True


def main() -> int:
    if not TARGET.exists():
        print(f"ERROR: {TARGET} not found. Run this script from the repo root (cd ~/niakofa).")
        return 1

    text = TARGET.read_text(encoding="utf-8")
    any_applied = False

    # ── 1. Import useGetUserSettings ─────────────────────────────────────────
    old_import = '''import {
  useGetNearbyRequests, useGetOnlineHelpers, useClaimRequest,
  useGetRequestStats, useGetRoute,
  getGetNearbyRequestsQueryKey, getGetOnlineHelpersQueryKey,
  getGetRequestStatsQueryKey, getGetRequestsQueryKey, getGetRouteQueryKey,
} from "@workspace/api-client-react";'''
    new_import = '''import {
  useGetNearbyRequests, useGetOnlineHelpers, useClaimRequest,
  useGetRequestStats, useGetRoute, useGetUserSettings,
  getGetNearbyRequestsQueryKey, getGetOnlineHelpersQueryKey,
  getGetRequestStatsQueryKey, getGetRequestsQueryKey, getGetRouteQueryKey,
} from "@workspace/api-client-react";'''
    text, ok = apply_patch(text, old_import, new_import, "import useGetUserSettings")
    any_applied |= ok

    # ── 2. Settings-driven radius, replacing hardcoded 10 ────────────────────
    old_queries = '''  const { data: requests = [], isSuccess: requestsLoaded } = useGetNearbyRequests(
    { lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: 10 },
    { query: { enabled: !!myLocation, queryKey: getGetNearbyRequestsQueryKey({ lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: 10 }) } }
  );
  const { data: helpers = [], isSuccess: helpersLoaded } = useGetOnlineHelpers(
    { lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: 10 },
    { query: { enabled: !!myLocation, queryKey: getGetOnlineHelpersQueryKey({ lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: 10 }) } }
  );'''
    new_queries = '''  // ── Helper's own travel radius drives what the map fetches ────────────────
  // Previously hardcoded to 10 miles regardless of what the user configured
  // in Settings. The backend's claim-time check (requests.ts) enforces the
  // helper's real max_travel_miles (falling back to 15 if unset) — so a
  // helper who set a 5-mile radius could still see, and get Best-Match-carded
  // toward, requests up to 10 miles out, only to hit a distance rejection at
  // claim time. Reading the same setting here keeps the map and the backend
  // enforcement boundary in sync. Requester (non-helper) browsing uses
  // service_radius_miles instead, since max_travel_miles is a helper-only concept.
  const { data: userSettings } = useGetUserSettings(
    currentUser?.id ?? 0,
    { query: { enabled: !!currentUser?.id } }
  );
  // 15 mirrors the backend's own fallback when max_travel_miles is unset
  // (see requests.ts claim-time check) — keep these two numbers in sync.
  const DEFAULT_RADIUS_MILES = 15;
  const radiusMiles = helperModeActive
    ? (userSettings?.max_travel_miles ?? userSettings?.service_radius_miles ?? DEFAULT_RADIUS_MILES)
    : (userSettings?.service_radius_miles ?? DEFAULT_RADIUS_MILES);

  const { data: requests = [], isSuccess: requestsLoaded } = useGetNearbyRequests(
    { lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: radiusMiles },
    { query: { enabled: !!myLocation, queryKey: getGetNearbyRequestsQueryKey({ lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: radiusMiles }) } }
  );
  const { data: helpers = [], isSuccess: helpersLoaded } = useGetOnlineHelpers(
    { lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: radiusMiles },
    { query: { enabled: !!myLocation, queryKey: getGetOnlineHelpersQueryKey({ lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: radiusMiles }) } }
  );'''
    text, ok = apply_patch(text, old_queries, new_queries, "settings-driven radius (replace hardcoded 10mi)")
    any_applied |= ok

    # ── 3. WS reconnect → full resync, not just resumed delta stream ────────
    old_ws_connected = '''  useWebSocket(useCallback((event) => {
    if (event.type === "connected") {
      setWsConnected(true);
    } else if (event.type === "REQUEST_CREATED" || event.type === "new_request") {'''
    new_ws_connected = '''  useWebSocket(useCallback((event) => {
    if (event.type === "connected") {
      setWsConnected(true);
      // Missed WS events during a disconnect (however brief) are gone for
      // good — deltas like REQUEST_CREATED/REQUEST_COMPLETED that fired while
      // we were offline never replay. A full resync on every reconnect is
      // the only way to guarantee the map reflects reality after any gap.
      const loc = myLocationRef.current;
      if (loc) {
        queryClient.invalidateQueries({
          queryKey: getGetNearbyRequestsQueryKey({ lat: loc.lat, lng: loc.lng, radius_miles: radiusMiles }),
        });
        queryClient.invalidateQueries({
          queryKey: getGetOnlineHelpersQueryKey({ lat: loc.lat, lng: loc.lng, radius_miles: radiusMiles }),
        });
      }
    } else if (event.type === "REQUEST_CREATED" || event.type === "new_request") {'''
    text, ok = apply_patch(text, old_ws_connected, new_ws_connected, "WS reconnect resync")
    any_applied |= ok

    # ── 3b. Add radiusMiles to the useCallback dependency array ─────────────
    old_deps = '''  }, [currentUser?.id, queryClient]));'''
    new_deps = '''  }, [currentUser?.id, queryClient, radiusMiles]));'''
    text, ok = apply_patch(text, old_deps, new_deps, "WS callback deps (add radiusMiles)")
    any_applied |= ok

    # ── 4. Accessibility — Traffic toggle ────────────────────────────────────
    old_traffic_btn = '''        <button
          onClick={() => setShowTraffic(t => !t)}
          style={{ touchAction: "manipulation" }}
          className={`absolute bottom-24 left-4 z-10 flex items-center gap-1.5 px-3 py-2 rounded-full border text-[10px] font-black backdrop-blur-sm transition-all active:scale-95 ${
            showTraffic
              ? "bg-primary/20 border-primary/40 text-primary"
              : "bg-card/80 border-border text-muted-foreground"
          }`}
        >
          <Car className="w-3 h-3" />
          <span>Traffic</span>
        </button>'''
    new_traffic_btn = '''        <button
          onClick={() => setShowTraffic(t => !t)}
          style={{ touchAction: "manipulation" }}
          aria-label="Toggle traffic layer"
          aria-pressed={showTraffic}
          className={`absolute bottom-24 left-4 z-10 flex items-center gap-1.5 px-3 py-2 rounded-full border text-[10px] font-black backdrop-blur-sm transition-all active:scale-95 ${
            showTraffic
              ? "bg-primary/20 border-primary/40 text-primary"
              : "bg-card/80 border-border text-muted-foreground"
          }`}
        >
          <Car className="w-3 h-3" />
          <span>Traffic</span>
        </button>'''
    text, ok = apply_patch(text, old_traffic_btn, new_traffic_btn, "aria-label on Traffic toggle")
    any_applied |= ok

    # ── 5. Accessibility — Heat toggle ───────────────────────────────────────
    old_heat_btn = '''        <button
          onClick={() => setShowHeatmap(h => !h)}
          style={{ touchAction: "manipulation" }}
          className={`absolute bottom-24 left-24 z-10 flex items-center gap-1.5 px-3 py-2 rounded-full border text-[10px] font-black backdrop-blur-sm transition-all active:scale-95 ${
            showHeatmap
              ? "bg-yellow-400/20 border-yellow-400/50 text-yellow-400"
              : "bg-card/80 border-border text-muted-foreground"
          }`}
        >
          <Layers className="w-3 h-3" />
          <span>Heat</span>
        </button>'''
    new_heat_btn = '''        <button
          onClick={() => setShowHeatmap(h => !h)}
          style={{ touchAction: "manipulation" }}
          aria-label="Toggle demand heatmap"
          aria-pressed={showHeatmap}
          className={`absolute bottom-24 left-24 z-10 flex items-center gap-1.5 px-3 py-2 rounded-full border text-[10px] font-black backdrop-blur-sm transition-all active:scale-95 ${
            showHeatmap
              ? "bg-yellow-400/20 border-yellow-400/50 text-yellow-400"
              : "bg-card/80 border-border text-muted-foreground"
          }`}
        >
          <Layers className="w-3 h-3" />
          <span>Heat</span>
        </button>'''
    text, ok = apply_patch(text, old_heat_btn, new_heat_btn, "aria-label on Heat toggle")
    any_applied |= ok

    TARGET.write_text(text, encoding="utf-8")

    print()
    if any_applied:
        print(f"Done. Wrote changes to {TARGET.relative_to(REPO_ROOT)}")
        print()
        print("Next steps:")
        print("  cd ~/niakofa && pwd")
        print("  git diff artifacts/pay-it-forward/src/pages/map.tsx")
        print("  git add -A artifacts/pay-it-forward/src/pages/map.tsx")
        print('  git commit -m "map: resync on WS reconnect, use settings-driven radius, a11y labels"')
        print("  git push origin main")
    else:
        print("No changes made (everything already applied or nothing matched — see [FAIL]/[skip] lines above).")

    return 0


if __name__ == "__main__":
    sys.exit(main())
