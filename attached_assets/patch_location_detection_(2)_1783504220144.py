#!/usr/bin/env python3
"""
patch_location_detection.py

DEPENDS ON: patch_community_assignment.py must be applied first (this patch
builds on getDefaultCommunityId() / the users.ts + google-auth.ts community_id
wiring from that patch).

Fixes the second half of the county/civic-connection gap: AppContext.userPlace
(city/county/state) has existed since it was first added — read by TopBar,
NiaDrawer, App.tsx, onboarding.tsx, request-new.tsx, profile.tsx — but nothing
ever called setUserPlace(). It was permanently null. Separately, a working
Mapbox reverse-geocoder existed in civic.ts, but only powered one page
(/civic/resources) and had no connection to userPlace or to community
assignment at registration.

Changes:
  1. artifacts/api-server/src/lib/geocode.ts (NEW FILE)
     - Shared, cached reverse-geocode lib extracted from civic.ts.
  2. artifacts/api-server/src/routes/civic.ts
     - Now imports reverseGeocode/resolvePlace from the shared lib instead of
       a private copy.
  3. artifacts/api-server/src/routes/geo.ts (NEW FILE)
     - GET /geo/detect-place?lat=&lng= — general-purpose place resolution,
       usable from anywhere in the app (not just the civic-resources page).
  4. artifacts/api-server/src/routes/index.ts
     - Registers the new geo router.
  5. artifacts/api-server/src/lib/community-pool.ts
     - Adds resolveCommunityForRegistration(detectedCounty), which matches a
       GPS-detected county name against the communities table before falling
       back to getDefaultCommunityId().
  6. artifacts/api-server/src/routes/users.ts
     - Registration now reads an optional detected_county from the body and
       uses resolveCommunityForRegistration() instead of always defaulting.
  7. artifacts/api-server/src/routes/google-auth.ts
     - Same change for the Google Sign-In new-account path.
  8. artifacts/pay-it-forward/src/lib/AppContext.tsx
     - Actually populates userPlace: whenever myLocation moves >1.5km from
       the last resolved point, calls /api/geo/detect-place and sets it.
  9. artifacts/pay-it-forward/src/pages/login.tsx
     - Sends userPlace.county along with both registration and Google
       Sign-In requests so the server can match it to a real community.

Run from the repo root (after patch_community_assignment.py):
    python3 patch_location_detection.py

Idempotent: safe to re-run; already-patched files are detected and skipped.
"""
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent
API_SERVER = REPO_ROOT / "artifacts" / "api-server" / "src"
PIF = REPO_ROOT / "artifacts" / "pay-it-forward" / "src"


def read(path: Path) -> str:
    if not path.exists():
        print(f"ERROR: expected file not found: {path}", file=sys.stderr)
        sys.exit(1)
    return path.read_text(encoding="utf-8")


def write(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


GEOCODE_LIB_SRC = '''/**
 * Niakofa — Shared reverse-geocoding lib
 *
 * Extracted from civic.ts (where reverseGeocode() originally lived, private to
 * the /civic/resources route) so the same Mapbox-backed place resolution can
 * power a general-purpose /geo/detect-place endpoint used app-wide — for
 * AppContext.userPlace (city/county/state shown in TopBar, Nia's local
 * context, request creation) and for matching a new user to a community/
 * county pool at registration.
 *
 * Caching: results are cached by rounded (0.1°, ~11km) lat/lng for 1 hour —
 * civic/county boundaries don't change, and this keeps Mapbox usage cheap
 * even with GPS updating every few seconds client-side.
 */
import { logger } from "./logger";
import { cacheGet, cacheSet } from "./cache";

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN ?? process.env.VITE_MAPBOX_TOKEN ?? "";
const PLACE_CACHE_TTL = 3600; // 1 hour

interface MapboxFeature {
  place_type: string[];
  text: string;
  place_name: string;
  context?: { id: string; text: string }[];
}

interface MapboxGeocodingResponse {
  features: MapboxFeature[];
}

export interface ResolvedPlace {
  city: string | null;
  county: string | null;
  state: string | null;
  state_short: string | null;
  place_name: string;
}

/** Uncached Mapbox reverse-geocode call. Prefer resolvePlace() below for anything user-facing. */
export async function reverseGeocode(lat: number, lng: number): Promise<ResolvedPlace | null> {
  if (!MAPBOX_TOKEN) {
    logger.warn("geocode: MAPBOX_TOKEN not configured — reverse geocoding unavailable");
    return null;
  }

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place,district,region&access_token=${MAPBOX_TOKEN}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      logger.warn({ status: res.status }, "Mapbox geocoding non-200");
      return null;
    }
    const data = await res.json() as MapboxGeocodingResponse;
    if (!data.features || data.features.length === 0) return null;

    let city: string | null = null;
    let county: string | null = null;
    let state: string | null = null;
    let state_short: string | null = null;
    let place_name = "";

    for (const feature of data.features) {
      const types = feature.place_type ?? [];
      const ctx = feature.context ?? [];

      if (types.includes("place") && !city) {
        city = feature.text;
        place_name = feature.place_name;

        for (const c of ctx) {
          if (c.id.startsWith("district.")) {
            county = c.text.replace(/ County$/i, "").trim();
          }
          if (c.id.startsWith("region.")) {
            const parts = c.text.split(",");
            state = c.text.trim();
            state_short = (parts[parts.length - 1] ?? c.text).trim();
          }
        }
      }

      if (types.includes("district") && !county) {
        county = feature.text.replace(/ County$/i, "").trim();
        for (const c of ctx) {
          if (c.id.startsWith("region.")) {
            const parts = c.text.split(",");
            state_short = (parts[parts.length - 1] ?? c.text).trim();
            state = c.text.trim();
          }
        }
      }

      if (types.includes("region") && !state) {
        const parts = feature.text.split(",");
        state_short = (parts[parts.length - 1] ?? feature.text).trim();
        state = feature.text.trim();
      }
    }

    return { city, county, state_short, state, place_name: place_name || `${city ?? ""}, ${state_short ?? ""}`.trim() };
  } catch (err) {
    logger.warn({ err }, "Mapbox reverse geocode failed");
    return null;
  }
}

/**
 * Cached reverse-geocode. Rounds lat/lng to ~11km grid cells so nearby GPS
 * fixes share a cache entry instead of re-hitting Mapbox on every jitter.
 */
export async function resolvePlace(lat: number, lng: number): Promise<ResolvedPlace | null> {
  const latRounded = Math.round(lat * 10) / 10;
  const lngRounded = Math.round(lng * 10) / 10;
  const cacheKey = `geo:place:${latRounded}:${lngRounded}`;

  const cached = await cacheGet<ResolvedPlace>(cacheKey);
  if (cached) return cached;

  const place = await reverseGeocode(lat, lng);
  if (place) await cacheSet(cacheKey, place, PLACE_CACHE_TTL);
  return place;
}

/**
 * Normalize a county name for matching against communities.name — lowercase,
 * strip a trailing "County", strip non-alphanumerics. Makes "Tarrant" (Mapbox's
 * district name, already stripped of "County") match a communities row named
 * "Tarrant County" (the human-friendly admin-facing name).
 */
export function normalizeCountyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\\s+county$/i, "")
    .replace(/[^a-z0-9]/g, "");
}
'''

GEO_ROUTE_SRC = '''/**
 * Niakofa — General-purpose location detection
 *
 * GET /geo/detect-place?lat=&lng=
 *
 * Resolves GPS coordinates to city/county/state via the shared, cached
 * Mapbox-backed resolver in lib/geocode.ts. Unlike /civic/resources (which
 * bundles place resolution with a civic-resources lookup for one page), this
 * is a lightweight, standalone endpoint meant to be called from anywhere the
 * app needs to know "what county is this person in" — most importantly
 * AppContext.userPlace, which is read by TopBar, Nia's local context, request
 * creation, and onboarding, but — until this fix — was never actually
 * populated by anything.
 *
 * No auth required: location detection needs to work before login (during
 * onboarding/registration, to assign a community/county pool) exactly like
 * the GPS-watch effect in AppContext itself runs unconditionally.
 */
import { Router } from "express";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { resolvePlace } from "../lib/geocode";

const router = Router();

router.get("/geo/detect-place", generalApiLimiter, async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: "lat and lng query params are required and must be valid coordinates" });
  }

  const place = await resolvePlace(lat, lng);

  if (!place) {
    // Non-fatal — resolution can fail (Mapbox down, no token configured,
    // point over water, etc). Callers should treat this as "unknown" and
    // keep whatever they had before, never block on it.
    return res.json({ city: null, county: null, state: null, state_short: null, place_name: null });
  }

  logger.info({ lat, lng, county: place.county, state: place.state_short }, "geo/detect-place: resolved");
  return res.json(place);
});

export default router;
'''


def create_geocode_lib() -> None:
    path = API_SERVER / "lib" / "geocode.ts"
    if path.exists():
        print(f"SKIP (already exists): {path}")
        return
    write(path, GEOCODE_LIB_SRC)
    print(f"CREATED: {path}")


def create_geo_route() -> None:
    path = API_SERVER / "routes" / "geo.ts"
    if path.exists():
        print(f"SKIP (already exists): {path}")
        return
    write(path, GEO_ROUTE_SRC)
    print(f"CREATED: {path}")


def patch_civic_route() -> None:
    path = API_SERVER / "routes" / "civic.ts"
    content = read(path)

    if 'from "../lib/geocode"' in content:
        print(f"SKIP (already patched): {path}")
        return

    old_header = '''import { Router } from "express";
import { db, civicResourcesTable, civicSuggestionsTable, governmentSponsorsTable, requestsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { adminLimiter, generalApiLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { cacheGet, cacheSet } from "../lib/cache";

const CIVIC_TTL = 3600; // 1 hour — civic resources change rarely

const router = Router();

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN ?? process.env.VITE_MAPBOX_TOKEN ?? "";

interface MapboxFeature {
  place_type: string[];
  text: string;
  place_name: string;
  context?: { id: string; text: string }[];
}

interface MapboxGeocodingResponse {
  features: MapboxFeature[];
}

interface ResolvedPlace {
  city: string | null;
  county: string | null;
  state: string | null;
  state_short: string | null;
  place_name: string;
}

async function reverseGeocode(lat: number, lng: number): Promise<ResolvedPlace | null> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place,district,region&access_token=${MAPBOX_TOKEN}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      logger.warn({ status: res.status }, "Mapbox geocoding non-200");
      return null;
    }
    const data = await res.json() as MapboxGeocodingResponse;
    if (!data.features || data.features.length === 0) return null;

    let city: string | null = null;
    let county: string | null = null;
    let state: string | null = null;
    let state_short: string | null = null;
    let place_name = "";

    for (const feature of data.features) {
      const types = feature.place_type ?? [];
      const ctx = feature.context ?? [];

      if (types.includes("place") && !city) {
        city = feature.text;
        place_name = feature.place_name;

        for (const c of ctx) {
          if (c.id.startsWith("district.")) {
            county = c.text.replace(/ County$/i, "").trim();
          }
          if (c.id.startsWith("region.")) {
            const parts = c.text.split(",");
            state = c.text.trim();
            state_short = (parts[parts.length - 1] ?? c.text).trim();
          }
        }
      }

      if (types.includes("district") && !county) {
        county = feature.text.replace(/ County$/i, "").trim();
        for (const c of ctx) {
          if (c.id.startsWith("region.")) {
            const parts = c.text.split(",");
            state_short = (parts[parts.length - 1] ?? c.text).trim();
            state = c.text.trim();
          }
        }
      }

      if (types.includes("region") && !state) {
        const parts = feature.text.split(",");
        state_short = (parts[parts.length - 1] ?? feature.text).trim();
        state = feature.text.trim();
      }
    }

    return { city, county, state_short, state, place_name: place_name || `${city ?? ""}, ${state_short ?? ""}`.trim() };
  } catch (err) {
    logger.warn({ err }, "Mapbox reverse geocode failed");
    return null;
  }
}'''

    new_header = '''import { Router } from "express";
import { db, civicResourcesTable, civicSuggestionsTable, governmentSponsorsTable, requestsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { adminLimiter, generalApiLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { cacheGet, cacheSet } from "../lib/cache";
import { resolvePlace } from "../lib/geocode";

const CIVIC_TTL = 3600; // 1 hour — civic resources change rarely

const router = Router();'''

    assert old_header in content, "civic.ts header block not found — cannot safely patch"
    content = content.replace(old_header, new_header, 1)

    old_call = "  const place = await reverseGeocode(lat, lng);"
    new_call = "  const place = await resolvePlace(lat, lng);"
    assert old_call in content, "civic.ts reverseGeocode call site not found"
    content = content.replace(old_call, new_call, 1)

    write(path, content)
    print(f"PATCHED: {path}")


def patch_routes_index() -> None:
    path = API_SERVER / "routes" / "index.ts"
    content = read(path)

    if "geoRouter" in content:
        print(f"SKIP (already patched): {path}")
        return

    import_anchor = 'import adminCommunitiesRouter from "./admin-communities";'
    assert import_anchor in content, f"import anchor not found in {path}"
    content = content.replace(
        import_anchor,
        import_anchor + '\nimport geoRouter from "./geo";',
        1,
    )

    use_anchor = "router.use(adminCommunitiesRouter);"
    assert use_anchor in content, f"router.use anchor not found in {path}"
    content = content.replace(
        use_anchor,
        use_anchor + "\nrouter.use(geoRouter);",
        1,
    )

    write(path, content)
    print(f"PATCHED: {path}")


def patch_community_pool_lib() -> None:
    path = API_SERVER / "lib" / "community-pool.ts"
    content = read(path)

    if "resolveCommunityForRegistration" in content:
        print(f"SKIP (already patched): {path}")
        return

    anchor = '''/**
 * Compute the guaranteed minimum for a completed task.'''
    assert anchor in content, f"anchor not found in {path} — has patch_community_assignment.py been applied?"

    insertion = '''/**
 * Normalize a county name for matching against communities.name — lowercase,
 * strip a trailing "County", strip non-alphanumerics. Makes "Tarrant"
 * (Mapbox's district name, already stripped of "County" by lib/geocode.ts)
 * match a communities row named "Tarrant County" (the human-friendly,
 * admin-facing name).
 */
function normalizeCountyForMatch(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\\s+county$/i, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Resolve which community a brand-new user should be assigned to.
 *
 * Prefers a real match against the GPS-detected county (resolved client-side
 * via /geo/detect-place and passed through registration as detectedCounty) —
 * this is what makes "county pool" actually mean the user's real county
 * rather than everyone landing in the same default. Falls back to
 * getDefaultCommunityId() when no county was detected, or when the detected
 * county doesn't match any existing community row (e.g. someone signing up
 * from outside Tarrant County before other counties have been onboarded).
 */
export async function resolveCommunityForRegistration(
  detectedCounty?: string | null,
): Promise<number | null> {
  if (detectedCounty && detectedCounty.trim()) {
    try {
      const target = normalizeCountyForMatch(detectedCounty);
      const allCommunities = await db
        .select({ id: communitiesTable.id, name: communitiesTable.name })
        .from(communitiesTable);
      const match = allCommunities.find(c => normalizeCountyForMatch(c.name) === target);
      if (match) return match.id;
      logger.info(
        { detectedCounty },
        "community-pool: detected county has no matching community row — falling back to default",
      );
    } catch (err) {
      logger.error({ err }, "community-pool: county-match lookup failed — falling back to default");
    }
  }
  return getDefaultCommunityId();
}

/**
 * Compute the guaranteed minimum for a completed task.'''

    content = content.replace(anchor, insertion, 1)
    write(path, content)
    print(f"PATCHED: {path}")


def patch_users_route() -> None:
    path = API_SERVER / "routes" / "users.ts"
    content = read(path)

    if "resolveCommunityForRegistration" in content:
        print(f"SKIP (already patched): {path}")
        return

    import_anchor = 'import { getDefaultCommunityId } from "../lib/community-pool";'
    assert import_anchor in content, f"import anchor not found in {path} — has patch_community_assignment.py been applied?"
    content = content.replace(
        import_anchor,
        'import { resolveCommunityForRegistration } from "../lib/community-pool";',
        1,
    )

    old_body_type = '''  const body = req.body as {
    password?: string;
    account_type?: string;
    organization_name?: string;
    organization_description?: string;
    tos_accepted?: boolean;
  };'''
    assert old_body_type in content, f"registration body type block not found in {path}"
    new_body_type = '''  const body = req.body as {
    password?: string;
    account_type?: string;
    organization_name?: string;
    organization_description?: string;
    tos_accepted?: boolean;
    // GPS-detected county (from AppContext.userPlace, resolved client-side via
    // /api/geo/detect-place). Optional — registration must never fail because
    // location detection didn't resolve. Not yet part of the generated
    // RegisterUserBody zod schema (same situation as account_type above, see
    // BUG-CRIT-01) — read directly off the raw body until the openapi spec
    // is updated and codegen re-run.
    detected_county?: string;
  };'''
    content = content.replace(old_body_type, new_body_type, 1)

    old_community_block = '''  // Assign every new user to a real community row (defaults to the seeded
  // "Tarrant County" pool, or whichever community an admin has designated via
  // system_settings.default_community_id). Previously community_id was never
  // set anywhere, so every user fell into the NULL/global bucket and the
  // per-community pool-health-ratio wage multiplier in community-pool.ts
  // never actually differentiated anything. A lookup failure here must never
  // block registration — fall back to null (legacy global bucket) exactly
  // like before this change.
  const community_id = await getDefaultCommunityId().catch(() => null);'''
    assert old_community_block in content, f"community_id assignment block not found in {path}"
    new_community_block = '''  // Assign every new user to a real community row. Prefers a match against
  // their GPS-detected county (sent from the client's AppContext.userPlace,
  // resolved via /api/geo/detect-place) so a signup from a different county
  // doesn't get silently lumped into Tarrant County once other counties exist.
  // Falls back to the default community (getDefaultCommunityId) when no
  // county was detected or it doesn't match any existing community row.
  // Previously community_id was never set anywhere, so every user fell into
  // the NULL/global bucket and the per-community pool-health-ratio wage
  // multiplier in community-pool.ts never actually differentiated anything.
  // A lookup failure here must never block registration — fall back to null
  // (legacy global bucket) exactly like before this change.
  const MAX_DETECTED_COUNTY_LEN = 100;
  const detectedCounty = body.detected_county?.trim().slice(0, MAX_DETECTED_COUNTY_LEN) || null;
  const community_id = await resolveCommunityForRegistration(detectedCounty).catch(() => null);'''
    content = content.replace(old_community_block, new_community_block, 1)

    write(path, content)
    print(f"PATCHED: {path}")


def patch_google_auth_route() -> None:
    path = API_SERVER / "routes" / "google-auth.ts"
    content = read(path)

    if "resolveCommunityForRegistration" in content:
        print(f"SKIP (already patched): {path}")
        return

    import_anchor = 'import { getDefaultCommunityId } from "../lib/community-pool";'
    assert import_anchor in content, f"import anchor not found in {path} — has patch_community_assignment.py been applied?"
    content = content.replace(
        import_anchor,
        'import { resolveCommunityForRegistration } from "../lib/community-pool";',
        1,
    )

    old_handler_open = '''router.post("/auth/google", authLimiter, async (req: Request, res: Response) => {
  const { id_token } = req.body as { id_token?: string };'''
    assert old_handler_open in content, f"google auth handler signature not found in {path}"
    new_handler_open = '''router.post("/auth/google", authLimiter, async (req: Request, res: Response) => {
  const { id_token, detected_county } = req.body as { id_token?: string; detected_county?: string };'''
    content = content.replace(old_handler_open, new_handler_open, 1)

    old_create_block = '''      try {
        // Same default-community assignment as email/password registration
        // (users.ts) — must never block account creation on failure.
        const community_id = await getDefaultCommunityId().catch(() => null);'''
    assert old_create_block in content, f"google-auth account-creation block not found in {path}"
    new_create_block = '''      try {
        // Same default-community assignment as email/password registration
        // (users.ts) — must never block account creation on failure. Prefers
        // a match against the client's GPS-detected county when provided.
        const MAX_DETECTED_COUNTY_LEN = 100;
        const cleanedCounty = detected_county?.trim().slice(0, MAX_DETECTED_COUNTY_LEN) || null;
        const community_id = await resolveCommunityForRegistration(cleanedCounty).catch(() => null);'''
    content = content.replace(old_create_block, new_create_block, 1)

    write(path, content)
    print(f"PATCHED: {path}")


def patch_app_context() -> None:
    path = PIF / "lib" / "AppContext.tsx"
    content = read(path)

    if "lastPlaceLookupRef" in content:
        print(f"SKIP (already patched): {path}")
        return

    old_refs = '''  const locationRef = useRef<Location | null>(null);
  const prevBroadcastRef = useRef<Location | null>(null);
  const prevLocationRef = useRef<Location | null>(null);
  const smoothedRef = useRef<{ lat: number; lng: number } | null>(null);'''
    assert old_refs in content, f"ref declarations not found in {path}"
    new_refs = old_refs + "\n  const lastPlaceLookupRef = useRef<Location | null>(null);"
    content = content.replace(old_refs, new_refs, 1)

    old_effect_end = '''    return () => navigator.geolocation.clearWatch(watchId);
  }, []);'''
    assert old_effect_end in content, f"GPS watchPosition effect end not found in {path}"
    new_effect_end = old_effect_end + '''

  // Resolve myLocation → city/county/state via the server's cached reverse
  // geocoder, and populate userPlace.
  //
  // userPlace has existed on this context since it was first added (read by
  // TopBar, NiaDrawer, App.tsx, onboarding.tsx, request-new.tsx, profile.tsx)
  // but nothing ever called setUserPlace — it was permanently null. This is
  // the fix: whenever myLocation moves far enough to plausibly be in a
  // different city/county (~1.5km — county/city boundaries are coarse, no
  // need to re-resolve on every few-meter GPS jitter), fetch the resolved
  // place and store it. A failed/slow lookup just leaves userPlace as-is —
  // this is enrichment, never something the rest of the app should block on.
  useEffect(() => {
    if (!myLocation) return;

    const last = lastPlaceLookupRef.current;
    if (last && distanceMeters(last, myLocation) < 1500) return;
    lastPlaceLookupRef.current = myLocation;

    let cancelled = false;
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\\/$/, "");
    fetch(`${base}/api/geo/detect-place?lat=${myLocation.lat}&lng=${myLocation.lng}`)
      .then(r => (r.ok ? r.json() : null))
      .then((place: { city: string | null; county: string | null; state: string | null; place_name: string | null } | null) => {
        if (cancelled || !place || !place.county) return;
        setUserPlace({
          city: place.city,
          county: place.county,
          state: place.state,
          label: place.place_name,
        });
      })
      .catch(() => { /* network error — leave userPlace as it was, never guess */ });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLocation]);'''
    content = content.replace(old_effect_end, new_effect_end, 1)

    write(path, content)
    print(f"PATCHED: {path}")


def patch_login_page() -> None:
    path = PIF / "pages" / "login.tsx"
    content = read(path)

    if "detected_county" in content:
        print(f"SKIP (already patched): {path}")
        return

    old_context = '  const { setCurrentUser, niaEnabled } = useAppContext();'
    assert old_context in content, f"useAppContext destructure not found in {path}"
    content = content.replace(
        old_context,
        '  const { setCurrentUser, niaEnabled, userPlace } = useAppContext();',
        1,
    )

    old_register_body = '''          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            password,
            tos_accepted: tosAccepted,   // required by server — must be explicitly true
            is_helper: false,
            account_type: accountType,
            organization_name: organizationName.trim() || undefined,
            organization_description: organizationDescription.trim() || undefined,
          }),'''
    assert old_register_body in content, f"registration fetch body not found in {path}"
    new_register_body = '''          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            password,
            tos_accepted: tosAccepted,   // required by server — must be explicitly true
            is_helper: false,
            account_type: accountType,
            organization_name: organizationName.trim() || undefined,
            organization_description: organizationDescription.trim() || undefined,
            // GPS-detected county (AppContext.userPlace, resolved via
            // /api/geo/detect-place) — lets the server match this signup to
            // their real county pool instead of always using the default.
            detected_county: userPlace?.county ?? undefined,
          }),'''
    content = content.replace(old_register_body, new_register_body, 1)

    old_google_body = '        body: JSON.stringify({ id_token: credential }),'
    assert old_google_body in content, f"Google auth fetch body not found in {path}"
    new_google_body = '        body: JSON.stringify({ id_token: credential, detected_county: userPlace?.county ?? undefined }),'
    content = content.replace(old_google_body, new_google_body, 1)

    write(path, content)
    print(f"PATCHED: {path}")


def main() -> None:
    create_geocode_lib()
    create_geo_route()
    patch_civic_route()
    patch_routes_index()
    patch_community_pool_lib()
    patch_users_route()
    patch_google_auth_route()
    patch_app_context()
    patch_login_page()
    print("\nDone. Next steps:")
    print("  1. Review the diffs (git diff).")
    print("  2. pnpm run typecheck")
    print("  3. Confirm MAPBOX_TOKEN (or VITE_MAPBOX_TOKEN) is set — reverse")
    print("     geocoding silently no-ops without it (logged as a warning).")
    print("  4. Deploy as usual.")


if __name__ == "__main__":
    main()
