export type ExchangeListingType = "offer" | "need";
export type ExchangeResourceType = "goods" | "services";
export type ExchangeCategory = "household" | "clothing" | "food" | "books" | "electronics" | "children" | "other";
export type ExchangeCondition = "new" | "like_new" | "good" | "well_loved";
export type PickupStatus = "requested" | "accepted" | "declined" | "cancelled" | "completed";

export interface ExchangeListing {
  id: number;
  seller_id: number;
  listing_type: ExchangeListingType;
  resource_type: ExchangeResourceType;
  title: string;
  description: string;
  category: ExchangeCategory;
  condition: ExchangeCondition;
  neighborhood: string;
  pickup_notes?: string | null;
  status: string;
  moderation_status: string;
  seller_name?: string | null;
  seller_avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExchangePickupRequest {
  id: number;
  listing_id: number;
  buyer_id: number;
  note: string;
  pickup_area: string;
  proposed_window: string;
  status: PickupStatus;
  buyer_confirmed_at?: string | null;
  seller_confirmed_at?: string | null;
  accepted_at?: string | null;
  cancelled_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  listing_title?: string | null;
  listing_status?: string | null;
  seller_id?: number | null;
  seller_name?: string | null;
  buyer_name?: string | null;
}

export interface ExchangeListingResponse {
  listing: ExchangeListing;
}

export interface ExchangeListingsResponse {
  listings: ExchangeListing[];
  next_cursor?: string | null;
}

export interface ExchangePickupRequestsResponse {
  pickup_requests: ExchangePickupRequest[];
}