/**
 * Groups legacy/local Diaspora Hub rows for Globe presentation only.
 *
 * Database identity is never changed here. Child Hub IDs continue to own
 * their communities, stories, pledges, and other relationships. The Globe
 * receives one marker for each canonical Hub and a `local_hubs` drill-down
 * summary for any folded-in local Hubs.
 *
 * Safety invariants:
 * - A child is hidden only when its declared primary Hub is present.
 * - Dangling primary_hub_id values remain visible instead of disappearing.
 * - Cycles cannot hide every Hub; only an actual parent present in the input
 *   can suppress a child.
 * - Metrics are aggregated exactly once per direct child.
 */

export type MergeableHub = {
  id: number;
  primary_hub_id?: number | null;
  anchor_city?: string | null;
  name: string;
  member_count: number;
  live_user_count: number;
  story_count: number;
  neighborhood_count: number;
  spiral_count: number;
  open_requests: number;
  activity: {
    active_helpers: number;
    requests_fulfilled: number;
    pool_balance: number;
  };
};

export type LocalHubSummary = {
  hub_id: number;
  name: string;
  member_count: number;
  story_count: number;
};

type MergedHub<T extends MergeableHub> = T & { local_hubs?: LocalHubSummary[] };

const addMetrics = (left: MergeableHub, right: MergeableHub): MergeableHub => ({
  id: left.id,
  name: left.name,
  member_count: left.member_count + right.member_count,
  live_user_count: left.live_user_count + right.live_user_count,
  story_count: left.story_count + right.story_count,
  neighborhood_count: left.neighborhood_count + right.neighborhood_count,
  spiral_count: left.spiral_count + right.spiral_count,
  open_requests: left.open_requests + right.open_requests,
  activity: {
    active_helpers: left.activity.active_helpers + right.activity.active_helpers,
    requests_fulfilled: left.activity.requests_fulfilled + right.activity.requests_fulfilled,
    pool_balance: left.activity.pool_balance + right.activity.pool_balance,
  },
});

export function mergeHubsForGlobeDisplay<T extends MergeableHub>(hubs: T[]): MergedHub<T>[] {
  if (hubs.length < 2) return hubs;

  const byId = new Map(hubs.map((hub) => [hub.id, hub]));
  const childrenByPrimary = new Map<number, T[]>();

  for (const hub of hubs) {
    if (hub.primary_hub_id == null || !byId.has(hub.primary_hub_id)) continue;
    const children = childrenByPrimary.get(hub.primary_hub_id) ?? [];
    children.push(hub);
    childrenByPrimary.set(hub.primary_hub_id, children);
  }

  return hubs
    .filter((hub) => hub.primary_hub_id == null || !byId.has(hub.primary_hub_id))
    .map((hub) => {
      const children = childrenByPrimary.get(hub.id);
      if (!children?.length) return hub;

      // The accumulator is deliberately MergeableHub rather than T: the
      // merged metrics are a new value and are not guaranteed to preserve
      // arbitrary fields added by a caller's subtype.
      const mergedMetrics = children.reduce<MergeableHub>(
        (acc, child) => addMetrics(acc, child),
        hub,
      );

      return {
        ...hub,
        member_count: mergedMetrics.member_count,
        live_user_count: mergedMetrics.live_user_count,
        story_count: mergedMetrics.story_count,
        neighborhood_count: mergedMetrics.neighborhood_count,
        spiral_count: mergedMetrics.spiral_count,
        open_requests: mergedMetrics.open_requests,
        activity: mergedMetrics.activity,
        local_hubs: [
          {
            hub_id: hub.id,
            name: hub.anchor_city ?? hub.name,
            member_count: hub.member_count,
            story_count: hub.story_count,
          },
          ...children.map((child) => ({
            hub_id: child.id,
            name: child.anchor_city ?? child.name,
            member_count: child.member_count,
            story_count: child.story_count,
          })),
        ],
      };
    });
}
