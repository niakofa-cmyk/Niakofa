/**
 * Nia Voice I/O — STT + TTS with regional voice profiles
 *
 * Endpoints:
 *   POST /api/nia/voice/transcribe  — audio in  → transcribed text (STT via Whisper)
 *   POST /api/nia/voice/speak       — text in   → audio/mpeg (TTS via ElevenLabs or OpenAI)
 *   GET  /api/nia/voice/profiles    — list all voice profiles with availability flags
 *
 * Voice routing philosophy:
 *   If the user's chosen voiceProfile has a licensed ElevenLabs voice (i.e. the
 *   ELEVENLABS_VOICE_<name> env var is set alongside ELEVENLABS_API_KEY), the
 *   request is routed to ElevenLabs for an authentic community voice.
 *   Otherwise it falls back to OpenAI "nova" silently — so the app always works,
 *   even before any voices are licensed.
 *
 * Requires:
 *   OPENAI_API_KEY        — for Whisper STT and OpenAI TTS fallback
 *   ELEVENLABS_API_KEY    — for ElevenLabs TTS (optional, unlocks regional voices)
 *   ELEVENLABS_VOICE_*    — per-profile voice IDs (see voiceProfiles.ts)
 */
import { Router, type Request, type Response } from "express";
import express from "express";
import { requireAuth } from "../middlewares/auth";
import { voiceLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import {
  VOICE_PROFILE_LIST,
  resolveVoiceProfile,
  ELEVENLABS_API_KEY,
  ELEVENLABS_BASE,
} from "../lib/voiceProfiles";

const router = Router();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10MB — generous for a single voice message
const MAX_TTS_CHARS = 2000;

// Exported so app.ts can mount it BEFORE the global express.json() body parser.
// express.json() ignores non-JSON content-types normally, but registering the
// raw parser first on the exact route is cleaner and prevents surprises.
export const voiceAudioRawParser = express.raw({
  type: ["audio/webm", "audio/mp4", "audio/wav", "audio/mpeg", "audio/ogg"],
  limit: "10mb",
});

// ── GET /nia/voice/profiles — list all voice profiles ────────────────────────
// Returns all registered profiles with an `available` flag so the frontend
// settings screen can show which voices are ready vs. coming soon.
// Public metadata — no auth required (no PII exposed, just a feature list).
router.get("/nia/voice/profiles", async (_req: Request, res: Response) => {
  const profiles = VOICE_PROFILE_LIST.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    community: p.community,
    bcp47: p.bcp47,
    // Never expose the actual ElevenLabs voice ID to the client
    available: p.available,
    // The id === "default_en" profile is always available
    isDefault: p.id === "default_en",
  }));

  // Surface whether ElevenLabs is configured at all (helps the settings screen
  // show a "coming soon — contact admin" note vs. a genuine "not set up" note)
  const elevenLabsConfigured = !!ELEVENLABS_API_KEY;

  return res.json({ profiles, elevenLabsConfigured });
});

// ── POST /nia/voice/transcribe — audio in, text out (STT) ─────────────────────
// Body: raw audio bytes (audio/webm, audio/mp4, audio/wav, audio/mpeg).
// Frontend sends whatever MediaRecorder produced — modern browsers default to
// audio/webm;codecs=opus, which Whisper accepts directly.
router.post(
  "/nia/voice/transcribe",
  requireAuth,
  voiceLimiter,
  async (req: Request, res: Response) => {
    if (!OPENAI_API_KEY) {
      return res.status(503).json({ error: "Voice transcription is not configured on this server." });
    }
    const audio = req.body as Buffer;
    if (!Buffer.isBuffer(audio) || audio.length === 0) {
      return res.status(400).json({ error: "No audio data received." });
    }
    if (audio.length > MAX_AUDIO_BYTES) {
      return res.status(413).json({ error: "Audio clip is too long. Please keep it under a minute." });
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
      form.append(
        "file",
        new Blob([new Uint8Array(audio)], { type: contentType }),
        `voice.${ext}`
      );
      form.append("model", "whisper-1");

      const upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: form,
        signal: AbortSignal.timeout(30_000), // 30s — Whisper can be slow on long audio
      });

      if (!upstream.ok) {
        const errText = (await upstream.text().catch(() => "")).slice(0, 200); // truncate — may contain user text
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

// ── POST /nia/voice/speak — text in, audio out (TTS) ─────────────────────────
// Body: { text: string, voiceProfile?: string }
//
// Voice routing:
//   1. If voiceProfile is set AND that profile has a licensed ElevenLabs voice
//      AND ELEVENLABS_API_KEY is set → stream from ElevenLabs.
//   2. Otherwise → stream from OpenAI TTS (nova voice, always available when
//      OPENAI_API_KEY is set).
//   3. If neither key is configured → 503.
//
// Returns audio/mpeg bytes directly (not SSE — this is a one-shot TTS call for
// a complete Nia response, not a live streaming layer).
router.post("/nia/voice/speak", requireAuth, voiceLimiter, async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return res.status(400).json({ error: "text is required." });
  }
  if (text.length > MAX_TTS_CHARS) {
    return res.status(400).json({ error: `text is too long (max ${MAX_TTS_CHARS} characters).` });
  }

  // Resolve which voice profile to use
  const profileId = typeof body.voiceProfile === "string" ? body.voiceProfile : undefined;
  const profile = resolveVoiceProfile(profileId);

  // ── Path 1: ElevenLabs (licensed community voice) ────────────────────────
  if (profile.elevenLabsVoiceId && ELEVENLABS_API_KEY) {
    logger.info({ profile: profile.id, voice_id: profile.elevenLabsVoiceId }, "voice: routing to ElevenLabs");
    try {
      const upstream = await fetch(
        `${ELEVENLABS_BASE}/text-to-speech/${profile.elevenLabsVoiceId}/stream`,
        {
          method: "POST",
          signal: AbortSignal.timeout(20_000), // 20s — ElevenLabs streaming should start quickly
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0.0,
              use_speaker_boost: true,
            },
          }),
        }
      );

      if (!upstream.ok || !upstream.body) {
        const errText = (await upstream.text().catch(() => "")).slice(0, 200);
        logger.warn(
          { status: upstream.status, errText, profile: profile.id },
          "voice: ElevenLabs failed — falling back to OpenAI"
        );
        // Fall through to OpenAI fallback below
      } else {
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Voice-Provider", "elevenlabs");
        res.setHeader("X-Voice-Profile", profile.id);

        const reader = upstream.body.getReader();
        req.on("close", () => reader.cancel());
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!res.writableEnded) res.write(value);
        }
        if (!res.writableEnded) res.end();
        return;
      }
    } catch (err) {
      logger.warn({ err, profile: profile.id }, "voice: ElevenLabs exception — falling back to OpenAI");
      // Fall through to OpenAI fallback
    }
  }

  // ── Path 2: OpenAI TTS (default / fallback) ───────────────────────────────
  if (!OPENAI_API_KEY) {
    return res.status(503).json({
      error: "Voice playback is not configured on this server. " +
             "Ask the operator to set OPENAI_API_KEY (or ELEVENLABS_API_KEY for community voices).",
    });
  }

  logger.info({ profile: profile.id }, "voice: routing to OpenAI nova");
  try {
    const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      signal: AbortSignal.timeout(20_000), // 20s abort
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: "nova", // warm, neutral — closest stock match to Nia's tone
        input: text,
        response_format: "mp3",
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = (await upstream.text().catch(() => "")).slice(0, 200);
      logger.error({ status: upstream.status, errText }, "voice: OpenAI TTS upstream error");
      return res.status(502).json({ error: "Couldn't generate audio for that response." });
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Voice-Provider", "openai");
    res.setHeader("X-Voice-Profile", profile.id);

    const reader = upstream.body.getReader();
    req.on("close", () => reader.cancel());
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.writableEnded) res.write(value);
    }
    if (!res.writableEnded) res.end();
    return;
  } catch (err) {
    logger.error({ err }, "voice: OpenAI TTS failed");
    if (!res.headersSent) {
      return res.status(502).json({ error: "Couldn't generate audio for that response." });
    } else if (!res.writableEnded) {
      res.end();
    }
    return;
  }
});

export default router;
