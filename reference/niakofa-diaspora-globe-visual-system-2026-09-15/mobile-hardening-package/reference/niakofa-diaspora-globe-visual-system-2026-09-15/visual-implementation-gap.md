# Visual Concept vs Current Implementation

## Implemented

The current repository contains the desktop and mobile visual reference boards,
design tokens, implementation map, and architecture review.

Production `/diaspora` now uses the Globe-first pattern and the current
`DiasporaGlobeFirst` component provides:

- interactive Mapbox globe
- country/state Hub markers
- Hub search
- canonical Hub details
- Community action
- Message Hub action
- Spirals action
- progressive More section
- Stories
- Pool
- local-community summary
- authenticated Hub-to-Hub messaging

## Partially implemented

The visual concept includes ideas such as:

- live connections
- memory visualization
- richer activity effects

The production component currently has restrained marker glow/pulse and crisis
state, but it does not fabricate network connections or a separate memory layer.

## Why that is correct

Those visual layers should be driven by real data:

- Hub-to-Hub relationship data for connection lines
- Story/memory/place data for memory visualization
- presence data for live activity

Adding fake lines or fake memory signals would make the UI look richer while
making the product less truthful.

The next visual phase should therefore be data-backed rather than purely
decorative.
