/**
 * Griot Transcription Worker
 *
 * Runs every 2 minutes. Processes griot_transcription_jobs (queued when a
 * story is created with audio_url and/or needs translation drafts — see
 * POST /griot/stories in routes/griot.ts).
 *
 * For each queued job:
 *   1. If the story has audio_url but no text_content yet, transcribe it.
 *   2. Once text_content exists (typed directly, or from step 1), call
 *      nia-service's /griot/translate to draft translations via Claude.
 *   3. Advance the story's status recorded/transcribing → pending_review
 *      so it shows up in the existing admin/author review flow.
 *
 * ─── STT provider: OpenAI Whisper ───────────────────────────────────────────
 * Claude's API accepts text, image, and PDF input — not raw audio — so
 * transcription itself goes through OpenAI's Whisper endpoint, the same
 * provider nia-voice.ts already uses for live voice chat with Nia
 * (POST /nia/voice/transcribe). transcribeAudio() downloads the story's
 * audio_url and re-posts the bytes to Whisper. If OPENAI_API_KEY isn't
 * configured, it fails loudly with a clear error (job goes to job.error /
 * logs) rather than faking a transcript — text-only stories are unaffected
 * either way.
 *
 * Idempotency: jobs are claimed atomically (UPDATE ... WHERE status='queued')
 * before any side effect, same pattern as nia-checkin-worker.ts.
 */

import { db, griotStoriesTable, griotTranscriptionJobsTable, systemSettingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { safeFetch } from "../lib/url-safety";

const NIA_SERVICE_URL = process.env.NIA_SERVICE_URL ?? "http://localhost:3001";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 10;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // Whisper's own hard cap

// ── Nia kill-switch check — same fail-closed pattern as nia-checkin-worker ──
async function isNiaEnabled(): Promise<boolean> {
  try {
    const [row] = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "nia_enabled"))
      .limit(1);
    return row?.value === "true";
  } catch {
    return false;
  }
}

/**
 * Downloads the story's recorded audio and transcribes it via OpenAI
 * Whisper — same provider/model nia-voice.ts uses for live voice chat.
 * Throws on any failure (missing key, download failure, upstream error,
 * empty transcript) so the caller's retry/failure bookkeeping applies;
 * never returns a fabricated transcript.
 */
async function transcribeAudio(audioUrl: string): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not configured — cannot transcribe Griot story audio."
    );
  }

  // audio_url is free-form user input (z.string().url() at story creation) —
  // must go through the SSRF guard before we fetch it server-side.
  const audioResp = await safeFetch(audioUrl, { signal: AbortSignal.timeout(30_000) });
  if (!audioResp.ok) {
    throw new Error(`failed to download story audio (${audioResp.status}) from ${audioUrl}`);
  }
  const declaredLength = Number(audioResp.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_AUDIO_BYTES) {
    throw new Error(`story audio (${declaredLength} bytes declared) exceeds Whisper's ${MAX_AUDIO_BYTES}-byte limit`);
  }
  const audioBuffer = Buffer.from(await audioResp.arrayBuffer());
  if (audioBuffer.length === 0) {
    throw new Error("downloaded story audio is empty");
  }
  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    throw new Error(`story audio (${audioBuffer.length} bytes) exceeds Whisper's ${MAX_AUDIO_BYTES}-byte limit`);
  }

  const contentType = audioResp.headers.get("content-type") ?? "audio/webm";
  const ext = contentType.includes("wav")
    ? "wav"
    : contentType.includes("mp4") || contentType.includes("m4a")
    ? "m4a"
    : contentType.includes("mpeg") || contentType.includes("mp3")
    ? "mp3"
    : contentType.includes("ogg")
    ? "ogg"
    : "webm";

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audioBuffer)], { type: contentType }), `story.${ext}`);
  form.append("model", "whisper-1");

  const upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(60_000), // Griot stories can run longer than a quick voice-chat clip
  });

  if (!upstream.ok) {
    const errText = (await upstream.text().catch(() => "")).slice(0, 300);
    throw new Error(`Whisper transcription upstream error ${upstream.status}: ${errText}`);
  }

  const data = (await upstream.json()) as { text?: string };
  const text = (data.text ?? "").trim();
  if (!text) {
    throw new Error("Whisper returned an empty transcript");
  }
  return text;
}

async function draftTranslations(storyId: number, textContent: string, sourceLanguage: string): Promise<void> {
  const resp = await fetch(`${NIA_SERVICE_URL}/griot/translate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": INTERNAL_SECRET,
    },
    body: JSON.stringify({ storyId, textContent, sourceLanguage }),
  });

  if (!resp.ok && resp.status !== 207) {
    const body = await resp.text().catch(() => "");
    throw new Error(`nia-service /griot/translate returned ${resp.status}: ${body}`);
  }
  // 207 (partial failure on some languages) is logged by nia-service itself;
  // we don't fail the whole job over one language's translation failing.
}

async function processGriotTranscriptionJobs(): Promise<void> {
  if (!(await isNiaEnabled())) {
    logger.debug("griot-transcription-worker: skipped — Nia is disabled (kill-switch)");
    return;
  }

  const queued = await db
    .select()
    .from(griotTranscriptionJobsTable)
    .where(eq(griotTranscriptionJobsTable.status, "queued"))
    .limit(BATCH_SIZE);

  if (queued.length === 0) return;

  logger.info({ count: queued.length }, "griot-transcription-worker: processing jobs");

  for (const job of queued) {
    // Atomic claim — only one worker instance wins this job.
    const claimed = await db
      .update(griotTranscriptionJobsTable)
      .set({ status: "processing", started_at: new Date(), attempts: job.attempts + 1 })
      .where(and(
        eq(griotTranscriptionJobsTable.id, job.id),
        eq(griotTranscriptionJobsTable.status, "queued"),
      ))
      .returning();

    if (claimed.length === 0) {
      logger.info({ jobId: job.id }, "griot-transcription-worker: already claimed, skipping");
      continue;
    }

    try {
      const [story] = await db
        .select()
        .from(griotStoriesTable)
        .where(eq(griotStoriesTable.id, job.story_id))
        .limit(1);

      if (!story) {
        throw new Error(`story ${job.story_id} not found`);
      }

      let textContent = story.text_content;

      // Step 1: transcribe audio if there's no text yet.
      if (!textContent && story.audio_url) {
        await db
          .update(griotStoriesTable)
          .set({ status: "transcribing", updated_at: new Date() })
          .where(eq(griotStoriesTable.id, story.id));

        textContent = await transcribeAudio(story.audio_url);

        await db
          .update(griotStoriesTable)
          .set({ text_content: textContent, updated_at: new Date() })
          .where(eq(griotStoriesTable.id, story.id));
      }

      if (!textContent) {
        throw new Error("story has neither text_content nor a transcribable audio_url");
      }

      // Step 2: draft translations now that real text exists.
      await draftTranslations(story.id, textContent, story.original_language);

      // Step 3: hand off to the existing human review flow.
      await db
        .update(griotStoriesTable)
        .set({ status: "pending_review", updated_at: new Date() })
        .where(eq(griotStoriesTable.id, story.id));

      await db
        .update(griotTranscriptionJobsTable)
        .set({ status: "done", completed_at: new Date() })
        .where(eq(griotTranscriptionJobsTable.id, job.id));

      logger.info({ jobId: job.id, storyId: story.id }, "griot-transcription-worker: done");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attempts = job.attempts + 1;
      const willRetry = attempts < MAX_ATTEMPTS;

      await db
        .update(griotTranscriptionJobsTable)
        .set({ status: willRetry ? "queued" : "failed", error: message })
        .where(eq(griotTranscriptionJobsTable.id, job.id));

      logger.error(
        { err, jobId: job.id, storyId: job.story_id, attempts, willRetry },
        "griot-transcription-worker: job failed"
      );
      // Continue to the next job — one failure shouldn't block the batch.
    }
  }
}

export function startGriotTranscriptionWorker(): () => void {
  processGriotTranscriptionJobs().catch((err) =>
    logger.error({ err }, "griot-transcription-worker: initial run failed")
  );

  const interval = setInterval(
    () =>
      processGriotTranscriptionJobs().catch((err) =>
        logger.error({ err }, "griot-transcription-worker: scheduled run failed")
      ),
    POLL_INTERVAL_MS
  );

  return () => clearInterval(interval);
}
