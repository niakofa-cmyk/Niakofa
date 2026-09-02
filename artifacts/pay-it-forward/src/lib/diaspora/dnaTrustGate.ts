export interface DnaConnectionState {
  status: "not_connected" | "upload_received" | "parsing" | "ready" | "failed";
  hasParsedDataset: boolean;
  matchCount: number | null;
  ethnicityAvailable: boolean;
}

/** Keep DNA UI honest until a supported dataset is actually parsed. */
export function safeDnaPresentation(state: DnaConnectionState | null | undefined) {
  const connected = state?.hasParsedDataset === true && state.status === "ready";
  return {
    connected,
    headline: connected ? "DNA connected" : "Connect DNA data",
    body: connected
      ? "Matches and ancestry estimates come only from your connected dataset."
      : "Until a supported DNA dataset is connected and parsed, Niakofa will not show match counts or ethnicity results.",
    showMatchCount: connected && state?.matchCount != null,
    matchCount: connected ? state?.matchCount ?? null : null,
    showEthnicity: connected && state?.ethnicityAvailable === true,
  };
}