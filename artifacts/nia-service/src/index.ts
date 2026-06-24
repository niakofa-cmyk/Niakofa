import "dotenv/config";
import express from "express";
import cors from "cors";
import { pino } from "pino";
import chatRouter from "./routes/chat.js";
import neighborhoodsRouter from "./routes/neighborhoods.js";
import crisisResourcesRouter from "./routes/crisis-resources.js";
import "./lib/auth.js"; // fail fast at boot if SESSION_SECRET is missing
import { purgeExpiredConversations, runMigrations } from "./lib/db.js";

const logger = pino({ level: "info" });
const app = express();

app.set("trust proxy", 1);
app.use(cors({ origin: process.env.ALLOWED_ORIGIN ?? "*" }));
app.use(express.json({ limit: "8mb" })); // enlarged for image analysis base64 payloads
app.use("/", chatRouter);
app.use("/", neighborhoodsRouter);
app.use("/", crisisResourcesRouter);

setInterval(async () => {
  try {
    await purgeExpiredConversations();
    logger.info("nia: purged expired conversations");
  } catch (err) {
    logger.error({ err }, "nia: purge failed");
  }
}, 60 * 60 * 1000);

const port = Number(process.env.PORT ?? 3001);

runMigrations()
  .catch((err) => {
    logger.error({ err }, "nia: startup migration failed");
    process.exit(1);
  })
  .then(() => {
    app.listen(port, () => logger.info({ port }, "Nia service listening"));
  });
