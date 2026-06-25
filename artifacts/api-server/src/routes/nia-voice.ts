/**
 * Nia Voice I/O (Phase 6)
 *
 * Two endpoints:
 *   POST /api/nia/voice/transcribe — audio in, transcribed text out (STT)
 *   POST /api/nia/voice/speak      — text in, audio out (TTS)
 *
 * This is a real, working first version, not the eventual sentence-by-
 * sentence streaming TTS layered onto the SSE chat pipe in nia-proxy.ts —
 * that's a larger follow-up (it changes the latency contract of the whole
 * chat response, not just adds an endpoint). This version: record a whole
 * utterance, transcribe it, send it through the existing text chat flow as
 * normal; once Nia's full text response is back, optionally fetch TTS for
 * the complete response and play it.
 *
 * Provider: OpenAI (Whisper for STT, the TTS API for speech). Called via
 * native fetch rather than the openai SDK to avoid adding a new dependency
 * for two endpoints — if voice usage grows, revisit and add the real SDK.
 * Requires OPENAI_API_KEY. If unset, both routes return 503 rather than
 * silently failing or fronting a cost-incurring call that can't work.
 */
import { Router, type Request, type Response } from "express";
import express from "express";
import { requireAuth } from "../middlewares/auth";
import { voiceLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";

const router = Router();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10MB — generous for a single voice message
const MAX_TTS_CHARS = 2000; // matches the chat message length cap on the way back

// Exported so app.ts can mount it on this exact path BEFORE the global
// express.json() body parser — same pattern already used for the Stripe and
// identity-verification webhooks (see app.ts). express.json() ignores
// non-JSON content-types by default, but it never gets the chance to: this
// has to be registered first, on the exact route, or req.body would be `{}`
// instead of the raw audio Buffer this route needs.
export const voiceAudioRawParser = express.raw({
  type: ["audio/webm", "audio/mp4", "audio/wav", "audio/mpeg", "audio/ogg"],
  limit: "10mb",
});

// ── POST /nia/voice/transcribe — audio in, text out ───────────────────────────
// Body: raw audio bytes (audio/webm, audio/mp4, audio/wav, audio/mpeg).
// Frontend sends whatever MediaRecorder produced — modern browsers default to
// audio/webm;codecs=opus, which Whisper accepts directly.
router.post(
  "/nia/voice/transcribe",
  requireAuth,
  voiceLimiter,
  async (req: Request, res: Response) => {
    if (!OPENAI_API_KEY) {
      return res.status(503).json({ error: "Voice transcription is not configured." });
    }
    const audio = req.body as Buffer;
    if (!Buffer.isBuffer(audio) || audio.length === 0) {
      return res.status(400).json({ error: "No audio data received." });
    }
    if (audio.length > MAX_AUDIO_BYTES) {
      return res.status(413).json({ error: "Audio clip is too long." });
    }

    const contentType = req.headers["content-type"] || "audio/webm";
    const ext = contentType.includes("wav")
      ? "wav"
      : contentType.includes("mp4") || contentType.includes("m4a")
      ? "m4a"
      : contentType.includes("mpeg") || contentType.includes("mp3")
      ? "mp3"
      : "webm";

    try {
      const form = new FormData();
      form.append("file", new Blob([audio], { type: contentType }), `voice.${ext}`);
      form.append("model", "whisper-1");

      const upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: form,
      });

      if (!upstream.ok) {
        const errText = await upstream.text().catch(() => "");
        logger.error({ status: upstream.status, errText }, "voice: transcription upstream error");
        return res.status(502).json({ error: "Couldn't transcribe that. Please try again or type instead." });
      }

      const data = (await upstream.json()) as { text?: string };
      const text = (data.text ?? "").trim();
      if (!text) {
        return res.status(422).json({ error: "Didn't catch that — could you try again?" });
      }
      return res.json({ text });
    } catch (err) {
      logger.error({ err }, "voice: transcription failed");
      return res.status(502).json({ error: "Couldn't transcribe that. Please try again or type instead." });
    }
  }
);

// ── POST /nia/voice/speak — text in, audio out ────────────────────────────────
// Body: { text: string }. Returns audio/mpeg bytes directly (not SSE — this
// is a one-shot conversion of a complete, already-generated response, not a
// live stream).
router.post("/nia/voice/speak", requireAuth, voiceLimiter, async (req: Request, res: Response) => {
  if (!OPENAI_API_KEY) {
    return res.status(503).json({ error: "Voice playback is not configured." });
  }

  const body = req.body as Record<string, unknown>;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return res.status(400).json({ error: "text is required." });
  }
  if (text.length > MAX_TTS_CHARS) {
    return res.status(400).json({ error: `text is too long (max ${MAX_TTS_CHARS} characters).` });
  }

  try {
    const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: "nova", // warm, neutral-leaning voice — closest stock match to Nia's tone
        input: text,
        response_format: "mp3",
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => "");
      logger.error({ status: upstream.status, errText }, "voice: TTS upstream error");
      return res.status(502).json({ error: "Couldn't generate audio for that." });
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");

    const reader = upstream.body.getReader();
    req.on("close", () => reader.cancel());
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.writableEnded) res.write(value);
    }
    if (!res.writableEnded) res.end();
  } catch (err) {
    logger.error({ err }, "voice: TTS failed");
    if (!res.headersSent) {
      res.status(502).json({ error: "Couldn't generate audio for that." });
    } else if (!res.writableEnded) {
      res.end();
    }
  }
});

export default router;
