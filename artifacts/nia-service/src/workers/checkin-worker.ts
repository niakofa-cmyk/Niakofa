/**
 * Nia 24-Hour Follow-Up Check-In Worker
 *
 * "The first time someone in Fort Worth posts a request and gets help,
 *  she'll follow up 24 hours later like a neighbor who actually remembered."
 *
 * This worker runs every hour. It queries for help requests completed
 * 23–25 hours ago, then has Nia send a warm, personal follow-up message
 * to the requester — saved into their conversation history so they can
 * continue the dialogue in-app.
 *
 * Uses claude-haiku for efficiency (these are short, warm messages).
 * No streaming needed for background-generated messages.
 */
import Anthropic from "@anthropic-ai/sdk";
import { pino } from "pino";
import {
  getCompletedRequestsForCheckin,
  getUserMemory,
  saveCheckinConversation,
  upsertUserMemory,
} from "../lib/db.js";
import { NIA_SYSTEM_PROMPT } from "../prompts/nia.js";

const logger = pino({ level: "info" });

const CHECKIN_INTERVAL_MS = 60 * 60 * 1000; // hourly

function buildCheckinDirective(opts: {
  requestTitle: string;
  category: string | null;
  helperName: string | null;
}): string {
  return (
    "CHECK-IN DIRECTIVE: You are reaching out to this person 24 hours after their request was completed. " +
    `The request was: "${opts.requestTitle}"${opts.category ? ` (category: ${opts.category})` : ""}. ` +
    (opts.helperName ? `Their helper was ${opts.helperName}. ` : "") +
    "Open warmly and naturally — like a neighbor checking in, not a support ticket. " +
    "Ask how things went. Show you care. Keep it short (2–3 sentences). " +
    "Do NOT open with 'I'm checking in' or 'I wanted to follow up.' Just ask.\n\n"
  );
}

function buildCheckinOpeningPrompt(opts: {
  requestTitle: string;
  category: string | null;
  helperName: string | null;
}): string {
  return (
    `[INTERNAL: Generate Nia's check-in opening message for a completed "${opts.requestTitle}" request` +
    (opts.helperName ? ` helped by ${opts.helperName}` : "") +
    `. Warm, natural, 2–3 sentences. No preamble.]`
  );
}

async function fireCheckin(
  client: Anthropic,
  request: {
    id: number;
    title: string;
    category: string;
    requester_id: number;
    helper_name: string | null;
  }
): Promise<void> {
  const sessionId = `checkin-${request.requester_id}-${request.id}`;

  const userMemory = await getUserMemory(request.requester_id).catch(() => null);
  const memoryPrefix = userMemory
    ? `MEMORY OF THIS USER:\n${userMemory}\n\nUse this memory naturally. Don't recite it.\n\n`
    : "";

  const directive = buildCheckinDirective({
    requestTitle: request.title,
    category: request.category,
    helperName: request.helper_name,
  });

  const openingPrompt = buildCheckinOpeningPrompt({
    requestTitle: request.title,
    category: request.category,
    helperName: request.helper_name,
  });

  const systemPrompt = memoryPrefix + directive + NIA_SYSTEM_PROMPT;

  const response = await client.messages.create({
    // Haiku is ideal for short, warm follow-up messages — fast and cost-efficient
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    system: systemPrompt,
    messages: [{ role: "user", content: openingPrompt }],
  });

  const niaMessage =
    response.content[0]?.type === "text"
      ? response.content[0].text.trim()
      : "Hey — just checking in to see how everything went. Hope it helped. 💙";

  await saveCheckinConversation(
    request.requester_id,
    sessionId,
    openingPrompt,
    niaMessage,
    request.id
  );

  // Update memory with the emotional context of the completed request
  if (niaMessage.length > 30) {
    upsertUserMemory(
      request.requester_id,
      (userMemory ?? "") +
        `\n- Completed "${request.title}" request (${request.category}) — Nia sent 24h check-in`
    ).catch(() => {});
  }

  logger.info(
    { request_id: request.id, requester_id: request.requester_id },
    "nia: 24h check-in sent"
  );
}

async function processCheckins(client: Anthropic): Promise<void> {
  let eligible: Awaited<ReturnType<typeof getCompletedRequestsForCheckin>>;
  try {
    eligible = await getCompletedRequestsForCheckin();
  } catch (err) {
    // DB may not be ready or tables may not exist in dev — silent skip
    logger.debug({ err }, "nia-checkin: skipping (DB not ready)");
    return;
  }

  if (eligible.length === 0) return;

  logger.info({ count: eligible.length }, "nia-checkin: sending follow-ups");

  for (const request of eligible) {
    await fireCheckin(client, request).catch((err) => {
      logger.error({ err, request_id: request.id }, "nia-checkin: failed for request");
    });
    // Gentle pacing — don't hammer Anthropic with a burst
    await new Promise((r) => setTimeout(r, 800));
  }
}

export function startCheckinWorker(): () => void {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

  if (!process.env.ANTHROPIC_API_KEY) {
    logger.warn("nia-checkin: ANTHROPIC_API_KEY not set — check-in worker will not run");
    return () => {};
  }

  // Stagger by 5 minutes on startup so it doesn't race with the main chat
  // service initialization and DB migration.
  const startupDelay = setTimeout(() => {
    processCheckins(client).catch(() => {});
  }, 5 * 60 * 1000);

  const interval = setInterval(() => {
    processCheckins(client).catch(() => {});
  }, CHECKIN_INTERVAL_MS);

  logger.info({ intervalMs: CHECKIN_INTERVAL_MS }, "nia-checkin: 24h follow-up worker started");

  return () => {
    clearTimeout(startupDelay);
    clearInterval(interval);
    logger.info("nia-checkin: worker stopped");
  };
}
