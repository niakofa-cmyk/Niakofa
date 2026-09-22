# Niakofa Diaspora Globe V4 reference

This reference records the V4 hardening package supplied for the current
post-V3 Niakofa source. The original attachment is
`Niakofa_Diaspora_Globe_V4_Hardening_1789576066548.zip`.

V4 preserves the product hierarchy:

```text
Diaspora → Globe → Hub → Action
```

The implemented V4 contract adds:

- optional authoritative HTTPS Hub imagery after Hub selection;
- contextual Family access behind `More from <Hub>`;
- fail-closed self-parent and canonical-geography validation;
- a read-only geography audit;
- bottom-right Globe zoom/compass controls for mobile clearance;
- browser coverage for selected-Hub imagery and contextual Family access.

The package intentionally does not add fake relationship arcs, dashboard cards,
global statistics, live gathering objects, or changes to the global BottomNav.
The original uploaded package remains available in `attached_assets/`.