import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import compression from "compression";
import router from "./routes";
import { voiceAudioRawParser } from "./routes/nia-voice";
import { logger } from "./lib/logger";
import { AppError, ErrorCode } from "./lib/errors";
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
          "https://*.mapbox.com",
          "https://lh3.googleusercontent.com",
          "https://avatars.githubusercontent.com",
        ],
        connectSrc: [
          "'self'",
          "https://api.mapbox.com",
          "https://events.mapbox.com",
          "https://accounts.google.com",
          // Stripe.js makes fetch calls to api.stripe.com for payment confirmation
          "https://api.stripe.com",
          // Nia AI streams from the same origin in production; in dev it proxies
          // through /api/nia so no extra origin is needed.
        ],
        workerSrc: ["'self'", "blob:"],
        // Mapbox GL JS uses inline workers via blob: URLs for tile parsing
        childSrc: ["'self'", "blob:"],
        // Mapbox terrain tiles are fetched via fetch() (connectSrc) and the
        // GL JS worker imports a script from its own CDN
        scriptSrcAttr: ["'self'", "'unsafe-inline'"],
        // Google Identity Services injects inline onclick handlers
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

// ── CORS ──────────────────────────────────────────────────────────────────────
// ALLOWED_ORIGIN is a comma-separated list of allowed origins for production.
// In development, the Vite dev server (localhost:3000) and Replit preview are
// allowed. In production, only ALLOWED_ORIGIN is allowed.
const allowedOrigins = (process.env.ALLOWED_ORIGIN ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin(origin, cb) {
    // Allow same-origin requests (no Origin header) and tools like curl
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0) {
      // No allowlist configured — allow all (dev mode)
      return cb(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Client-Info", "X-Internal-Secret"],
  exposedHeaders: ["Content-Range", "X-Total-Count"],
  maxAge: 600,
};

app.use(cors(corsOptions));

// ── Request logging ───────────────────────────────────────────────────────────
app.use(pinoHttp({ logger }));

// ── Request timeout ───────────────────────────────────────────────────────────
// 30s for normal requests, 120s for long-poll / SSE endpoints.
app.use(requestTimeout);

// ── Rate limiting ──────────────────────────────────────────────────────────────
app.use(generalApiLimiter);

// ── Body parsing ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// ── Auth middleware ────────────────────────────────────────────────────────────
// Parse session tokens on every request so req.user is available in routes.
app.use(parseAuth);

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

// ── Health & status endpoints ──────────────────────────────────────────────────
// /api/healthz is the Railway healthcheck target (see railway.toml).
// It is registered here (not in routes/) so it works even if the DB is down.
app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/ping", (_req, res) => {
  res.json({ pong: true, timestamp: new Date().toISOString() });
});

// ── Frontend SPA serving ───────────────────────────────────────────────────────
// In production (or when SERVE_FRONTEND=true), Express serves the built React
// SPA from artifacts/pay-it-forward/dist/public. The SPA catch-all below
// serves index.html for any non-API route so client-side routing works.
const frontendDist =
  process.env.FRONTEND_DIST ||
  path.resolve(__dirname, "../../pay-it-forward/dist/public");

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
        if (filePath.endsWith("index.html") || filePath.includes(".vite/")) {
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
