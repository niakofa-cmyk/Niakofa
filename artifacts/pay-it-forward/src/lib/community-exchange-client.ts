import { authHeaders } from "@/lib/auth";
import type {
  ExchangeCategory,
  ExchangeCondition,
  ExchangeListing,
  ExchangeListingType,
  ExchangeListingsResponse,
  ExchangePickupLocationType,
  ExchangePickupRequest,
  ExchangePickupRequestsResponse,
  ExchangeResourceType,
} from "@/lib/community-exchange-types";

interface RequestOptions extends RequestInit {
  body?: BodyInit | null;
}

async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : "Something went wrong. Please try again.";
    throw new Error(message);
  }

  return payload as T;
}

export interface ListingQuery {
  type?: ExchangeListingType;
  resource_type?: ExchangeResourceType;
  q?: string;
  neighborhood?: string;
  mine?: boolean;
  nearby?: boolean;
  radius_miles?: number;
  cursor?: string | null;
  limit?: number;
}

export interface ExchangeSpark {
  id: number;
  listing_id: number;
  caption: string | null;
  created_at: string;
  expires_at: string | null;
  media_url: string;
  thumbnail_url: string | null;
  neighborhood: string;
  durable?: boolean;
  author_name?: string;
  author_avatar_url?: string | null;
}

export interface ExchangeSparksResponse {
  sparks: ExchangeSpark[];
  next_cursor: string | null;
}

export interface ExchangeSparksQuery {
  nearby?: boolean;
  radius_miles?: number;
  limit?: number;
  cursor?: string | null;
  signal?: AbortSignal;
}

export async function getExchangeSparks(query: ExchangeSparksQuery = {}): Promise<ExchangeSparksResponse> {
  const params = new URLSearchParams();
  if (query.nearby) params.set("nearby", "true");
  if (query.radius_miles) params.set("radius_miles", String(Math.min(50, Math.max(1, Math.round(query.radius_miles)))));
  if (query.limit) params.set("limit", String(Math.min(24, Math.max(1, Math.round(query.limit)))));
  if (query.cursor) params.set("cursor", query.cursor);
  const suffix = params.toString();
  return request<ExchangeSparksResponse>(`/api/community/exchange/sparks${suffix ? `?${suffix}` : ""}`, {
    signal: query.signal,
  });
}

export async function getExchangeListings(query: ListingQuery): Promise<ExchangeListingsResponse> {
  const params = new URLSearchParams();
  if (query.type) params.set("type", query.type);
  if (query.resource_type) params.set("resource_type", query.resource_type);
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.neighborhood?.trim()) params.set("neighborhood", query.neighborhood.trim());
  if (query.mine) params.set("mine", "true");
  if (query.nearby) params.set("nearby", "true");
  if (query.radius_miles) params.set("radius_miles", String(query.radius_miles));
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));
  const suffix = params.toString();
  return request<ExchangeListingsResponse>(`/api/community/exchange/listings${suffix ? `?${suffix}` : ""}`);
}

export async function getExchangeListing(id: number): Promise<{ listing: ExchangeListing }> {
  return request<{ listing: ExchangeListing }>(`/api/community/exchange/listings/${id}`);
}

export interface CreateListingInput {
  listing_type: ExchangeListingType;
  resource_type: ExchangeResourceType;
  title: string;
  description: string;
  category: ExchangeCategory;
  condition: ExchangeCondition;
  neighborhood: string;
  pickup_location_type: ExchangePickupLocationType;
  pickup_notes?: string;
}

export async function createExchangeListing(data: CreateListingInput): Promise<{ listing: ExchangeListing; message: string }> {
  return request<{ listing: ExchangeListing; message: string }>("/api/community/exchange/listings", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export type UpdateListingInput = Partial<CreateListingInput>;

export async function updateExchangeListing(id: number, data: UpdateListingInput): Promise<{ listing: ExchangeListing; message: string }> {
  return request<{ listing: ExchangeListing; message: string }>(`/api/community/exchange/listings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function renewExchangeListing(id: number): Promise<{ listing: ExchangeListing }> {
  return request<{ listing: ExchangeListing }>(`/api/community/exchange/listings/${id}/renew`, {
    method: "POST",
  });
}

export async function getExchangePickupRequests(): Promise<ExchangePickupRequestsResponse> {
  return request<ExchangePickupRequestsResponse>("/api/community/exchange/pickup-requests");
}

export interface CreatePickupRequestInput {
  note: string;
  pickup_area: string;
  proposed_window: string;
  pickup_location_type: ExchangePickupLocationType;
  pickup_note?: string;
}

export async function createExchangePickupRequest(id: number, data: CreatePickupRequestInput): Promise<{ pickup_request: ExchangePickupRequest }> {
  return request<{ pickup_request: ExchangePickupRequest }>(`/api/community/exchange/listings/${id}/pickup-requests`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export type PickupAction = "accept" | "decline" | "cancel" | "confirm-complete";

export async function updateExchangePickupRequest(
  id: number,
  action: PickupAction,
): Promise<{ pickup_request: ExchangePickupRequest; awaiting_other_confirmation?: boolean }> {
  return request<{ pickup_request: ExchangePickupRequest; awaiting_other_confirmation?: boolean }>(`/api/community/exchange/pickup-requests/${id}/${action}`, {
    method: "POST",
  });
}

export async function disputeExchangePickupRequest(
  id: number,
  data: { reason: string; evidence?: string },
): Promise<{ pickup_request: ExchangePickupRequest; message?: string }> {
  return request<{ pickup_request: ExchangePickupRequest; message?: string }>(`/api/community/exchange/pickup-requests/${id}/dispute`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export type ExchangeReportType = "fraud" | "harassment" | "dangerous_behavior" | "spam" | "other";

export async function reportExchangeListing(id: number, data: { type: ExchangeReportType; description: string }): Promise<{ message: string }> {
  return request<{ message: string }>(`/api/community/exchange/listings/${id}/report`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}