import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { voiceAudioRawParser } from "./routes/nia-voice";
import { logger } from "./lib/logger";
import { generalApiLimiter } from "./middlewares/rate-limit";
import { parseAuth } from "./middlewares/auth";

const app: Express = express();

// Trust Railway / Railway proxy headers so req.ip is the real client IP
app.set("trust proxy", 1);

// General API rate limit — broad protection, generous limit (200/15min)
app.use("/api", generalApiLimiter);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// CORS — restrict to the declared frontend origin(s) in production.
// Set ALLOWED_ORIGIN in Railway Variables as a comma-separated list, e.g.
//   https://niakofa.com,https://zesty-ambition-production-f6a1.up.railway.app
// Falls back to permissive in development so local dev stays frictionless.
const rawAllowedOrigin = process.env.ALLOWED_ORIGIN;
const allowedOrigins = rawAllowedOrigin
  ? rawAllowedOrigin.split(",").map((o) => o.trim()).filter(Boolean)
  : null;
app.use(
  cors(
    allowedOrigins
      ? {
          origin: (origin, callback) => {
            // Same-origin requests (e.g. Express serving the SPA) have no Origin header
            if (!origin || allowedOrigins.includes(origin)) {
              callback(null, true);
            } else {
              callback(new Error(`CORS: origin ${origin} not allowed`));
            }
          },
          credentials: true,
        }
      : undefined // permissive in dev (no ALLOWED_ORIGIN set)
  )
);

// Stripe webhooks require the raw request body (Buffer) for signature verification.
// This MUST come before express.json() so the /stripe/webhook route gets the raw body.
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));
app.use("/api/verification/identity/webhook", express.raw({ type: "application/json" }));
// Voice STT endpoint needs raw audio bytes before express.json() runs
app.use("/api/nia/voice/transcribe", voiceAudioRawParser);

app.use(express.json({ limit: "10mb" })); // 10mb to allow base64 avatar uploads
app.use(express.urlencoded({ extended: true }));

// Attach authenticated userId to every request (non-blocking — routes decide if auth is required)
app.use(parseAuth);

app.use("/api", router);

// ── Production: serve built frontend static files ─────────────────────────────
if (process.env.NODE_ENV === "production" && process.env.SERVE_FRONTEND === "true") {
  const frontendDist = path.join(import.meta.dirname, "..", "..", "pay-it-forward", "dist", "public");

  app.use(express.static(frontendDist, {
    setHeaders(res, filePath) {
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
    },
  }));
  logger.info({ frontendDist }, "serving frontend static files");

  app.get("*path", (req, res) => {
    if (!req.path.startsWith("/api") && !req.path.startsWith("/ws")) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(path.join(frontendDist, "index.html"));
    }
  });
}

export default app;
