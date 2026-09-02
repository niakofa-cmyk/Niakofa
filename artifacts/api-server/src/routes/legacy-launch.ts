import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth.js";
import { generalApiLimiter } from "../middlewares/rate-limit.js";
import { getQueueConnection } from "../lib/queue.js";
import { logger } from "../lib/logger.js";
import {
  getFamilyCharacter as getStoredFamilyCharacter,
  getFamilyMembership as getStoredFamilyMembership,
} from "../lib/legacy-launch-db.js";

const LAUNCH_TICKET_TTL_SECONDS = 60;
const LAUNCH_TICKET_PREFIX = "legacy:launch-ticket:";

interface StoredLegacyLaunch {
  userId: number;
  familyId: number;
  characterId: string;
  gameHour: number;
  expiresAt: number;
}

const memoryTickets = new Map<string, StoredLegacyLaunch>();

const LaunchTicketRequest = z.object({
  familyId: z.coerce.number().int().positive(),
  characterId: z.coerce.string().trim().min(1).optional(),
  gameHour: z.coerce.number().int().min(0).max(23).default(14),
});

function ticketKey(ticket: string): string {
  return `${LAUNCH_TICKET_PREFIX}${createHash("sha256").update(ticket).digest("hex")}`;
}

function canUseMemoryTicketStore(): boolean {
  return process.env.NODE_ENV !== "production";
}

async function storeLaunchTicket(ticket: string, payload: StoredLegacyLaunch): Promise<void> {
  const redis = getQueueConnection();
  if (redis) {
    const stored = await redis.set(
      ticketKey(ticket),
      JSON.stringify(payload),
      "EX",
      LAUNCH_TICKET_TTL_SECONDS,
      "NX",
    );
    if (stored !== "OK") {
      throw new Error("Could not reserve a unique Legacy launch ticket");
    }
    return;
  }

  if (!canUseMemoryTicketStore()) {
    throw new Error("Legacy launch tickets require Redis in production");
  }

  memoryTickets.set(ticketKey(ticket), payload);
}

async function consumeLaunchTicket(ticket: string): Promise<StoredLegacyLaunch | null> {
  const redis = getQueueConnection();
  if (redis) {
    // GET + DEL is intentionally one Redis script: a ticket must not be
    // replayable if two browser requests exchange it at the same time.
    const raw = await redis.eval(
      "local value = redis.call('GET', KEYS[1]); " +
      "if value then redis.call('DEL', KEYS[1]); end; return value;",
      1,
      ticketKey(ticket),
    ) as string | null;
    return raw ? JSON.parse(raw) as StoredLegacyLaunch : null;
  }

  if (!canUseMemoryTicketStore()) {
    throw new Error("Legacy launch tickets require Redis in production");
  }

  const key = ticketKey(ticket);
  const payload = memoryTickets.get(key) ?? null;
  memoryTickets.delete(key);
  if (payload && payload.expiresAt <= Date.now()) return null;
  return payload;
}

export interface LegacyLaunchDataSource {
  getFamilyMembership: typeof getStoredFamilyMembership;
  getFamilyCharacter: typeof getStoredFamilyCharacter;
}

export function createLegacyLaunchRouter(
  dataSource: LegacyLaunchDataSource = {
    getFamilyMembership: getStoredFamilyMembership,
    getFamilyCharacter: getStoredFamilyCharacter,
  },
): Router {
  const router = Router();

  // POST /legacy/launch-ticket — create a one-use launch credential for the
  // standalone RPG. The credential itself contains no readable family data.
  router.post("/legacy/launch-ticket", generalApiLimiter, requireAuth, async (req, res) => {
  const parsed = LaunchTicketRequest.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "familyId, characterId, and a valid gameHour are required" });
  }

  const userId = req.authenticatedUserId!;
  const { familyId, gameHour } = parsed.data;
  const membership = await dataSource.getFamilyMembership(familyId, userId);

  if (!membership) {
    return res.status(403).json({ error: "You are not a member of this family" });
  }

  const character = await dataSource.getFamilyCharacter(familyId, parsed.data.characterId ?? "");
  if (!character) {
    return res.status(404).json({ error: "That Legacy character is not in this family" });
  }

  const ticket = randomBytes(32).toString("base64url");
  try {
    await storeLaunchTicket(ticket, {
      userId,
      familyId,
      characterId: String(character.id),
      gameHour,
      expiresAt: Date.now() + LAUNCH_TICKET_TTL_SECONDS * 1000,
    });
  } catch (error) {
    logger.error({ err: error, userId, familyId }, "legacy launch ticket issuance failed");
    return res.status(503).json({ error: "Legacy launch is temporarily unavailable" });
  }

  return res.status(201).json({
    ticket,
    expiresInSeconds: LAUNCH_TICKET_TTL_SECONDS,
  });
});

// GET /legacy/launch-context — exchange the one-use ticket. This endpoint is
// intentionally not authenticated with the platform cookie: the ticket is the
// short-lived proof carried to a separately hosted RPG origin.
  router.get("/legacy/launch-context", generalApiLimiter, async (req, res) => {
  const ticket = typeof req.query.ticket === "string" ? req.query.ticket.trim() : "";
  if (ticket.length < 32 || ticket.length > 256) {
    return res.status(400).json({ error: "A valid Legacy launch ticket is required" });
  }

  let payload: StoredLegacyLaunch | null;
  try {
    payload = await consumeLaunchTicket(ticket);
  } catch (error) {
    logger.error({ err: error }, "legacy launch ticket exchange failed");
    return res.status(503).json({ error: "Legacy launch is temporarily unavailable" });
  }

  if (!payload) {
    return res.status(410).json({ error: "Legacy launch ticket expired or already used" });
  }

  return res.json({
    context: {
      mode: "live" as const,
      familyId: String(payload.familyId),
      characterId: payload.characterId,
      gameHour: payload.gameHour,
    },
  });
  });

  return router;
}

export function __resetLegacyLaunchTicketsForTests(): void {
  memoryTickets.clear();
}

const router = createLegacyLaunchRouter();
export default router;