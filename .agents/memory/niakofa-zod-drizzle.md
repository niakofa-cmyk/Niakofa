---
name: Niakofa Zod/drizzle-zod version contract
description: drizzle-zod v0.8.x emits Zod v4 types; zod/v4 import is valid in zod@3.25.76+
---

## Rule
`import { z } from "zod/v4"` is the CORRECT import in lib/db schema files that use `createInsertSchema` from `drizzle-zod`.

**Why:** drizzle-zod v0.8.x uses Zod v4 types internally. The installed zod@3.25.76+ includes a `/v4` subpath export. Changing to `import { z } from "zod"` (v3 main export) causes TS2344 type errors because v3's `ZodType<any,any,any>` constraint has different internals (`_type`, `_parse`, `_getType`, etc.) than v4's `ZodObject`.

**How to apply:** Any schema file using `drizzle-zod`'s `createInsertSchema` and then `z.infer<typeof schema>` must import `z` from `"zod/v4"`, not `"zod"`.
