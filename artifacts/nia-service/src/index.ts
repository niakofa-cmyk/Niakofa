import "dotenv/config";
import express from "express";
import cors from "cors";
import { pino } from "pino";
import chatRouter from "./routes/chat.js";
import neighborhoodsRouter from "./routes/neighborhoods.js";
import "./lib/auth.js"; // fail fast at boot if SESSION_SECRET is missing
import { purgeExpiredConversations } from "./lib/db.js";

const logger = pino({ level: "info" });
const app = express();

app.set("trust proxy", 1);
app.use(cors({ origin: process.env.ALLOWED_ORIGIN ?? "*" }));
app.use(express.json());
app.use("/", chatRouter);
app.use("/", neighborhoodsRouter);

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
