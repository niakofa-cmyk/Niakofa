import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireAuth, requireApproved } from "../middleware/auth.js";
const router=Router();
router.get("/realtime/events",requireAuth,requireApproved,async(req,res)=>{
 const userId=req.authenticatedUserId!; const after=typeof req.query.after==="string"?req.query.after:null;
 const n=Number(req.query.limit??100); const limit=Math.min(Math.max(Number.isFinite(n)?Math.floor(n):100,1),250);
 const result=await db.execute(sql`SELECT event_id,event_type,occurred_at,actor_id,conversation_kind,conversation_id,entity_id,payload FROM realtime_event_log WHERE (${after}::uuid IS NULL OR (occurred_at,event_id) > (SELECT occurred_at,event_id FROM realtime_event_log WHERE event_id=${after}::uuid)) AND (actor_id=${userId} OR payload->>'user_id'=${String(userId)} OR payload->>'recipient_id'=${String(userId)}) ORDER BY occurred_at ASC,event_id ASC LIMIT ${limit}`);
 return res.json({events:result.rows});
});
export default router;