import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs"; import path from "node:path";
const root=path.resolve(import.meta.dirname,".."); const read=p=>fs.readFileSync(path.join(root,p),"utf8");
test("unified realtime migration provides durable replay log",()=>{const s=read("lib/db/migrations/0153_realtime_event_log.sql");assert.match(s,/realtime_event_log/);assert.match(s,/event_id uuid PRIMARY KEY/);assert.match(s,/idempotency_key text UNIQUE/);assert.match(s,/payload jsonb/);});
test("server publication is durable-first",()=>{const s=read("artifacts/api-server/src/lib/unified-events.ts");assert.match(s,/await persistUnifiedEvent\(event\)/);assert.match(s,/sendToUser/);assert.match(s,/unified_event/);});
test("client normalizes legacy events and persists a replay cursor",()=>{const s=read("artifacts/pay-it-forward/src/lib/unifiedRealtime.ts");assert.match(s,/direct_message:"message.created"/);assert.match(s,/hub_message:"message.created"/);assert.match(s,/community_story_reaction:"story.reaction"/);assert.match(s,/direct_call_invite:"call.invited"/);assert.match(s,/nia_typing:"nia.typing"/);assert.match(s,/loadDurableRealtimeState/);assert.match(s,/rememberDurableEvent/);});
test("replay endpoint is audience-scoped",()=>{const s=read("artifacts/api-server/src/routes/realtime-events.ts");assert.match(s,/audience_user_ids/);assert.match(s,/requireAuth/);assert.match(s,/requireApproved/);});
