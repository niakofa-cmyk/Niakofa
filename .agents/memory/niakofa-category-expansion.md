---
name: Niakofa category taxonomy — where to update
description: All the places that must be updated when adding new request categories
---

# Category Taxonomy — Full Update Checklist

When adding new categories, update ALL of these:

1. **`artifacts/pay-it-forward/src/pages/request-new.tsx`**
   - `CATEGORIES` array (display list with emoji + label)
   - `formSchema.category z.enum([...])` — must stay in sync with CATEGORIES values

2. **`lib/api-zod/src/generated/types/helpRequestInputCategory.ts`**
   - Add new values to the `HelpRequestInputCategory` enum object
   - These are **generated but must be hand-edited** when orval cannot re-run

3. **`lib/api-zod/src/generated/types/helpRequestCategory.ts`**
   - Same as above — the read-side type

4. **`lib/api-spec/openapi.yaml`**
   - Two `enum:` lines listing categories (around lines 1990 and 2053 in current file)
   - Use sed or manual edit to append new values

5. **`lib/trust-tiers/src/index.ts`** (conditional)
   - `SENSITIVE_CATEGORIES` — only if the new category warrants trust/BG-check gating
   - Current sensitive: childcare, senior_care, medical, home_repair, moving_labor, pet_care, tutoring

6. **`artifacts/api-server/src/routes/requests.ts`** (conditional)
   - `WAIVER_GATED_CATEGORIES` — only if ToS waiver required before posting
   - Current waiver-gated: childcare, senior_care, medical, home_repair, moving_labor

**Why:** The server validates categories via `CreateRequestBody` from `@workspace/api-zod`, which uses the generated enum. If the generated file is not updated, the API rejects the new category even though the frontend allows it.

## Current expanded categories (2026-07)
legal_aid, financial_coaching, job_assistance, language_help, mental_health_peer, technology_help
(none are sensitive or waiver-gated — intentional for v1)
