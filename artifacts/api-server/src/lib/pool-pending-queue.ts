export interface PendingMinimumScope {
  community_id: number | null;
  hub_id: number | null;
}

/**
 * Group pending obligations by their isolated fund while retaining the input
 * order within every group. The caller must provide rows ordered by
 * created_at/id so each group remains FIFO.
 */
export function groupPendingMinimumsByScope<T extends PendingMinimumScope>(
  rows: T[],
): T[][] {
  const queues = new Map<string, T[]>();
  for (const row of rows) {
    const scopeKey = `community:${row.community_id ?? "global"}|hub:${row.hub_id ?? "unrestricted"}`;
    const queue = queues.get(scopeKey);
    if (queue) queue.push(row);
    else queues.set(scopeKey, [row]);
  }
  return [...queues.values()];
}