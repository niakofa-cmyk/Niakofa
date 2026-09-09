# Boundary Imports → Host Signal (operator runbook)

## Why rows used to "disappear"

The default queue is **Needs review** (`geometry_valid && !reviewed`).
Clicking **Mark reviewed** correctly moves the row out of that queue.

As of PR #65 (`2da6c1e`), the Admin UI auto-switches to the next queue and shows a transition banner.

## Correct workflow (Fort Worth / Kansas City, MO)

1. Admin → **Operations** → **Boundary Imports (GIS)**
2. Filter city if needed (Fort Worth / Kansas City, MO)
3. **Needs review** → **Mark reviewed**
   - UI switches to **Reviewed**
   - Banner: row remains visible in Reviewed
4. **Verify geometry**
   - UI switches to **Ready to promote**
5. **Promote → Host Signal**
   - UI switches to **GPS Active**
6. City Authority Summary counts update; Host Signal may use the boundary

## Safety gates (do not weaken)

Promotion requires all of:

- `reviewed = true`
- `geometry_valid = true`
- `geometry_verified = true`
- source is **not** generated_hint / generated

Promote writes `city_neighborhoods` with:

- `verified = true`
- `geometry_verified = true`
- `source = authoritative_import`
- publisher, URL, version, retrieval timestamp

## Revoke

From **GPS Active** production list → **Revoke** clears `verified` + `geometry_verified` on the production row (staged GIS import unchanged).

## APIs

| Method | Path |
|--------|------|
| GET | `/api/admin/neighborhood-boundary-imports` |
| PATCH | `/api/admin/neighborhood-boundary-imports/:id/review` |
| POST | `/api/admin/neighborhood-boundary-imports/:id/promote` |
| PATCH | `/api/admin/city-neighborhoods/:id` (revoke) |

All require auth + admin.

## Live mutation test

Opt-in Playwright: `ADMIN_E2E_MUTATION=true` (disabled by default so CI cannot mutate production).
