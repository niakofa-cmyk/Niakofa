/**
 * Nia Crisis Follow-Up Worker (Phase 2)
 *
 * Runs every hour, offset from the 24h general check-in worker. Finds users
 * whose most recent crisis-flagged conversation (48–72 hours ago) hasn't had
 * a reply since, and gently checks in — separate from, and much softer than,
 * the generic "how did your request go" 24h check-in.
 *
 * This is intentionally the ONLY scheduler for crisis follow-ups, living
 * entirely inside nia-service because it needs direct access to
 * nia_conversations (raw pg, not Drizzle — see CLAUDE.md) and calls Anthropic
 * directly. Do not add a second, parallel scheduler in api-server for this —
 * see the incident log entry about the duplicate 24h check-in worker that
 * used to live here and in api-server simultaneously, racing each other.
 */
import Anthropic from "@anthropic-ai/sdk";
import { pino } from "pino";
import {
  getCrisisConversationsForFollowup,
  saveCrisisFollowupConversation,
} from "../lib/db.js";
import { NIA_SYSTEM_PROMPT } from "../prompts/nia.js";

const logger = pino({ level: "info" });

const CRISIS_FOLLOWUP_INTERVAL_MS = 60 * 60 * 1000; // hourly

// Deliberately gentle, low-pressure, no re-traumatizing language. Nia is
// checking that someone is still okay, not reopening a crisis conversation
// by force — she should never reference "crisis," "988," or any hotline by
// name here; she's just a neighbor checking in.
const CRISIS_FOLLOWUP_DIRECTIVE =
  "GENTLE FOLLOW-UP DIRECTIVE: A couple of days ago, this person reached out " +
  "while going through something hard, and you haven't heard from them since. " +
  "Check in warmly and briefly — like a neighbor who's been quietly thinking " +
  "about them, not a clinician following up on a case. Do NOT mention crisis, " +
  "hotlines, or anything clinical. Do NOT ask them to explain what happened. " +
  "One or two sentences. Make it easy for them to respond with as little or " +
  "as much as they want. If they don't reply, that's okay too — this is just " +
  "a door staying open, not a check-up.\n\n";

const CRISIS_FOLLOWUP_OPENING_PROMPT =
  "[INTERNAL: Generate Nia's gentle follow-up opening message for someone she " +
  "hasn't heard from in a couple of days after a hard moment. Warm, brief, " +
  "no clinical language, 1–2 sentences. No preamble.]";

async function fireCrisisFollowup(
  client: Anthropic,
  target: { user_id: number; session_id: string }
): Promise<void> {
  const response = await client.messages.create({
    // Haiku is sufficient and fast for a short, warm follow-up message.
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    system: CRISIS_FOLLOWUP_DIRECTIVE + NIA_SYSTEM_PROMPT,
    messages: [{ role: "user", content: CRISIS_FOLLOWUP_OPENING_PROMPT }],
  });

  const niaMessage =
    response.content[0]?.type === "text"
      ? response.content[0].text.trim()
      : "Hey — just thinking of you. No pressure to respond, but I'm here. 💙";

  await saveCrisisFollowupConversation(target.user_id, target.session_id, niaMessage);

  logger.info({ user_id: target.user_id }, "nia: crisis follow-up sent");
}

async function processCrisisFollowups(client: Anthropic): Promise<void> {
  let targets: Awaited<ReturnType<typeof getCrisisConversationsForFollowup>>;
  try {
    targets = await getCrisisConversationsForFollowup();
  } catch (err) {
    logger.debug({ err }, "nia-crisis-followup: skipping (DB not ready)");
    return;
  }

  if (targets.length === 0) return;

  logger.info({ count: targets.length }, "nia-crisis-followup: sending gentle check-ins");

  for (const target of targets) {
    await fireCrisisFollowup(client, target).catch((err) => {
      logger.error({ err, user_id: target.user_id }, "nia-crisis-followup: failed for user");
    });
    // Gentle pacing — don't hammer Anthropic with a burst.
    await new Promise((r) => setTimeout(r, 800));
  }
}

export function startCrisisFollowupWorker(): () => void {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

  if (!process.env.ANTHROPIC_API_KEY) {
    logger.warn("nia-crisis-followup: ANTHROPIC_API_KEY not set — worker will not run");
    return () => {};
  }

  // Stagger by 15 minutes on startup, offset from any other startup-delayed
  // worker, so they don't all hit the DB/Anthropic at the same moment.
  const startupDelay = setTimeout(() => {
    processCrisisFollowups(client).catch(() => {});
  }, 15 * 60 * 1000);

  const interval = setInterval(() => {
    processCrisisFollowups(client).catch(() => {});
  }, CRISIS_FOLLOWUP_INTERVAL_MS);

  logger.info(
    { intervalMs: CRISIS_FOLLOWUP_INTERVAL_MS },
    "nia-crisis-followup: gentle follow-up worker started"
  );

  return () => {
    clearTimeout(startupDelay);
    clearInterval(interval);
    logger.info("nia-crisis-followup: worker stopped");
  };
}
