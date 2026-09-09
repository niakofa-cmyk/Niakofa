# Admin GIS: 429 + Verify Geometry

## Root causes of "missing Verify Geometry" / disappearing rows

1. **adminLimiter was 30/15 min** — Admin 2.0 polls many endpoints; 429 emptied the React queue.
2. **Filter UX** — Mark Reviewed moves the row out of Needs review; Verify Geometry only renders on **Reviewed** rows (`reviewed && !geometry_verified`).

## Fixes (this PR)

- `adminLimiter`: **300 / 15 minutes** per admin userId
- GIS load: **do not clear rows** on 429; show error banner
- Stage badges: `REVIEWED — VERIFY GEOMETRY`
- **Verify Geometry** confirm dialog (metadata only — does not regenerate polygon)
- Empty queue: CTA **Show Reviewed (N) — Verify Geometry** when reviewed count > 0

## Operator path after deploy

1. Wait for rate-limit window to clear (or redeploy with 300 limit)
2. Operations → Boundary Imports → click **Reviewed** (or the CTA)
3. **Verify Geometry** on one Fort Worth row
4. **Ready to promote** → **Promote → Host Signal**
5. Confirm GPS Active; staged import remains

Do **not** re-ingest 253 boundaries to "bring rows back."
