/**
 * WebRTC ICE server credentials — STUN (public, static) + TURN (short-lived,
 * minted per request).
 *
 * Compatibility endpoint for the retired browser-mesh transport.
 *
 * The production Circle/Spiral room uses LiveKit and does not call this route.
 * It remains mounted for older clients and deliberate transport experiments.
 * Credentials are still minted server-side so the long-lived TURN secret is
 * never bundled into a browser build.
 *
 * The fix: use coturn's standard "static-auth-secret" REST API convention
 * (https://github.com/coturn/coturn/wiki/turnserver#turn-rest-api). The
 * server holds one long-lived shared secret (TURN_STATIC_AUTH_SECRET, never
 * sent to the client) and mints a username/credential pair per request that:
 *   - embeds an expiry timestamp in the username (coturn checks this itself)
 *   - is signed with HMAC-SHA1(secret, username) — the "credential"
 *   - is only valid until it expires (default 1 hour)
 * coturn is configured with the matching secret via --use-auth-secret
 * --static-auth-secret=<same value>, and validates every TURN allocation
 * against this scheme without the server needing to track sessions at all.
 *
 * If TURN_STATIC_AUTH_SECRET isn't configured (e.g. local dev, or before a
 * TURN server has been provisioned), this endpoint still returns the STUN
 * servers alone.
 */
import { Router } from "express";
import { createHmac, randomUUID } from "crypto";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";

const router: Router = Router();

const STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// How long a minted TURN credential remains valid. Kept short (1 hour) since
// each Circle session re-fetches on connect — there's no benefit to a longer
// window, and a shorter one limits the blast radius if a credential is ever
// captured mid-flight.
const TURN_CREDENTIAL_TTL_SECONDS = 60 * 60;

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

function mintTurnCredential(secret: string, userId: number): { username: string; credential: string } {
  const expiresAt = Math.floor(Date.now() / 1000) + TURN_CREDENTIAL_TTL_SECONDS;
  // coturn's convention: username is "<unix-expiry>:<opaque-id>"; it parses
  // the timestamp itself to enforce expiry, and the trailing id is free-form
  // (used here for audit/debugging, never trusted for authorization).
  const username = `${expiresAt}:u${userId}-${randomUUID().slice(0, 8)}`;
  const credential = createHmac("sha1", secret).update(username).digest("base64");
  return { username, credential };
}

// GET /webrtc-ice-servers — returns the ICE server list this client should
// use for the WebRTC peer connections in this session. Auth-gated (not
// rate-limit-exempt) purely to avoid letting an anonymous scraper mint TURN
// credentials for free; the credentials themselves carry no other
// authorization meaning.
router.get("/webrtc-ice-servers", requireAuth, generalApiLimiter, (req, res) => {
  const iceServers: IceServer[] = [...STUN_SERVERS];

  const turnUrl = process.env.TURN_URL;
  const secret = process.env.TURN_STATIC_AUTH_SECRET;
  if (turnUrl && secret) {
    const { username, credential } = mintTurnCredential(secret, req.authenticatedUserId!);
    // Support one or more TURN URLs (comma-separated) sharing the same
    // secret — e.g. turn:host:3478 and turns:host:5349 for a TLS fallback.
    const urls = turnUrl.split(",").map(u => u.trim()).filter(Boolean);
    iceServers.push({ urls: urls.length === 1 ? urls[0] : urls, username, credential });
  }

  return res.json({ iceServers, ttlSeconds: TURN_CREDENTIAL_TTL_SECONDS });
});

export default router;
