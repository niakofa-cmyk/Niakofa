import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
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

// CORS — restrict to the declared frontend origin in production.
// Set ALLOWED_ORIGIN in Railway Variables (e.g. https://niakofa.railway.app).
// Falls back to permissive in development so local dev stays frictionless.
const allowedOrigin = process.env.ALLOWED_ORIGIN;
app.use(
  cors(
    allowedOrigin
      ? {
          origin: allowedOrigin,
          credentials: true,
        }
      : undefined // permissive in dev (no ALLOWED_ORIGIN set)
  )
);

// Stripe webhooks require the raw request body (Buffer) for signature verification.
// This MUST come before express.json() so the /stripe/webhook route gets the raw body.
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));
app.use("/api/verification/identity/webhook", express.raw({ type: "application/json" }));

app.use(express.json({ limit: "10mb" })); // 10mb to allow base64 avatar uploads
app.use(express.urlencoded({ extended: true }));

// Attach authenticated userId to every request (non-blocking — routes decide if auth is required)
app.use(parseAuth);

app.use("/api", router);

// ── Production: serve built frontend static files ─────────────────────────────
if (process.env.NODE_ENV === "production" && process.env.SERVE_FRONTEND === "true") {
  const frontendDist = path.join(import.meta.dirname, "..", "..", "pay-it-forward", "dist", "public");

  app.use(express.static(frontendDist));
  logger.info({ frontendDist }, "serving frontend static files");

  app.get("*path", (req, res) => {
    if (!req.path.startsWith("/api") && !req.path.startsWith("/ws")) {
      res.sendFile(path.join(frontendDist, "index.html"));
    }
  });
}

export default app;
