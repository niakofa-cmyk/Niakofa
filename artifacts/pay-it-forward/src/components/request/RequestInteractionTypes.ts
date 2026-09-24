export type RequestInteractionSummary = {
  id: number;
  title: string;
  status: string;
  requester_id: number;
  helper_id?: number | null;
  requester_name?: string | null;
  helper_name?: string | null;
  requester_avatar?: string | null;
  helper_avatar?: string | null;
  category?: string | null;
  neighborhood?: string | null;
  description?: string | null;
};

export type RequestRouteSummary = {
  eta_text?: string | null;
  distance_text?: string | null;
  duration_seconds?: number | null;
  steps?: Array<{
    instruction?: string | null;
    distance_meters?: number | null;
  }>;
};