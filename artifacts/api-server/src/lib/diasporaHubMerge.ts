/**
 * Globe *display* grouping only. A legacy local-city Diaspora Hub row
 * (primary_hub_id set) is folded into its country's canonical hub so the
 * Globe renders one marker per country instead of one per historical city
 * seed (see migration 0137_diaspora_hub_country_merge.sql for why this
 * exists — three pre-existing Brazil city hubs never got proper country
 * geography metadata and each rendered as a separate marker).
 *
 * This never mutates or drops the underlying hub rows: community_id,
 * stories, pledges, hub_community_leaders, and every other relationship
 * stay tied to the original per-city hub id. Only the array returned for
 * Globe rendering merges numeric metrics onto the canonical row and lists
 * the folded-in cities under `local_hubs` for drill-down.
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
  activity: { active_helpers: number; requests_fulfilled: number; pool_balance: number };
};

export type LocalHubSummary = { hub_id: number; name: string; member_count: number; story_count: number };

export function mergeHubsForGlobeDisplay<T extends MergeableHub>(
  hubs: T[]
): (T & { local_hubs?: LocalHubSummary[] })[] {
  const byId = new Map(hubs.map((hub) => [hub.id, hub]));
  return hubs
    // A child only disappears from the top-level Globe list if its declared
    // primary actually exists in this result set; an orphaned/dangling
    // primary_hub_id must never silently drop a hub from the map.
    .filter((hub) => hub.primary_hub_id == null || !byId.has(hub.primary_hub_id))
    .map((hub) => {
      const children = hubs.filter((candidate) => candidate.primary_hub_id === hub.id);
      if (children.length === 0) return hub;
      const merged = children.reduce(
        (acc, child) => ({
          member_count: acc.member_count + child.member_count,
          live_user_count: acc.live_user_count + child.live_user_count,
          story_count: acc.story_count + child.story_count,
          neighborhood_count: acc.neighborhood_count + child.neighborhood_count,
          spiral_count: acc.spiral_count + child.spiral_count,
          open_requests: acc.open_requests + child.open_requests,
          active_helpers: acc.active_helpers + child.activity.active_helpers,
          requests_fulfilled: acc.requests_fulfilled + child.activity.requests_fulfilled,
          pool_balance: acc.pool_balance + child.activity.pool_balance,
        }),
        {
          member_count: hub.member_count,
          live_user_count: hub.live_user_count,
          story_count: hub.story_count,
          neighborhood_count: hub.neighborhood_count,
          spiral_count: hub.spiral_count,
          open_requests: hub.open_requests,
          active_helpers: hub.activity.active_helpers,
          requests_fulfilled: hub.activity.requests_fulfilled,
          pool_balance: hub.activity.pool_balance,
        }
      );
      return {
        ...hub,
        member_count: merged.member_count,
        live_user_count: merged.live_user_count,
        story_count: merged.story_count,
        neighborhood_count: merged.neighborhood_count,
        spiral_count: merged.spiral_count,
        open_requests: merged.open_requests,
        activity: {
          active_helpers: merged.active_helpers,
          requests_fulfilled: merged.requests_fulfilled,
          pool_balance: merged.pool_balance,
        },
        local_hubs: [
          { hub_id: hub.id, name: hub.anchor_city ?? hub.name, member_count: hub.member_count, story_count: hub.story_count },
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
