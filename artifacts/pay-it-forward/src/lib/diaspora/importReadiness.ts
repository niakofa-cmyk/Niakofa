/** Readiness checklist shown beside DNA Connections consent controls. */
export function dnaImportReadiness(input: {
  engineEnabled: boolean;
  hasReadyProfile: boolean;
  optedIn: boolean;
}) {
  const steps = [
    { key: "engine", ok: input.engineEnabled, label: "Matching engine enabled by operator" },
    { key: "profile", ok: input.hasReadyProfile, label: "Ready derived DNA profile for this Family Space" },
    { key: "consent", ok: input.optedIn, label: "Explicit opt-in consent" },
  ] as const;
  return {
    ready: steps.every((step) => step.ok),
    steps,
    nextAction: !input.engineEnabled
      ? "Matching is disabled in this environment."
      : !input.hasReadyProfile
        ? "Import and validate a supported DNA export first."
        : !input.optedIn
          ? "Opt in to private relative matching."
          : "Refresh candidates and review in Research.",
  };
}