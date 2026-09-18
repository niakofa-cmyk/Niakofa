const ACTIVE_REQUEST_STATUSES = new Set(["claimed", "en_route", "arrived"]);

type RequestNavigationInput = {
  id: number;
  status: string;
  requesterId: number;
  helperId: number | null;
  currentUserId: number;
};

/**
 * Keep request-center links role-aware:
 * helpers need the action/navigation screen, requesters need the live tracker,
 * and everyone else gets the read-only detail screen.
 */
export function getRequestNavigationPath({
  id,
  status,
  requesterId,
  helperId,
  currentUserId,
}: RequestNavigationInput): string {
  if (ACTIVE_REQUEST_STATUSES.has(status) && helperId === currentUserId) {
    return `/request/${id}`;
  }
  if (ACTIVE_REQUEST_STATUSES.has(status) && requesterId === currentUserId) {
    return `/request/${id}/track`;
  }
  return `/request/${id}/view`;
}