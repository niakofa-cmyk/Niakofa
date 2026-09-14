import { describe, expect, it } from "@jest/globals";
import { mergeHubsForGlobeDisplay, type MergeableHub } from "../lib/diasporaHubMerge";

function hub(overrides: Partial<MergeableHub> & { id: number; name: string }): MergeableHub {
  return {
    primary_hub_id: null,
    anchor_city: null,
    member_count: 0,
    live_user_count: 0,
    story_count: 0,
    neighborhood_count: 0,
    spiral_count: 0,
    open_requests: 0,
    activity: { active_helpers: 0, requests_fulfilled: 0, pool_balance: 0 },
    ...overrides,
  };
}

describe("mergeHubsForGlobeDisplay", () => {
  it("collapses four Brazil city hubs into one Globe marker with summed metrics", () => {
    const hubs = [
      hub({ id: 5, name: "Salvador, Brazil", anchor_city: "Salvador", member_count: 100, story_count: 4 }),
      hub({ id: 11, name: "Recife, Brazil", anchor_city: "Recife", primary_hub_id: 5, member_count: 40, story_count: 1 }),
      hub({ id: 12, name: "São Luís, Brazil", anchor_city: "São Luís", primary_hub_id: 5, member_count: 20, story_count: 0 }),
      hub({ id: 13, name: "São Paulo, Brazil", anchor_city: "São Paulo", primary_hub_id: 5, member_count: 300, story_count: 2 }),
      hub({ id: 7, name: "Lagos, Nigeria" }),
    ];

    const result = mergeHubsForGlobeDisplay(hubs);

    expect(result.map((h) => h.id).sort()).toEqual([5, 7]);

    const brazil = result.find((h) => h.id === 5)!;
    expect(brazil.member_count).toBe(100 + 40 + 20 + 300);
    expect(brazil.story_count).toBe(4 + 1 + 0 + 2);
    expect(brazil.local_hubs).toEqual([
      { hub_id: 5, name: "Salvador", member_count: 100, story_count: 4 },
      { hub_id: 11, name: "Recife", member_count: 40, story_count: 1 },
      { hub_id: 12, name: "São Luís", member_count: 20, story_count: 0 },
      { hub_id: 13, name: "São Paulo", member_count: 300, story_count: 2 },
    ]);
  });

  it("does not attach local_hubs to a hub with no children", () => {
    const hubs = [hub({ id: 1, name: "Accra, Ghana", member_count: 50 })];
    const result = mergeHubsForGlobeDisplay(hubs);
    expect(result).toEqual(hubs);
    expect(result[0].local_hubs).toBeUndefined();
  });

  it("keeps a child visible if its declared primary_hub_id is not in the result set", () => {
    const hubs = [hub({ id: 11, name: "Recife, Brazil", primary_hub_id: 999, member_count: 40 })];
    const result = mergeHubsForGlobeDisplay(hubs);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(11);
  });

  it("sums activity metrics (active_helpers, requests_fulfilled, pool_balance) across merged children", () => {
    const hubs = [
      hub({ id: 5, name: "Salvador, Brazil", activity: { active_helpers: 2, requests_fulfilled: 1, pool_balance: 100 } }),
      hub({ id: 11, name: "Recife, Brazil", primary_hub_id: 5, activity: { active_helpers: 3, requests_fulfilled: 4, pool_balance: 50 } }),
    ];
    const result = mergeHubsForGlobeDisplay(hubs);
    expect(result).toHaveLength(1);
    expect(result[0].activity).toEqual({ active_helpers: 5, requests_fulfilled: 5, pool_balance: 150 });
  });
});
