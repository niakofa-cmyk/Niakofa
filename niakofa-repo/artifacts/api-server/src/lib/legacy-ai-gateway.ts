/**
 * Legacy AI Gateway — single choke point for all Legacy Engine AI calls.
 *
 * Every route that needs an Anthropic narration or quest generation goes
 * through here. Changing the model for the entire Legacy Engine is a
 * one-line env-var change (LEGACY_AI_MODEL) instead of a multi-file
 * find-and-replace.
 *
 * Usage:
 *   import { legacyAI } from "../lib/legacy-ai-gateway";
 *   const response = await legacyAI.generate({ system, userPrompt, maxTokens });
 */

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger";

const DEFAULT_MODEL = "claude-3-5-haiku-20241022";

function getModel(): string {
  return process.env.LEGACY_AI_MODEL || DEFAULT_MODEL;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

export interface LegacyAIRequest {
  system: string;
  userPrompt: string;
  maxTokens?: number;
}

export interface LegacyAIResponse {
  content: string;
  model: string;
  metadata: Record<string, unknown>;
}

class LegacyAIGateway {
  /**
   * Generate text via Anthropic. Returns the concatenated text from all
   * text content blocks in the response (not just content[0]).
   *
   * On failure, returns a fallback object with model="fallback" and
   * empty metadata — the caller is responsible for producing fallback
   * narration text.
   */
  async generate(req: LegacyAIRequest): Promise<LegacyAIResponse> {
    const model = getModel();
    const maxTokens = req.maxTokens ?? 400;

    try {
      const anthropic = getClient();
      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        system: req.system,
        messages: [{ role: "user", content: req.userPrompt }],
      });

      const textBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === "text",
      );
      const content = textBlocks.map((b) => b.text).join("");

      return {
        content,
        model,
        metadata: {
          stop_reason: response.stop_reason,
          usage: response.usage,
        },
      };
    } catch (err) {
      logger.warn({ err, model }, "legacy-ai-gateway: AI call failed");
      return {
        content: "",
        model: "fallback",
        metadata: {},
      };
    }
  }
}

export const legacyAI = new LegacyAIGateway();
