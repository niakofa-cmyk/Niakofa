# Production authoritative neighborhood ingest

## Purpose

`neighborhood_boundary_imports` is intentionally staged data. A successful ingest does **not** review, geometry-verify, or promote a neighborhood. Host Signal eligibility remains a separate Admin decision.

## Explicit production ingest

From a trusted checkout with the production `DATABASE_URL` available:

```bash
pnpm --filter @workspace/scripts run ingest:neighborhoods:all
```

This runs the existing fail-closed importer for:

- `fort_worth` — City of Fort Worth GIS Neighborhood Alliances
- `kansas_city_missouri` — Kansas City, Missouri Open Data `vq6h-tqrf` Neighborhood Borders

The command is sequential so one failed source cannot be mistaken for a successful all-city ingest. Existing importer protections refuse empty or unnamed/invalid authoritative imports.

## Safety boundary

The ingest command only creates staged rows. Every imported row starts with:

- `reviewed = false`
- `geometry_verified = false`
- `geometry_valid = true` only after structural validation
- authoritative source provenance

It does **not** call the Admin review or promotion APIs.

## Admin workflow

After ingest, open **Admin → Operations → Boundary Imports (GIS)**:

1. **Needs review** — inspect the authoritative source and geometry.
2. **Mark reviewed** — moves the row to **Reviewed** without clearing an existing geometry verification state.
3. **Verify geometry** — explicit geometry gate.
4. **Ready to promote** — final human review queue.
5. **Promote → Host Signal** — creates/updates the GPS-active production neighborhood.
6. **GPS Active** — production state can be revoked without modifying the staged GIS import.

Generated hints never enter the verification/promotion path.

## Empty queues

An empty queue is not evidence that a review was deleted. First check **All rows** and the City Authority Summary. If all staged counts are zero, run the explicit ingest command above and verify that the Admin API and importer use the same production database.
