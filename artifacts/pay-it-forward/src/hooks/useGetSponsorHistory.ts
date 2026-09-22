import { useState, useEffect, useCallback } from "react";
import { authHeaders } from "@/lib/auth";

export interface SponsorHistoryEntry {
  id: number;
  request_id: number;
  amount: number;
  state: string;
  payment_type: string;
  sponsored_by: string | null;
  notes: string | null;
  created_at: string;
  request_title: string | null;
  request_category: string | null;
}

interface UseGetSponsorHistoryResult {
  data: SponsorHistoryEntry[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useGetSponsorHistory(userId: number | null): UseGetSponsorHistoryResult {
  const [data, setData] = useState<SponsorHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/users/${userId}/sponsor-history`, { headers: authHeaders() })
      .then(r => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json() as Promise<SponsorHistoryEntry[]>;
      })
      .then(d => {
        setData(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message ?? "Failed to load sponsor history");
        setLoading(false);
      });
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, refetch: load };
}
