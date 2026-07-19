/**
 * Nia Continuous Learning Worker
 *
 * Nia stays alive and aware even when the Niakofa app is quiet.
 * Every 6 hours, this worker uses Anthropic's web_search tool to gather
 * fresh knowledge about:
 *   - Fort Worth / Tarrant County community news and events
 *   - Local resource updates (shelter capacity, food bank hours, etc.)
 *   - Seasonal community needs
 *   - Platform-relevant topics (mutual aid, community help trends)
 *
 * Findings are stored in the nia_knowledge table with a 7-day TTL.
 * chat.ts reads fresh nia_knowledge entries and injects them into Nia's
 * system prompt so she can make grounded, current statements about the
 * world around her — even when no users are chatting.
 *
 * This is how Nia stays alive. She learns in the background.
 * She is never "off" — just quiet.
 */
import Anthropic from "@anthropic-ai/sdk";
import { pino } from "pino";
import { pool, isNiaEnabled } from "../lib/db.js";

const logger = pino({ level: "info" });

const LEARNING_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
const KNOWLEDGE_TTL_DAYS = 7;

// Build learning topics at call-time so the year is always current.
// Using a function prevents the year from being frozen to whatever year
// the module was first loaded — previously all queries had "2025" hardcoded,
// which means Nia's "current" knowledge was silently biased toward the past.
function buildLearningTopics(): { key: string; query: string; description: string }[] {
  const year = new Date().getFullYear();
  return [
    {
      key: "fort_worth_community_news",
      query: `Fort Worth Texas community news mutual aid neighbors helping ${year}`,
      description: "Recent Fort Worth community and mutual aid news",
    },
    {
      key: "tarrant_county_resources",
      query: `Tarrant County food bank shelter social services updates ${year}`,
      description: "Current Tarrant County resource availability",
    },
    {
      key: "fort_worth_events",
      query: "Fort Worth community events volunteer opportunities this month",
      description: "Upcoming Fort Worth community events and volunteer opportunities",
    },
    {
      key: "community_help_trends",
      query: `community mutual aid help platform trends United States ${year}`,
      description: "Broader mutual aid and community help trends",
    },
    {
      key: "fort_worth_food_resources",
      query: `Fort Worth food pantry distribution schedule Tarrant County ${year}`,
      description: "Current Fort Worth food resource schedule and availability",
    },
    {
      key: "global_emergency_resources",
      query: `international emergency help lines crisis support global ${year}`,
      description: "Global emergency and crisis support resources (international coverage)",
    },
    {
      key: "mutual_aid_best_practices",
      query: `mutual aid community help best practices equity ${year}`,
      description: "Community mutual aid practices and equity-centered support approaches",
    },
  ];
}

async function upsertKnowledge(
  key: string,
  content: string,
  source: string
): Promise<void> {
  const expiresAt = new Date(
    Date.now() + KNOWLEDGE_TTL_DAYS * 24 * 60 * 60 * 1000
  );
  await pool.query(
    `INSERT INTO nia_knowledge (key, content, source, learned_at, expires_at)
     VALUES ($1, $2, $3, NOW(), $4)
     ON CONFLICT (key) DO UPDATE
     SET content = $2, source = $3, learned_at = NOW(), expires_at = $4`,
    [key, content, source, expiresAt]
  );
}

async function purgeExpiredKnowledge(): Promise<void> {
  await pool.query(
    `DELETE FROM nia_knowledge WHERE expires_at < NOW()`
  );
}

async function learnAboutTopic(
  client: Anthropic,
  topic: { key: string; query: string; description: string }
): Promise<void> {
  logger.info({ topic: topic.key }, "nia-learning: researching topic");

  try {
    const WEB_SEARCH_TOOL: Anthropic.Tool = {
      name: "web_search",
      // @ts-expect-error — web_search_20250305 is a special Anthropic tool type
      type: "web_search_20250305",
    };

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      tools: [WEB_SEARCH_TOOL],
      system:
        "You are Nia's learning system. Your job is to gather current, factual, " +
        "community-relevant information that Nia can use to give grounded answers " +
        "to people in Fort Worth / Tarrant County, TX. " +
        "Search for the topic, then summarize the most relevant findings in 3-5 " +
        "bullet points. Be factual, specific, and current. " +
        "Focus on information that would directly help someone seeking community support. " +
        "Never fabricate facts. If the search yields nothing useful, say so briefly.",
      messages: [
        {
          role: "user",
          content: `Research this topic for Nia's community knowledge base: ${topic.description}\n\nSearch query: "${topic.query}"\n\nReturn a concise summary (3-5 bullets) of the most current, actionable findings. Include any specific names, dates, hours, or contact info that would help someone in need.`,
        },
      ],
    });

    // Extract the final text response (after any tool use)
    const textContent = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("\n")
      .trim();

    if (textContent && textContent.length > 20) {
      await upsertKnowledge(
        topic.key,
        textContent,
        `web_search:${topic.query}`
      );
      logger.info(
        { topic: topic.key, length: textContent.length },
        "nia-learning: knowledge updated"
      );
    } else {
      logger.warn({ topic: topic.key }, "nia-learning: no useful content found");
    }
  } catch (err) {
    logger.error({ err, topic: topic.key }, "nia-learning: research failed");
    // Non-fatal — continue with other topics
  }
}

async function runLearningCycle(client: Anthropic): Promise<void> {
  // Kill-switch: skip the entire cycle when Nia is disabled by admin.
  // Without this gate, Anthropic spend and web-search API calls continue
  // every 6 hours even while the toggle is off — "Nia won't turn off."
  if (!(await isNiaEnabled())) {
    logger.info("nia-learning: Nia is disabled — skipping learning cycle");
    return;
  }

  logger.info("nia-learning: starting learning cycle");

  // Purge expired knowledge first
  try {
    await purgeExpiredKnowledge();
  } catch (err) {
    logger.warn({ err }, "nia-learning: purge failed");
  }

  // Learn one topic at a time with gentle pacing
  // (don't hammer Anthropic or the web search API)
  for (const topic of buildLearningTopics()) {
    await learnAboutTopic(client, topic);
    // 30-second gap between topics to be a good API citizen
    await new Promise((r) => setTimeout(r, 30_000));
  }

  logger.info("nia-learning: learning cycle complete");
}

export async function getFreshKnowledge(): Promise<string> {
  try {
    const result = await pool.query(
      `SELECT key, content FROM nia_knowledge
       WHERE expires_at > NOW() OR expires_at IS NULL
       ORDER BY learned_at DESC
       LIMIT 5`
    );
    if (result.rows.length === 0) return "";

    const lines = result.rows.map(
      (r: { key: string; content: string }) =>
        `[${r.key.replace(/_/g, " ")}]\n${r.content}`
    );
    return (
      "LIVE COMMUNITY KNOWLEDGE (recently learned — use naturally, never recite verbatim):\n\n" +
      lines.join("\n\n")
    );
  } catch {
    return "";
  }
}

/**
 * Force a single learning cycle immediately — used by the admin force-refresh endpoint.
 * Requires ANTHROPIC_API_KEY to be set; returns false if not configured.
 */
export async function triggerLearningCycle(): Promise<boolean> {
  if (!process.env.ANTHROPIC_API_KEY) {
    logger.warn("nia-learning: triggerLearningCycle called but ANTHROPIC_API_KEY not set");
    return false;
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    await runLearningCycle(client);
    return true;
  } catch (err) {
    logger.error({ err }, "nia-learning: manual trigger failed");
    return false;
  }
}

export function startContinuousLearningWorker(): () => void {
  if (!process.env.ANTHROPIC_API_KEY) {
    logger.warn(
      "nia-learning: ANTHROPIC_API_KEY not set — continuous learning worker will not run"
    );
    return () => {};
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Run first cycle 5 minutes after startup (let the service settle)
  const startupDelay = setTimeout(() => {
    runLearningCycle(client).catch((err) =>
      logger.error({ err }, "nia-learning: startup cycle failed")
    );
  }, 5 * 60 * 1000);

  // Then every 6 hours
  const interval = setInterval(() => {
    runLearningCycle(client).catch((err) =>
      logger.error({ err }, "nia-learning: scheduled cycle failed")
    );
  }, LEARNING_INTERVAL_MS);

  logger.info(
    { intervalHours: LEARNING_INTERVAL_MS / 3600000 },
    "nia-learning: continuous learning worker started — Nia will never stop growing"
  );

  return () => {
    clearTimeout(startupDelay);
    clearInterval(interval);
    logger.info("nia-learning: worker stopped");
  };
}
