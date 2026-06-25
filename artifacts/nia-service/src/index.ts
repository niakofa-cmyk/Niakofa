import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pino } from "pino";
import chatRouter from "./routes/chat.js";
import crisisResourcesRouter from "./routes/crisis-resources.js";
import neighborhoodsRouter from "./routes/neighborhoods.js";
import { purgeExpiredConversations } from "./lib/db.js";
import { startCrisisFollowupWorker } from "./workers/crisis-followup-worker.js";

const logger = pino({ level: "info" });
const app = express();

app.set("trust proxy", 1);

app.use(helmet());

// BUG-22: Never default CORS to wildcard (*) in production. If ALLOWED_ORIGIN
// is not set, block all cross-origin requests rather than opening up to everyone.
const allowedOrigin = process.env.ALLOWED_ORIGIN;
if (!allowedOrigin) {
  logger.warn("ALLOWED_ORIGIN not set — cross-origin requests will be blocked by CORS");
}
app.use(cors({
  origin: allowedOrigin
    ? allowedOrigin.split(",").map(s => s.trim())
    : false,
}));
app.use(express.json({ limit: "256kb" }));

const networkLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(networkLimiter);

app.use("/", chatRouter);
app.use("/", crisisResourcesRouter);
app.use("/", neighborhoodsRouter);

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  logger.info({ port }, "Nia service listening");

  // Hourly conversation purge — keeps nia_conversations lean (48h TTL)
  setInterval(async () => {
    try {
      await purgeExpiredConversations();
      logger.info("nia: purged expired conversations");
    } catch (err) {
      logger.error({ err }, "nia: purge failed");
    }
  }, 60 * 60 * 1000);

  // 24-hour follow-up check-in: scheduling lives in api-server's
  // nia-checkin-worker.ts (single source of truth — it owns the
  // nia_checkin_sent_at column), which calls this service's POST /checkin
  // to generate Nia's actual message. This service previously also ran its
  // own internal startCheckinWorker() on the same hourly cadence, racing
  // against the api-server worker with a different, weaker dedup mechanism
  // (LIKE-matching nia_conversations text instead of a real column) — both
  // could fire for the same request before either dedup caught up,
  // double-messaging users. That duplicate scheduler has been removed; see
  // CLAUDE.md incident log.

  // Crisis follow-up (Phase 2): this one stays inside nia-service, since it
  // queries nia_conversations directly (raw pg) and calls Anthropic itself —
  // no api-server round-trip needed, and no duplicate-scheduler risk because
  // this is the only place it runs.
  startCrisisFollowupWorker();
});
