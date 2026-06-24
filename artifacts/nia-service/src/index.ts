import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pino } from "pino";
import chatRouter from "./routes/chat.js";
import { purgeExpiredConversations } from "./lib/db.js";

const logger = pino({ level: "info" });
const app = express();

app.set("trust proxy", 1);

app.use(helmet());

app.use(cors({ origin: process.env.ALLOWED_ORIGIN ?? "*" }));
app.use(express.json({ limit: "256kb" }));

const networkLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(networkLimiter);

app.use("/", chatRouter);

setInterval(async () => {
  try {
    await purgeExpiredConversations();
    logger.info("nia: purged expired conversations");
  } catch (err) {
    logger.error({ err }, "nia: purge failed");
  }
}, 60 * 60 * 1000);

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => logger.info({ port }, "Nia service listening"));
