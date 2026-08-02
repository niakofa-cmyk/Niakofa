/**
 * Niakofa — Legacy Engine AI Gateway
 *
 * A single choke point for every AI call the Legacy Engine makes (quest
 * generation, dialogue, narration, chapter summaries, historical context,
 * ancestor introductions, and future extraction work). Callers should go
 * through `generateLegacyAiText` instead of instantiating their own
 * `Anthropic` client and hardcoding a model string.
 *
 * Why this exists: before this file, the model name was duplicated as a
 * literal string in legacy.ts (quest generation) and legacy-game-master.ts
 * (narration), independently. Changing models meant a multi-file
 * find-and-replace and risked the two call sites drifting out of sync.
 *
 * This does NOT change any prompt content or response handling — each
 * caller still builds its own system/user prompt and parses the response
 * however it needs to (raw text for narration, JSON array for quests).
 * It only centralizes: which model is called, the API key/client setup,
 * and structured logging of model provenance.
 */

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger";

// Default kept identical to the model every existing Legacy Engine call site
// already used, so wiring routes through this gateway is a no-op change in
// behavior. Override via LEGACY_AI_MODEL env var to roll out a different
// model to every Legacy Engine AI call at once.
const DEFAULT_MODEL = "claude-3-5-haiku-20241022";

export function getLegacyAiModel(): string {
  return process.env.LEGACY_AI_MODEL?.trim() || DEFAULT_MODEL;
}

export interface LegacyAiRequest {
  /** Optional system prompt (used by narration; quest generation currently
   * folds everything into the user prompt, so this is optional). */
  system?: string;
  /** The user-turn prompt content. */
  prompt: string;
  maxTokens: number;
}

export interface LegacyAiResult {
  text: string;
  model: string;
  stopReason: string | null;
  usage: unknown;
}

/**
 * Calls the configured Legacy Engine AI model and returns the concatenated
 * text content. Throws on any failure (missing API key, network error,
 * non-text response) — callers are expected to catch and fall back to their
 * existing template/fallback content, matching the pattern already used in
 * every Legacy Engine AI call site before this gateway existed.
 */
export async function generateLegacyAiText(req: LegacyAiRequest): Promise<LegacyAiResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  const model = getLegacyAiModel();
  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model,
    max_tokens: req.maxTokens,
    ...(req.system ? { system: req.system } : {}),
    messages: [{ role: "user", content: req.prompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  if (!text) {
    throw new Error("Legacy AI Gateway: model returned no text content");
  }

  logger.info(
    { model, stopReason: response.stop_reason, usage: response.usage },
    "legacy-ai-gateway: generation succeeded",
  );

  return {
    text,
    model,
    stopReason: response.stop_reason,
    usage: response.usage,
  };
}
