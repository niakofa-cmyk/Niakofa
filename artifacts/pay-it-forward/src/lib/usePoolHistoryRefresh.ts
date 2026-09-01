/**
 * Keep Profile → History current after pool settlement/refund events without
 * requiring a logout or a page reload.
 */
import { useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/lib/useWebSocket";

export function usePoolHistoryRefresh(userId: number | null | undefined): void {
  const queryClient = useQueryClient();

  const invalidateTransactions = useCallback(() => {
    if (!userId) return;
    void queryClient.invalidateQueries({
      predicate: (query) => {
        const key = JSON.stringify(query.queryKey);
        return key.includes("transactions") || key.includes("Transactions");
      },
    });
  }, [queryClient, userId]);

  useWebSocket("pool_updated", invalidateTransactions);
  useWebSocket("ws_reconnected", invalidateTransactions);

  useEffect(() => {
    if (!userId) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") invalidateTransactions();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [invalidateTransactions, userId]);
}