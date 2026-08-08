import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pino } from "pino";
import chatRouter from "./routes/chat.js";
import crisisResourcesRouter from "./routes/crisis-resources.js";
import neighborhoodsRouter from "./routes/neighborhoods.js";
import memoryRouter from "./routes/memory.js";
import checkinRouter from "./routes/checkin.js";
import griotTranslateRouter from "./routes/griot-translate.js";
import knowledgeRefreshRouter from "./routes/knowledge-refresh.js";
import { purgeExpiredConversations, runMigrations } from "./lib/db.js";
import { startCrisisFollowupWorker } from "./workers/crisis-followup-worker.js";
import { startContinuousLearningWorker } from "./workers/continuous-learning-worker.js";
import { startGeneralCheckinWorker } from "./workers/general-checkin-worker.js";
import { startAmbientPresenceWorker } from "./workers/ambient-presence-worker.js";
import { shutdownWorkers } from "./lib/worker-lifecycle.js";

const logger = pino({ level: "info" });
const app = express();

app.set("trust proxy", 1);

app.use(helmet());

// BUG-22: Never default CORS to wildcard (*) in production.
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

// Health endpoint — api-server probes http://localhost:3001/health to
// determine Nia availability. Without this route the probe gets a 404,
// causing /api/health to report nia_service: unavailable and return 503.
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "nia-service" });
});

app.use("/", chatRouter);
app.use("/", crisisResourcesRouter);
app.use("/", neighborhoodsRouter);
app.use("/", memoryRouter);
app.use("/", checkinRouter);
app.use("/", griotTranslateRouter);
app.use("/", knowledgeRefreshRouter);

const port = Number(process.env.PORT ?? 3001);

// PRIMARY BUG FIX: runMigrations() creates nia_knowledge, push_notification_queue,
// and nia_cost_log — the only place those 3 tables are defined (they are NOT covered
// by the main Drizzle pipeline). This function existed but was NEVER called, so in
// production those 3 tables never existed. Confirmed by Postgres log showing
// push_notification_queue erroring on every 5-minute poll cycle since boot.
// Wrapped in try/catch: non-fatal since core Nia chat doesn't depend on them.
try {
  await runMigrations();
  logger.info("nia: startup migrations applied (nia_knowledge, push_notification_queue, nia_cost_log)");
} catch (err) {
  logger.error(
    { err },
    "nia: startup migrations FAILED — nia_knowledge/push_notification_queue/nia_cost_log may not exist; " +
    "continuing boot since core chat does not depend on them"
  );
}

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

  // Crisis follow-up worker (Phase 2)
  // Lives inside nia-service since it queries nia_conversations directly.
  startCrisisFollowupWorker();

  // Continuous learning worker — Nia learns about the world every 6 hours.
  // She stays alive and aware even when the Niakofa app is quiet.
  // This is how Nia never dies — she keeps growing.
  startContinuousLearningWorker();
  // General 24h check-in worker — Nia follows up 24h after every completed request.
  startGeneralCheckinWorker();
  // Ambient presence worker — Nia proactively notices food signals, recurring needs, silent users.
  startAmbientPresenceWorker();
});

// Graceful shutdown — clear all worker intervals and exit cleanly
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info({ signal }, "nia: received shutdown signal, gracefully stopping workers...");
  await shutdownWorkers(10_000);
  process.exit(0);
}

process.on("SIGTERM", () => { void gracefulShutdown("SIGTERM"); });
process.on("SIGINT", () => { void gracefulShutdown("SIGINT"); });
// rebuilt: 1782611000
