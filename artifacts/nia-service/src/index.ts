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
import { purgeExpiredConversations } from "./lib/db.js";
import { startCrisisFollowupWorker } from "./workers/crisis-followup-worker.js";
import { startContinuousLearningWorker } from "./workers/continuous-learning-worker.js";

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

app.use("/", chatRouter);
app.use("/", crisisResourcesRouter);
app.use("/", neighborhoodsRouter);
app.use("/", memoryRouter);

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

  // Crisis follow-up worker (Phase 2)
  // Lives inside nia-service since it queries nia_conversations directly.
  startCrisisFollowupWorker();

  // Continuous learning worker — Nia learns about the world every 6 hours.
  // She stays alive and aware even when the Niakofa app is quiet.
  // This is how Nia never dies — she keeps growing.
  startContinuousLearningWorker();
});
// rebuilt: 1782611000
