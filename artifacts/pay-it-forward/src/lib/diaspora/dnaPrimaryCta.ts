/**
 * Select the one next action that moves a DNA connection through its
 * consent-first dependency order: import → opt in → refresh.
 */
export type DnaPrimaryCta = "import" | "opt_in" | "refresh" | "disabled";

export function dnaPrimaryCta(state: {
  enabled: boolean;
  hasProfile: boolean;
  optedIn: boolean;
}): DnaPrimaryCta {
  if (!state.enabled) return "disabled";
  if (!state.hasProfile) return "import";
  if (!state.optedIn) return "opt_in";
  return "refresh";
}