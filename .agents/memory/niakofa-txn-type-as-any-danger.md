---
name: Niakofa transaction insert `as any` danger
description: Why `as any` on a transactionsTable.insert() call is a red flag, and where the enum source of truth lives.
---
- `transactions.type` has NO enum constraint at the Postgres/Drizzle layer (plain `text`) — the only place `TransactionType` is an enum is the OpenAPI spec (`lib/api-spec/openapi.yaml`, `Transaction` schema) → generated into `lib/api-zod`.
- A real bug slipped through because an insert cast `type: "..." as any` (to bypass a genuinely-missing enum value) and `note: ...` (a field the schema does not have — the real column is `description`) in the *same* `as any`-covered call. The cast hid both a missing enum value and a wrong field name at once.
- **Why:** `as any` on any `db.insert(...).values(...)` call defeats the only compile-time check protecting against typo'd/renamed columns — treat it as a signal to stop and check the schema file directly rather than trusting the shape.
- **How to apply:** when a new transaction/ledger `entry_type`/`type` value is needed, add it to the OpenAPI enum first, run orval codegen (`npx orval --config lib/api-spec/orval.config.ts` from `lib/api-spec/`), then use the plain generated type with no cast.
