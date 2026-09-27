export type ExchangeListingType = "offer" | "need";
export type ExchangeResourceType = "goods" | "services";
export type ExchangeCategory = "household" | "clothing" | "food" | "books" | "electronics" | "children" | "urgent_aid" | "other";
export type ExchangeCondition = "new" | "like_new" | "good" | "well_loved";
export type ExchangePickupLocationType = "public_place" | "community_center" | "library" | "park" | "business_parking" | "other_public";
export type PickupStatus = "requested" | "accepted" | "declined" | "cancelled" | "expired" | "completed" | "disputed";

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
  pickup_location_type?: ExchangePickupLocationType | null;
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
  pickup_location_type?: ExchangePickupLocationType | null;
  pickup_note?: string | null;
  status: PickupStatus;
  buyer_confirmed_at?: string | null;
  seller_confirmed_at?: string | null;
  accepted_at?: string | null;
  coordination_expires_at?: string | null;
  cancelled_at?: string | null;
  expired_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  listing_title?: string | null;
  listing_status?: string | null;
  seller_id?: number | null;
  seller_name?: string | null;
  buyer_name?: string | null;
  dispute?: {
    status?: string | null;
    reason?: string | null;
    evidence?: string | null;
    opened_at?: string | null;
    resolution?: string | null;
    resolved_at?: string | null;
  } | null;
  dispute_status?: string | null;
  dispute_reason?: string | null;
  dispute_evidence?: string | null;
  dispute_opened_at?: string | null;
  dispute_resolution?: string | null;
  dispute_resolved_at?: string | null;
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