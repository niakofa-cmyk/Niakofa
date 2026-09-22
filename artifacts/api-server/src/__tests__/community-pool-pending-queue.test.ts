import { describe, expect, it } from "@jest/globals";
import { groupPendingMinimumsByScope } from "../lib/pool-pending-queue.js";

describe("Community Pool pending minimum queues", () => {
  it("keeps FIFO within each fund without letting one depleted fund block another", () => {
    const queues = groupPendingMinimumsByScope([
      { id: 1, community_id: 7, hub_id: null },
      { id: 2, community_id: 9, hub_id: null },
      { id: 3, community_id: 7, hub_id: null },
      { id: 4, community_id: null, hub_id: 11 },
    ]);

    expect(queues.map((queue) => queue.map((row) => row.id))).toEqual([
      [1, 3],
      [2],
      [4],
    ]);
  });

  it("does not merge unrestricted, hub, and community scopes", () => {
    const queues = groupPendingMinimumsByScope([
      { id: 1, community_id: null, hub_id: null },
      { id: 2, community_id: null, hub_id: 3 },
      { id: 3, community_id: 3, hub_id: null },
      { id: 4, community_id: null, hub_id: null },
    ]);

    expect(queues.map((queue) => queue.map((row) => row.id))).toEqual([
      [1, 4],
      [2],
      [3],
    ]);
  });
});