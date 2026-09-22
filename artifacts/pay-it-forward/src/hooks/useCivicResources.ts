import { useEffect, useRef, useState } from "react";
import { useStableCenter } from "./useStableCenter";

export interface CivicResource {
  id: number;
  org_name: string;
  description: string | null;
  url: string;
  phone: string | null;
  category: string | null;
  address: string | null;
  open_hours: string | null;
  coverage_status?: string;
  is_authoritative?: boolean;
  city?: string | null;
  county?: string | null;
  state?: string | null;
}

export interface CivicResourcesResponse {
  resources: CivicResource[];
  place_name: string;
  city: string | null;
  county: string | null;
  state: string | null;
  match_level: "city" | "county" | "state" | "fallback";
}

interface CivicLocation {
  lat: number;
  lng: number;
}

// Keep this cache in memory only. It prevents a tab switch/remount from
// flashing an empty civic panel, without persisting location-sensitive data
// across sessions or devices.
const responseCache = new Map<string, CivicResourcesResponse>();

function locationKey(location: CivicLocation | null): string | null {
  return location ? `${location.lat.toFixed(3)}:${location.lng.toFixed(3)}` : null;
}

function isCivicResourcesResponse(value: unknown): value is CivicResourcesResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<CivicResourcesResponse>;
  return (
    Array.isArray(response.resources) &&
    typeof response.place_name === "string" &&
    (response.match_level === "city" ||
      response.match_level === "county" ||
      response.match_level === "state" ||
      response.match_level === "fallback")
  );
}

export function useCivicResources(
  location: CivicLocation | null | undefined,
  options: { debounceMs?: number } = {},
) {
  const stableLocation = useStableCenter(location, {
    precision: 3,
    debounceMs: options.debounceMs ?? 4000,
  });
  const initialKey = locationKey(
    location
      ? {
          lat: Number(location.lat.toFixed(3)),
          lng: Number(location.lng.toFixed(3)),
        }
      : null,
  );
  const [data, setData] = useState<CivicResourcesResponse | null>(() =>
    initialKey ? responseCache.get(initialKey) ?? null : null,
  );
  const [loading, setLoading] = useState(false);
  const requestSequence = useRef(0);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    const key = locationKey(stableLocation);
    if (!stableLocation || !key) {
      setLoading(false);
      return;
    }

    const cached = responseCache.get(key);
    if (cached) setData(cached);
    setLoading(true);

    const controller = new AbortController();
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

    fetch(
      `${base}/api/civic/resources?lat=${stableLocation.lat}&lng=${stableLocation.lng}`,
      { signal: controller.signal },
    )
      .then(async response => {
        if (!response.ok) throw new Error("Unable to resolve civic resources");
        const payload: unknown = await response.json();
        if (!isCivicResourcesResponse(payload)) {
          throw new Error("Invalid civic resources response");
        }
        return payload;
      })
      .then(nextData => {
        if (controller.signal.aborted || requestSequence.current !== requestId) return;
        responseCache.set(key, nextData);
        setData(nextData);
      })
      .catch(error => {
        if (controller.signal.aborted || requestSequence.current !== requestId) return;
        // A network blip must not erase the last verified jurisdiction or its
        // resources. A later coordinate change or remount retries normally.
        if (error instanceof Error && error.name === "AbortError") return;
      })
      .finally(() => {
        if (!controller.signal.aborted && requestSequence.current === requestId) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
    // The stable center object is intentionally represented by scalar
    // coordinates here; useStableCenter keeps those values stable between
    // accepted location changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableLocation?.lat, stableLocation?.lng]);

  return {
    data,
    loading,
    hasLocation: stableLocation !== null,
  };
}