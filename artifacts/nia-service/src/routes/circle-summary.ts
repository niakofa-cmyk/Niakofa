import type { Request, Response } from "express";
import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { timingSafeEqual } from "node:crypto";
import { pino } from "pino";
import { isNiaEnabled } from "../lib/db.js";

const router = Router();
const logger = pino({ level: "info" });
const anthropicApiKey = process.env["ANTHROPIC_API_KEY"];
const anthropic = new Anthropic({ apiKey: anthropicApiKey ?? "" });

function requireInternalSecret(req: Request, res: Response): boolean {
  const configured = process.env["INTERNAL_SECRET"] ?? "";
  if (!configured) {
    logger.error("INTERNAL_SECRET is not configured; rejecting circle summary");
    res.status(503).json({ error: "Service not configured" });
    return false;
  }
  const supplied = req.headers["x-internal-secret"];
  const candidate = Array.isArray(supplied) ? supplied[0] : supplied ?? "";
  const expectedBuffer = Buffer.from(configured, "utf8");
  const candidateBuffer = Buffer.from(candidate, "utf8");
  if (expectedBuffer.length !== candidateBuffer.length || !timingSafeEqual(expectedBuffer, candidateBuffer)) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

const MAX_TITLE_LENGTH = 200;
const MAX_CHAPTERS = 6;
const MAX_CHAPTER_TITLE_LENGTH = 120;
function validatedResult(value: unknown, maxStartSeconds: number | null): { summary: string | null; chapters: Array<{ start: number; title: string }> | null } {
  if (!value || typeof value !== "object") return { summary: null, chapters: null };
  const result = value as { summary?: unknown; chapters?: unknown };
  const summary = typeof result.summary === "string" && result.summary.trim().length > 0
    ? result.summary.trim().slice(0, 2_000) : null;
  if (!Array.isArray(result.chapters) || result.chapters.length < 3 || result.chapters.length > MAX_CHAPTERS) {
    return { summary, chapters: null };
  }
  const chapters = result.chapters.map((chapter) => {
    if (!chapter || typeof chapter !== "object") return null;
    const marker = chapter as { start?: unknown; title?: unknown };
    if (!Number.isFinite(marker.start) || !Number.isInteger(marker.start) || (marker.start as number) < 0 ||
      (maxStartSeconds !== null && (marker.start as number) > maxStartSeconds) ||
      typeof marker.title !== "string" || !marker.title.trim()) return null;
    return { start: Math.floor(marker.start as number), title: marker.title.trim().slice(0, MAX_CHAPTER_TITLE_LENGTH) };
  });
  if (chapters.some((chapter) => chapter === null)) return { summary, chapters: null };
  const validChapters = chapters as Array<{ start: number; title: string }>;
  if (validChapters.some((chapter, index) => index > 0 && chapter.start <= validChapters[index - 1].start)) {
    return { summary, chapters: null };
  }
  return { summary, chapters: validChapters };
}

router.post("/internal/circle-summary", async (req: Request, res: Response) => {
  if (!requireInternalSecret(req, res)) return;
  try {
    if (!(await isNiaEnabled())) return res.status(503).json({ error: "Nia is temporarily unavailable." });
  } catch (err) {
    logger.error({ err }, "circle-summary: unable to read Nia kill switch");
    return res.status(503).json({ error: "Nia is temporarily unavailable." });
  }
  if (!process.env["ANTHROPIC_API_KEY"]) return res.status(503).json({ error: "Service not configured" });

  const body = req.body as Record<string, unknown>;
  if ((body.title !== undefined && typeof body.title !== "string") ||
    (body.topic !== undefined && body.topic !== null && typeof body.topic !== "string") ||
    (body.duration_minutes !== undefined && (typeof body.duration_minutes !== "number" || !Number.isFinite(body.duration_minutes) || body.duration_minutes <= 0))) {
    return res.status(400).json({ error: "Invalid summary request" });
  }
  const title = typeof body.title === "string" ? body.title.trim().slice(0, MAX_TITLE_LENGTH) : "Untitled circle";
  const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, MAX_TITLE_LENGTH) : "General discussion";
  const duration = typeof body.duration_minutes === "number" && Number.isFinite(body.duration_minutes) && body.duration_minutes > 0
    ? Math.min(Math.round(body.duration_minutes), 24 * 60) : null;
  const prompt = `Summarize this community audio circle. Return only JSON: {"summary":"2-3 concise sentences","chapters":[{"start":0,"title":"short label"}]}. Include 3-6 strictly increasing non-negative seconds chapter starts.
Title: ${title || "Untitled circle"}
Topic: ${topic || "General discussion"}
Duration: ${duration ? `${duration} minutes` : "Unknown"}`;
  try {
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022", max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const json = text.match(/\{[\s\S]*\}/);
    let parsed: unknown = null;
    try { parsed = json ? JSON.parse(json[0]) : null; } catch { /* no usable model JSON */ }
    return res.json({ ok: true, ...validatedResult(parsed, duration === null ? null : duration * 60) });
  } catch (err) {
    logger.error({ err }, "circle-summary: provider request failed");
    return res.status(502).json({ error: "Summary generation failed" });
  }
});

export default router;