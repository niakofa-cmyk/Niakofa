# Niakofa Diaspora Globe V5 reference

This reference records the V5 hardening package supplied for the current
post-V4 Niakofa source. The original attachment is
`Niakofa_Diaspora_Globe_V5_Hardening_1789579090807.zip`.

V5 preserves the canonical product hierarchy:

```text
Diaspora → Globe → Hub → Action
```

The implemented V5 contract:

- reduces the landing chrome to a compact search/reset dock;
- keeps search, fly-to, marker selection, Hub actions, and messaging intact;
- makes the selected-Hub drawer safe-area aware on mobile;
- adds `data-niakofa-surface="diaspora-globe"` for stable browser coverage;
- preserves Hub imagery, Family/Stories/Pool disclosure, local Hub drill-down,
  and bottom-right Mapbox controls;
- does not add fake relationship arcs, fake activity cards, global statistics,
  Home geography, or a global navigation rewrite.

The original uploaded package remains available in `attached_assets/`.