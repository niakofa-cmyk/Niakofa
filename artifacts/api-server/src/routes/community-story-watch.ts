import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import {
  communityStoriesTable,
  communityStoryWatchDailyTable,
  communityStoryWatchEventKeysTable,
  db,
} from "@workspace/db";
import { requireApproved, requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { viewerCanReadStory } from "./community-stories";

const router = Router();
const MAX_DURATION_MS = 5 * 60 * 1000;
const MIN_RETENTION_PLAYS = 5;
const RETENTION_WINDOW_DAYS = 90;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseId(value: unknown): number | null {
  const id = Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

router.post("/community/stories/:id/watch", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const storyId = parseId(req.params.id);
  if (!storyId) return res.status(400).json({ error: "Invalid Story id." });

  const eventId = typeof req.body?.event_id === "string" ? req.body.event_id : "";
  const duration = req.body?.duration_ms;
  const completed = req.body?.completed;
  if (!UUID_PATTERN.test(eventId)) return res.status(400).json({ error: "event_id must be a UUID idempotency key." });
  if (!Number.isSafeInteger(duration) || duration < 0 || duration > MAX_DURATION_MS) {
    return res.status(400).json({ error: `duration_ms must be an integer between 0 and ${MAX_DURATION_MS}.` });
  }
  if (typeof completed !== "boolean") return res.status(400).json({ error: "completed must be a boolean." });

  const viewerId = req.authenticatedUserId!;
  const [story] = await db.select({
    id: communityStoriesTable.id,
    author_user_id: communityStoriesTable.author_user_id,
    hub_id: communityStoriesTable.hub_id,
    community_id: communityStoriesTable.community_id,
    exchange_listing_id: communityStoriesTable.exchange_listing_id,
    audience: communityStoriesTable.audience,
    status: communityStoriesTable.status,
    expires_at: communityStoriesTable.expires_at,
  }).from(communityStoriesTable).where(eq(communityStoriesTable.id, storyId)).limit(1);

  if (!story || story.status !== "published" || story.expires_at <= new Date() || !(await viewerCanReadStory(viewerId, story))) {
    return res.status(404).json({ error: "Story not found." });
  }

  // Creator self-views are not audience plays and must not inflate creator metrics.
  if (story.author_user_id === viewerId) return res.json({ ok: true, recorded: false, reason: "creator_view" });

  const playDay = new Date().toISOString().slice(0, 10);
  let recorded = false;
  await db.transaction(async (tx) => {
    const key = await tx.insert(communityStoryWatchEventKeysTable).values({
      viewer_user_id: viewerId,
      client_event_id: eventId,
      play_day: playDay,
    }).onConflictDoNothing().returning({ id: communityStoryWatchEventKeysTable.id });
    if (key.length === 0) return;

    await tx.insert(communityStoryWatchDailyTable).values({
      story_id: storyId,
      creator_user_id: story.author_user_id,
      viewer_user_id: viewerId,
      play_day: playDay,
      duration_ms: duration,
      completed,
    }).onConflictDoUpdate({
      target: [
        communityStoryWatchDailyTable.story_id,
        communityStoryWatchDailyTable.viewer_user_id,
        communityStoryWatchDailyTable.play_day,
      ],
      set: {
        // Pause/resume contributions accumulate, but one viewer cannot add more
        // than five minutes to a single Story/day even with fresh event IDs.
        duration_ms: sql`LEAST(${communityStoryWatchDailyTable.duration_ms} + EXCLUDED.duration_ms, ${MAX_DURATION_MS})`,
        completed: sql`${communityStoryWatchDailyTable.completed} OR EXCLUDED.completed`,
        updated_at: new Date(),
      },
    });
    recorded = true;
  });

  return res.status(recorded ? 201 : 200).json({ ok: true, recorded });
});

router.get("/community/creator/watch-insights", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const rawDays = typeof req.query.days === "string" ? Number(req.query.days) : 30;
  if (!Number.isInteger(rawDays) || rawDays < 1 || rawDays > 90) {
    return res.status(400).json({ error: "days must be an integer between 1 and 90." });
  }
  const days = rawDays;
  const creatorId = req.authenticatedUserId!;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const endDay = today.toISOString().slice(0, 10);
  const retentionStartDate = new Date(today);
  retentionStartDate.setUTCDate(retentionStartDate.getUTCDate() - (RETENTION_WINDOW_DAYS - 1));
  const retentionStartDay = retentionStartDate.toISOString().slice(0, 10);
  const firstDayDate = new Date(today);
  firstDayDate.setUTCDate(firstDayDate.getUTCDate() - (days - 1));
  const firstDay = firstDayDate.toISOString().slice(0, 10);
  const [totalResult, result] = await Promise.all([
    db.execute<{ total_plays: number | string }>(sql`
      SELECT COUNT(*)::bigint AS total_plays
      FROM community_story_watch_daily
      WHERE creator_user_id = ${creatorId}
        AND play_day >= ${retentionStartDay}::date
        AND play_day <= ${endDay}::date
    `),
    db.execute<{
      day: string;
      watch_ms: number | string;
      plays: number | string;
      completed_plays: number | string;
    }>(sql`
      SELECT w.play_day::text AS day,
        COALESCE(SUM(w.duration_ms), 0)::bigint AS watch_ms,
        COUNT(*)::bigint AS plays,
        COUNT(*) FILTER (WHERE w.completed)::bigint AS completed_plays
      FROM community_story_watch_daily w
      WHERE w.creator_user_id = ${creatorId}
        AND w.play_day >= ${firstDay}::date
        AND w.play_day <= ${endDay}::date
      GROUP BY w.play_day
      ORDER BY w.play_day
    `),
  ]);
  const totalRecordedPlays = Number(totalResult.rows[0]?.total_plays ?? 0);
  const retentionAvailable = totalRecordedPlays >= MIN_RETENTION_PLAYS;
  const byDay = new Map(result.rows.map((row) => [row.day, row]));
  const daily = Array.from({ length: days }, (_, index) => {
    const date = new Date(firstDayDate);
    date.setUTCDate(date.getUTCDate() + index);
    const day = date.toISOString().slice(0, 10);
    const row = byDay.get(day);
    const plays = Number(row?.plays ?? 0);
    const completedPlays = Number(row?.completed_plays ?? 0);
    return {
      day,
      watch_time_ms: Number(row?.watch_ms ?? 0),
      plays,
      retention_rate: retentionAvailable && plays >= MIN_RETENTION_PLAYS ? completedPlays / plays : null,
    };
  });

  return res.json({
    days,
    retention_minimum_plays: MIN_RETENTION_PLAYS,
    retention_window_days: RETENTION_WINDOW_DAYS,
    total_recorded_plays: totalRecordedPlays,
    retention_available: retentionAvailable,
    has_data: daily.some((day) => day.plays > 0),
    daily,
  });
});

export default router;