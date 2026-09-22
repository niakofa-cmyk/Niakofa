/**
 * Niakofa — Request Timeout Middleware
 *
 * Terminates long-running HTTP requests after a configurable deadline so
 * stalled DB queries or slow external API calls can't hold Express worker
 * threads indefinitely and starve out healthy requests.
 *
 * Only sends a 503 if headers haven't been sent yet — SSE/streaming routes
 * that already started their response won't be interrupted.
 *
 * Usage:
 *   app.use(requestTimeout(30_000));         // 30s default
 *   router.post("/chat", requestTimeout(60_000), handler);  // per-route override
 */
import { type Request, type Response, type NextFunction } from "express";
import { logger } from "../lib/logger";

export function requestTimeout(ms: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timer = setTimeout(() => {
      if (res.headersSent) return; // Already streaming — don't interrupt
      logger.warn(
        { method: req.method, url: req.url, timeout_ms: ms },
        `request-timeout: ${req.method} ${req.url} exceeded ${ms}ms`,
      );
      res.status(503).json({
        error: "The server took too long to respond. Please try again.",
        code: "REQUEST_TIMEOUT",
      });
    }, ms);

    // Clean up the timer as soon as the response is done (success or error)
    const cleanup = () => clearTimeout(timer);
    res.once("finish", cleanup);
    res.once("close", cleanup);

    next();
  };
}
