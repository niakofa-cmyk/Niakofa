/**
 * Live Diaspora presence.
 *
 * Membership and physical presence are intentionally different metrics.
 * This module derives an aggregate view from the latest server-synced GPS.
 * Raw coordinates never leave this module's public snapshot.
 */
export const LIVE_PRESENCE_WINDOW_MS = 10 * 60 * 1000;

export type PresenceHub = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  presence_radius_km: number;
  status: string;
};

export type PresenceUser = {
  id: number;
  lat: number | null;
  lng: number | null;
  location_updated_at: Date | string | null;
};

export type HubPresence = {
  hub_id: number;
  hub_name: string;
  live_user_count: number;
  last_location_at: string | null;
};

export type CurrentHubPresence = {
  hub_id: number;
  hub_name: string;
  distance_km: number;
} | null;

export type PresenceSnapshot = {
  generated_at: string;
  freshness_window_seconds: number;
  current_user: {
    location_fresh: boolean;
    location_updated_at: string | null;
    location_age_seconds: number | null;
    current_hub: CurrentHubPresence;
  };
  hubs: HubPresence[];
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function resolveNearestHub(lat: number, lng: number, hubs: PresenceHub[]): CurrentHubPresence {
  if (!finite(lat) || !finite(lng)) return null;

  let best: CurrentHubPresence = null;
  for (const hub of hubs) {
    if (
      hub.status !== "approved" ||
      !finite(hub.lat) ||
      !finite(hub.lng) ||
      !finite(hub.presence_radius_km) ||
      hub.presence_radius_km <= 0
    ) continue;

    const distance_km = haversineKm(lat, lng, hub.lat, hub.lng);
    if (distance_km > hub.presence_radius_km) continue;

    if (!best || distance_km < best.distance_km) {
      best = { hub_id: hub.id, hub_name: hub.name, distance_km: Number(distance_km.toFixed(2)) };
    }
  }
  return best;
}

function parseDate(value: Date | string | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function isLivePresenceTimestamp(value: Date | string | null, now: Date): boolean {
  const updated = parseDate(value);
  if (!updated) return false;
  const ageMs = now.getTime() - updated.getTime();
  return ageMs >= 0 && ageMs <= LIVE_PRESENCE_WINDOW_MS;
}

export function buildPresenceSnapshot(args: {
  now: Date;
  hubs: PresenceHub[];
  users: PresenceUser[];
  currentUserId: number;
}): PresenceSnapshot {
  const { now, hubs, users, currentUserId } = args;
  const counts = new Map<number, { count: number; last: number | null }>();
  for (const hub of hubs) counts.set(hub.id, { count: 0, last: null });

  let currentUser: PresenceUser | undefined;
  for (const user of users) {
    if (user.id === currentUserId) currentUser = user;

    const updated = parseDate(user.location_updated_at);
    if (!updated || !isLivePresenceTimestamp(updated, now)) continue;

    const resolved = finite(user.lat) && finite(user.lng)
      ? resolveNearestHub(user.lat, user.lng, hubs)
      : null;
    if (!resolved) continue;

    const bucket = counts.get(resolved.hub_id);
    if (!bucket) continue;
    bucket.count += 1;
    const timestamp = updated.getTime();
    if (bucket.last == null || timestamp > bucket.last) bucket.last = timestamp;
  }

  const currentUpdated = parseDate(currentUser?.location_updated_at ?? null);
  const currentAgeMs = currentUpdated ? now.getTime() - currentUpdated.getTime() : null;
  const currentAge = currentAgeMs != null
    ? Math.max(0, Math.floor(currentAgeMs / 1000))
    : null;
  const currentLocationFresh =
    currentAgeMs != null &&
    currentAgeMs >= 0 &&
    currentAgeMs <= LIVE_PRESENCE_WINDOW_MS;

  const currentHub =
    currentLocationFresh &&
    finite(currentUser?.lat) &&
    finite(currentUser?.lng)
      ? resolveNearestHub(currentUser!.lat!, currentUser!.lng!, hubs)
      : null;

  return {
    generated_at: now.toISOString(),
    freshness_window_seconds: LIVE_PRESENCE_WINDOW_MS / 1000,
    current_user: {
      location_fresh: currentLocationFresh,
      location_updated_at: currentUpdated?.toISOString() ?? null,
      location_age_seconds: currentAge,
      current_hub: currentHub,
    },
    hubs: hubs
      .filter((hub) => hub.status === "approved")
      .map((hub) => {
        const bucket = counts.get(hub.id);
        return {
          hub_id: hub.id,
          hub_name: hub.name,
          live_user_count: bucket?.count ?? 0,
          last_location_at: bucket?.last != null ? new Date(bucket.last).toISOString() : null,
        };
      }),
  };
}
