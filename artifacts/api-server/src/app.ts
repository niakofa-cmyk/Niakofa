import express, { type Express, type Request, type Response, type NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";
import { generalApiLimiter } from "./middlewares/rate-limit";
import { parseAuth } from "./middlewares/auth";
import { requireApproved } from "./middlewares/authz";

const app: Express = express();

// Trust Railway / Railway proxy headers so req.ip is the real client IP
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "https:", "wss:"],
      fontSrc: ["'self'", "https:"],
      workerSrc: ["'self'", "blob:"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

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

app.use(express.json({ limit: "10mb" })); // 10mb to allow base64 avatar uploads
app.use(express.urlencoded({ extended: true }));

// Attach authenticated userId to every request (non-blocking — routes decide if auth is required)
app.use(parseAuth);

// ── Account approval gate ───────────────────────────────────────────────────
// Locks out any individual/business/sponsor account that hasn't been admin-
// approved yet, across the ENTIRE API surface, except for a short exemption
// list needed to log in, register, check service health, and receive Stripe
// webhooks. Admins always bypass this (see requireApproved).
const APPROVAL_EXEMPT_PATHS = new Set([
  "/users/login",
  "/users/register",
  "/users/forgot-password",
  "/users/reset-password",
  "/users/request-password-reset",
  "/users/set-initial-password",
  "/healthz",
  "/version",
  "/stripe/webhook",
  "/verification/identity/webhook",
  // Nia chat and history are available to unapproved/anonymous users —
  // Nia is always free and always accessible, even before account approval.
  "/nia/chat",
  "/nia/history",
]);

app.use("/api", (req, res, next) => {
  // Prefix-match for parameterised exempt paths (e.g. /nia/history/:sessionId)
  const isExempt =
    APPROVAL_EXEMPT_PATHS.has(req.path) ||
    req.path.startsWith("/nia/history/");
  if (isExempt) return next();
  // Allow a user to fetch their own profile (already owner-locked by
  // requireOwnership downstream) so the frontend can display pending/denied
  // status without this gate creating a chicken-and-egg problem.
  if (req.method === "GET" && /^\/users\/\d+$/.test(req.path)) return next();
  if (!req.authenticatedUserId) return next(); // let each route's own requireAuth handle this
  return requireApproved(req, res, next);
});

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

// ── Global error handler ──────────────────────────────────────────────────────
// MUST be the very last app.use() — after all routes AND after static/SPA
// handlers — so it catches errors from every handler in the chain.
// Express identifies error middleware by its arity (4 arguments); the
// eslint-disable comment prevents the linter from stripping the unused _next.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status =
    err instanceof Error && "status" in err && typeof (err as { status?: unknown }).status === "number"
      ? (err as { status: number }).status
      : 500;
  const message =
    process.env.NODE_ENV === "production"
      ? "An unexpected error occurred. Please try again."
      : err instanceof Error
      ? err.message
      : String(err);
  logger.error({ err }, "unhandled express error");
  if (!res.headersSent) {
    res.status(status).json({ error: message });
  }
});

export default app;
