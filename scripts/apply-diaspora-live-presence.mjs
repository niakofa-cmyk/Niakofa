#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const file = (name) => path.join(root, name);
function backup(target) { const stamp = new Date().toISOString().replace(/[:.]/g, "-"); const backupPath = `${target}.bak-${stamp}`; fs.copyFileSync(target, backupPath); return backupPath; }
function replaceOnce(target, needle, replacement, label) {
  const source = fs.readFileSync(target, "utf8");
  if (!source.includes(needle)) throw new Error(`Anchor not found in ${path.relative(root, target)}: ${label}`);
  backup(target); fs.writeFileSync(target, source.replace(needle, replacement));
}
const usersSchema = file("lib/db/src/schema/users.ts");
replaceOnce(usersSchema, '  speed: real("speed"),\n', '  speed: real("speed"),\n  location_updated_at: timestamp("location_updated_at", { withTimezone: true }),\n', "users.location_updated_at");
const hubsSchema = file("lib/db/src/schema/diaspora-hubs.ts");
replaceOnce(hubsSchema, '  lng:          doublePrecision("lng").notNull(),\n', '  lng:          doublePrecision("lng").notNull(),\n  presence_radius_km: doublePrecision("presence_radius_km").notNull().default(35),\n', "diaspora_hubs.presence_radius_km");
const index = file("artifacts/api-server/src/routes/index.ts");
replaceOnce(index, 'import { Router, type IRouter } from "express";\n', 'import { Router, type IRouter } from "express";\nimport { eq } from "drizzle-orm";\nimport { db, usersTable } from "@workspace/db";\n', "index DB imports");
replaceOnce(index, 'import diasporaRouter from "./diaspora";\n', 'import diasporaRouter from "./diaspora";\nimport diasporaLivePresenceRouter from "./diaspora-live-presence";\nimport { requireAuth } from "../middlewares/auth";\nimport { requireOwnership, resolveMeParam } from "../middlewares/authz";\n', "live presence imports");
replaceOnce(index, 'router.use(healthRouter);\n', 'router.patch("/users/:id/location", requireAuth, resolveMeParam, requireOwnership(), async (req, _res, next) => {\n  try { await db.update(usersTable).set({ location_updated_at: new Date() }).where(eq(usersTable.id, Number(req.params.id))); next(); }\n  catch (error) { next(error); }\n});\n\nrouter.use(healthRouter);\n', "GPS freshness middleware");
replaceOnce(index, 'router.use(griotRouter);\n', 'router.use(griotRouter);\nrouter.use(diasporaLivePresenceRouter);\n', "live presence router mount");
console.log("Diaspora live presence core wiring applied.");
