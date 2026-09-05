import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import compression from "compression";
import router from "./routes";
import { voiceAudioRawParser } from "./routes/nia-voice";
import { logger } from "./lib/logger";
import { AppError, ErrorCode } from "./lib/errors";
import { apiTrafficLimiter } from "./middlewares/rate-limit.hardened";
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
          "https://*.mapbox.com",
          "https://maps.gstatic.com",
          "https://*.googlevideo.com",
          "https://lh3.googleusercontent.com",
          "https://avatars.githubusercontent.com",
        ],
        // Mapbox GL JS spawns web workers from blob: URLs — required for map rendering
        workerSrc: ["'self'", "blob:"],
        childSrc: ["'self'", "blob:"],
        // Mapbox fetches vector tiles, styles, geocoding, directions from these origins
        connectSrc: [
          "'self'",
          "wss:",
          "ws:",
          "https://api.stripe.com",
          "https://api.mapbox.com",
          "https://*.mapbox.com",
          "https://events.mapbox.com",
          "https://maps.googleapis.com",
          "https://oauth2.googleapis.com",
          "https://accounts.google.com",
          "https://ipapi.co",
          process.env.NIA_SERVICE_URL ?? "https://niakofa-production.up.railway.app",
        ].filter(Boolean),
        frameSrc: [
          "'self'",
          "https://js.stripe.com",
          "https://hooks.stripe.com",
          "https://accounts.google.com",
        ],
        scriptSrcAttr: ["'self'", "'unsafe-inline'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'", "https://accounts.google.com"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin" },
  }),
);

// Permissions-Policy — restrict powerful browser features to same-origin.
// Helmet doesn't expose this header in all versions, so we set it directly.
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader(
    "Permissions-Policy",
    "camera=(self), microphone=(self), geolocation=(self), payment=(self \"https://js.stripe.com\"), fullscreen=(self)",
  );
  next();
});

// ── CORS ──────────────────────────────────────────────────────────────────────
// ALLOWED_ORIGIN is a comma-separated list of allowed origins for production.
// In development, the Vite dev server (localhost:3000) and Replit preview are
// allowed. In production, only ALLOWED_ORIGIN is allowed.
//
// Keep this mounted on the API boundary. Browser module and stylesheet requests
// can include an Origin header even when they are same-origin; applying the API
// CORS validator to /assets makes a valid SPA deployment fail closed as a 500
// when the public host is not also repeated in ALLOWED_ORIGIN.
const allowedOrigins = (process.env.ALLOWED_ORIGIN ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
  throw new Error(
    "ALLOWED_ORIGIN must be set in production. Refusing to start with an open CORS policy.",
  );
}

const corsOptions: cors.CorsOptions = {
  origin(origin, cb) {
    // Allow same-origin requests (no Origin header) and tools like curl
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0) {
      // Development-only fallback. Production fails fast above.
      return cb(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "X-Client-Info", "X-Internal-Secret"],
  exposedHeaders: ["Content-Range", "X-Total-Count"],
  maxAge: 600,
};

app.use("/api", cors(corsOptions));

// ── Request logging ───────────────────────────────────────────────────────────
app.use(pinoHttp({ logger }));

// ── Request timeout ───────────────────────────────────────────────────────────
// 30s for normal requests, 120s for long-poll / SSE endpoints.
app.use(requestTimeout(30_000));

// Parse auth before the global limiter so authenticated traffic gets a
// user-scoped budget instead of sharing one IP bucket with other residents,
// coworkers, or cellular users behind the same NAT.
app.use(parseAuth);

// ── Rate limiting ──────────────────────────────────────────────────────────────
// The legacy generalApiLimiter remains a route-level no-op for compatibility;
// this is the single effective global application of the API limiter.
app.use(apiTrafficLimiter);

// ── Raw body parsers for webhook endpoints ────────────────────────────────────
// These MUST be mounted BEFORE express.json() so the raw body is preserved
// for HMAC signature verification.
app.use("/api/stripe/webhook", express.raw({ type: "application/json", limit: "1mb" }));
app.use("/api/verification/identity/webhook", express.raw({ type: "application/json", limit: "1mb" }));
app.use("/api/background-checks/webhook", express.raw({ type: "application/json", limit: "1mb" }));

// Voice STT endpoint needs raw audio bytes before express.json() runs
app.use("/api/nia/voice/transcribe", voiceAudioRawParser);

// Circle recording upload — raw audio body parsed before the json() middleware
app.use("/api/audio-circle-sessions/:id/recording-upload", express.raw({ type: ["audio/*", "application/octet-stream"], limit: "500mb" }));
app.use("/api/audio-spiral-sessions/:id/recording-upload", express.raw({ type: ["audio/*", "application/octet-stream"], limit: "500mb" }));
app.use(
  "/api/audio-circle-sessions/:sessionId/recording/:recordingId/finalize",
  express.raw({ type: ["audio/*", "application/octet-stream"], limit: "500mb" }),
);
app.use(
  "/api/audio-spiral-sessions/:sessionId/recording/:recordingId/finalize",
  express.raw({ type: ["audio/*", "application/octet-stream"], limit: "500mb" }),
);

// Legacy interview media is uploaded as raw audio/video bytes. Mount this
// before express.json() so the recording is never coerced into a JSON body.
app.use(
  "/api/legacy/interview-quests/:questId/media",
  express.raw({ type: ["audio/*", "video/*", "application/octet-stream"], limit: "20mb" }),
);

// DNA exports are parsed in memory by the authenticated route. The raw bytes
// must reach that route before express.json() and are never passed to storage.
app.use(
  "/api/diaspora/dna/import",
  express.raw({
    type: ["text/csv", "text/plain", "application/json", "application/octet-stream"],
    limit: "30mb",
  }),
);

// ── Body parsing ───────────────────────────────────────────────────────────────
// 10mb to allow base64 avatar uploads
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

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

// ── Static uploads ─────────────────────────────────────────────────────────────
// Uploaded files (profile pictures, voice recordings, family artifacts) are
// served from /uploads. In production, Railway's persistent volume is mounted
// at /data/uploads. In development, the local uploads/ directory is used.
const uploadsDir =
  process.env.UPLOADS_DIR ||
  (process.env.NODE_ENV === "production" ? "/data/uploads" : "uploads");
app.use(
  "/uploads",
  express.static(uploadsDir, {
    maxAge: "7d",
    etag: true,
    lastModified: true,
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
    },
  }),
);

// ── Voice audio raw body parser ────────────────────────────────────────────────
// The Nia voice route needs the raw audio body for Whisper transcription.
// It is mounted BEFORE express.json() would consume it, but since express.json
// only parses application/json, the audio/* content types pass through untouched.
app.use("/api/nia/voice", voiceAudioRawParser);

// ── API routes ─────────────────────────────────────────────────────────────────
// All API routes are mounted under /api. The router aggregator lives at
// src/routes/index.ts. See CLAUDE.md — do NOT confuse this with src/index.ts.
app.use("/api", router);

// ── Frontend SPA serving ───────────────────────────────────────────────────────
// In production (or when SERVE_FRONTEND=true), Express serves the built React
// SPA from artifacts/pay-it-forward/dist/public. The SPA catch-all below
// serves index.html for any non-API route so client-side routing works.
const frontendDist =
    process.env.FRONTEND_DIST ||
    path.join(import.meta.dirname, "..", "..", "pay-it-forward", "dist", "public");

const shouldServeFrontend =
  process.env.NODE_ENV === "production" || process.env.SERVE_FRONTEND === "true";

if (shouldServeFrontend) {
  // Serve static assets (JS, CSS, images, fonts) from the frontend dist.
  app.use(
    express.static(frontendDist, {
      maxAge: "1y",
      etag: true,
      lastModified: true,
      setHeaders: (res, filePath) => {
        // index.html must never be cached — users must always get the latest
        // version. All other assets have content-hashed filenames so 1-year
        // cache is safe. The .vite/ directory contains dep-chunks that are
        // also content-hashed.
        if (filePath.endsWith("index.html") || filePath.endsWith("sw.js") || filePath.includes(".vite/")) {
          // "stuck on old build" experience. Treat it identically to index.html.
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        }
      },
    }),
  );
  logger.info({ frontendDist }, "serving frontend static files");

  // Catch-all: serve index.html for any non-API, non-WS route (SPA fallback).
  // This must come AFTER /api routes but BEFORE the error handler.
  // Express 5 (path-to-regexp v8) requires named wildcard syntax {*path}
  // instead of the Express 4 *path syntax.
  app.get("{*path}", (req, res, next) => {
    // Skip API and WebSocket routes — let Express 404 them normally
    if (req.path.startsWith("/api") || req.path.startsWith("/ws") || req.path.startsWith("/uploads")) {
      return next();
    }
    // Serve index.html for GET requests that accept HTML or any content type (*/*).
    // The /api, /ws, /uploads prefix checks above already prevent intercepting
    // API JSON 404s, so the Accept guard only needs to exclude explicit non-HTML
    // requests (e.g. a client requesting application/json from a non-API path).
    const accept = req.headers.accept || "";
    if (!accept.includes("text/html") && !accept.includes("*/*")) {
      return next();
    }
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

// ── Global error handler ──────────────────────────────────────────────────────
// Must have 4 arguments so Express recognises it as an error-handling middleware.
// Returns a structured { error, code, requestId } JSON body so frontend can
// surface actionable messages and so monitoring tools can group by `code`.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    const requestId = (_req as Request & { id?: unknown }).id;
    if (err.status >= 500) {
      logger.error({ err, status: err.status, code: err.code }, "express: unhandled error");
    } else {
      logger.warn({ status: err.status, code: err.code, msg: err.message }, "express: client error");
    }
    if (!res.headersSent) {
      res.status(err.status).json({
        error: err.expose ? err.message : "An unexpected error occurred",
        code: err.code,
        ...(requestId != null ? { requestId: String(requestId) } : {}),
        ...(err.details ? { details: err.details } : {}),
      });
    }
    return;
  }

  const cast = err as { status?: number; statusCode?: number; code?: string; expose?: boolean };
  const status = cast?.status ?? cast?.statusCode ?? 500;
  const message = err instanceof Error ? err.message : "An unexpected error occurred";
  const code: string =
    (typeof cast?.code === "string" && cast.code) ||
    (status === 400 ? ErrorCode.BAD_REQUEST :
     status === 401 ? ErrorCode.UNAUTHORIZED :
     status === 403 ? ErrorCode.FORBIDDEN :
     status === 404 ? ErrorCode.NOT_FOUND :
     status === 409 ? ErrorCode.CONFLICT :
     status === 422 ? ErrorCode.UNPROCESSABLE :
     status === 429 ? ErrorCode.RATE_LIMITED :
     ErrorCode.INTERNAL_ERROR);
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
