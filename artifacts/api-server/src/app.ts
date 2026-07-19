import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import compression from "compression";
import router from "./routes";
import { voiceAudioRawParser } from "./routes/nia-voice";
import { logger } from "./lib/logger";
import { generalApiLimiter } from "./middlewares/rate-limit";
import { parseAuth } from "./middlewares/auth";
import { requestTimeout } from "./middlewares/timeout";
import helmet from "helmet";

const app: Express = express();

// Trust Railway / Railway proxy headers so req.ip is the real client IP
app.set("trust proxy", 1);

// Gzip/Brotli response compression — must come BEFORE routes so all JSON
// responses are compressed. Stripe webhook raw bodies are tiny (always < 1mb)
// so skipping compression for them is fine; they use raw() anyway.
// Threshold of 1kb means small JSON responses (pong, status checks) are
// sent uncompressed (compression overhead exceeds savings for tiny payloads).
app.use(compression({ threshold: 1024 }));

// Security headers — helmet with a Niakofa-tailored CSP
// In production VITE_API_URL is served from the same origin so self covers the API.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'", "'unsafe-inline'",
          "https://js.stripe.com",
          "https://maps.googleapis.com",
          // Google Identity Services (GSI) — Google Sign-In button + token issuance
          "https://accounts.google.com",
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        // Mapbox GL JS loads tile images and its own glyphs/sprites from *.mapbox.com
        // lh3.googleusercontent.com = Google profile pictures returned by Google OAuth
        imgSrc: [
          "'self'", "data:", "blob:",
          "https://*.stripe.com",
          "https://maps.gstatic.com",
          "https://*.googlevideo.com",
          "https://*.mapbox.com",
          "https://lh3.googleusercontent.com", // Google profile avatars
        ],
        // Mapbox GL JS spawns web workers from blob: URLs — required for map rendering
        workerSrc: ["'self'", "blob:"],
        // Mapbox fetches vector tiles, styles, geocoding, directions from these origins
        connectSrc: [
          "'self'",
          "wss:",
          "ws:",
          "https://api.stripe.com",
          "https://maps.googleapis.com",
          // Mapbox GL JS + Mapbox APIs (tiles, geocoding, directions, events telemetry)
          "https://*.mapbox.com",
          "https://events.mapbox.com",
          // Google OAuth — ID token verification endpoint
          "https://oauth2.googleapis.com",
          "https://accounts.google.com",
          process.env.NIA_SERVICE_URL ?? "https://niakofa-production.up.railway.app",
        ].filter(Boolean),
        frameSrc: [
          "'self'",
          "https://js.stripe.com",
          "https://hooks.stripe.com",
          // Google Identity Services renders its sign-in button as an iframe
          "https://accounts.google.com",
        ],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false, // Stripe + Google Maps need cross-origin resources
  })
);

// Permissions-Policy — restrict powerful browser features to same-origin.
// Helmet doesn't expose this header in all versions, so we set it directly.
// camera/microphone = Nia voice (blocked until user grants permission);
// geolocation = map location (blocked until user grants via browser prompt).
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader(
    "Permissions-Policy",
    "camera=(self), microphone=(self), geolocation=(self), payment=(self \"https://js.stripe.com\"), fullscreen=(self)",
  );
  next();
});

// General API rate limit — broad protection, generous limit (200/15min)
app.use("/api", generalApiLimiter);
// 30s hard timeout on all API routes — prevents slow DB queries or stalled
// upstream calls from occupying Express workers indefinitely.
// SSE / streaming routes (Nia chat, voice) are excluded because they call
// res.flush() / res.write() early, which sets headersSent = true before the
// timeout fires, so the middleware correctly leaves them alone.
app.use("/api", requestTimeout(30_000));

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
// 1 MB cap prevents memory exhaustion from oversized webhook payloads.
app.use("/api/stripe/webhook", express.raw({ type: "application/json", limit: "1mb" }));
app.use("/api/verification/identity/webhook", express.raw({ type: "application/json", limit: "1mb" }));
app.use("/api/background-checks/webhook", express.raw({ type: "application/json", limit: "1mb" }));
// Voice STT endpoint needs raw audio bytes before express.json() runs
app.use("/api/nia/voice/transcribe", voiceAudioRawParser);

app.use(express.json({ limit: "10mb" })); // 10mb to allow base64 avatar uploads
app.use(express.urlencoded({ extended: true, limit: "1mb" })); // cap form bodies to prevent DoS

// Attach authenticated userId to every request (non-blocking — routes decide if auth is required)
app.use(parseAuth);

// ── X-Request-ID propagation ──────────────────────────────────────────────────
// Echo the pino-http–generated request ID back to the client so that frontend
// error reports can be correlated with server logs without sharing raw stack traces.
// IMPORTANT: must be placed BEFORE the /api router so that every route response
// carries the header — Express does not call downstream middleware after a route
// calls res.json()/res.send(), so placing this after the router would mean it
// never fires for any real API response.
app.use((_req: Request, res: Response, next: NextFunction) => {
  const id = (_req as Request & { id?: unknown }).id;
  if (id != null) res.setHeader("X-Request-ID", String(id));
  next();
});

app.use("/api", router);

// ── Production: serve built frontend static files ─────────────────────────────
if (process.env.NODE_ENV === "production" && process.env.SERVE_FRONTEND === "true") {
  const frontendDist = path.join(import.meta.dirname, "..", "..", "pay-it-forward", "dist", "public");

  app.use(express.static(frontendDist, {
    setHeaders(res, filePath) {
      if (filePath.endsWith("index.html") || filePath.endsWith("sw.js")) {
        // sw.js must never be cached — browsers allow up to 24h before re-checking
        // a service worker without an explicit no-cache header, which produces the
        // "stuck on old build" experience. Treat it identically to index.html.
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
// Must have 4 arguments so Express recognises it as an error-handling middleware.
// Returns a structured { error, code, requestId } JSON body so frontend can
// surface actionable messages and so monitoring tools can group by `code`.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const cast = err as { status?: number; statusCode?: number; code?: string; expose?: boolean };
  const status = cast?.status ?? cast?.statusCode ?? 500;
  const message =
    err instanceof Error ? err.message : "An unexpected error occurred";

  // Derive a machine-readable error code: prefer explicit .code, fall back to
  // HTTP-status-based codes so clients can branch on type without string matching.
  const code: string =
    (typeof cast?.code === "string" && cast.code) ||
    (status === 400 ? "BAD_REQUEST" :
     status === 401 ? "UNAUTHORIZED" :
     status === 403 ? "FORBIDDEN" :
     status === 404 ? "NOT_FOUND" :
     status === 409 ? "CONFLICT" :
     status === 422 ? "UNPROCESSABLE" :
     status === 429 ? "RATE_LIMITED" :
     "INTERNAL_ERROR");

  // Only surface the message when safe: 4xx (client error, intentional) or
  // errors with expose:true. For 5xx without expose, return a generic message
  // so stack traces / DB details don't leak to clients.
  const safeMessage =
    status < 500 || cast?.expose === true ? message : "An unexpected error occurred";

  const requestId = (_req as Request & { id?: unknown }).id;
  logger.error({ err, status, code }, "express: unhandled error");
  if (!res.headersSent) {
    res.status(status).json({
      error: safeMessage,
      code,
      ...(requestId != null ? { requestId: String(requestId) } : {}),
    });
  }
});

export default app;
