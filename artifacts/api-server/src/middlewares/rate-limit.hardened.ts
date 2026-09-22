/**
 * Production-oriented global API rate limiting.
 *
 * This middleware runs once in app.ts after parseAuth. Authenticated users get
 * a user-scoped budget, while anonymous traffic remains IP-scoped. Keeping the
 * authenticated identity available here is essential; applying this before
 * parseAuth would silently turn every request into an IP-only request.
 */
import type { Request } from "express";
import { makeLimiter, skipLocalhostInDev, userOrIpKey } from "../lib/rateLimitStore";

export { skipLocalhostInDev };

export const apiTrafficLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  prefix: "api",
  limit: (req: Request) =>
    (req as Request & { authenticatedUserId?: number }).authenticatedUserId != null
      ? 2000
      : 300,
  keyGenerator: (req) => userOrIpKey(req, "api"),
  message: {
    error: "Too many requests from this address. Please slow down and try again in a few minutes.",
  },
});

export const authLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  prefix: "auth",
  keyGenerator: (req) => `auth:ip:${req.ip ?? "unknown"}`,
  message: {
    error:
      "Too many sign-in attempts from this device. Please wait 15 minutes and try again. " +
      "If you're having trouble, contact support@niakofa.com.",
  },
});

export const circleMediaTokenLimiter = makeLimiter({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  prefix: "circle-media-token",
  message: { error: "Too many media-token requests. Wait a moment and try again." },
});

export const circleControlLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  prefix: "circle-control",
  message: { error: "You're interacting with Circles a little fast. Slow down for a moment." },
});

export const niaChatLimiter = makeLimiter({
  windowMs: 60 * 1000,
  limit: 20,
  prefix: "nia-chat",
  message: { error: "Nia is getting a lot of messages. Please wait a moment." },
});

export const paymentLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  prefix: "payment",
  message: {
    error: "Too many payment requests in a short period. Please wait a few minutes before trying again.",
  },
});

export const voiceLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  prefix: "voice",
  message: { error: "Voice limit reached. Please wait an hour before trying again." },
});