import { promises as fs } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const routePath = new URL("../routes/community-story-watch.ts", import.meta.url);
const schemaPath = new URL("../../../../lib/db/src/schema/community-story-watch.ts", import.meta.url);
const migrationPath = new URL("../../../../lib/db/migrations/0187_community_story_watch.sql", import.meta.url);
const retentionMigrationPath = new URL("../../../../lib/db/migrations/0188_community_story_watch_retention.sql", import.meta.url);
const schedulerPath = new URL("../lib/scheduler.ts", import.meta.url);
const panelPath = new URL("../../../pay-it-forward/src/components/community/CreatorInsightsPanel.tsx", import.meta.url);

describe("independent Community Story watch analytics", () => {
  it("requires readable, published, unexpired stories and bounds authenticated playback events", async () => {
    const route = await fs.readFile(routePath, "utf8");
    expect(route).toMatch(/requireAuth, requireApproved, generalApiLimiter/);
    expect(route).toMatch(/story\.status !== "published"/);
    expect(route).toMatch(/story\.expires_at <= new Date\(\)/);
    expect(route).toMatch(/viewerCanReadStory\(viewerId, story\)/);
    expect(route).toMatch(/duration > MAX_DURATION_MS/);
    expect(route).toMatch(/typeof completed !== "boolean"/);
    expect(route).toMatch(/client_event_id: eventId/);
    expect(route).toMatch(/onConflictDoNothing\(\)/);
    expect(route).toMatch(/story\.author_user_id === viewerId/);
  });

  it("limits aggregate analytics to the authenticated creator and gates retention globally and per daily cohort", async () => {
    const route = await fs.readFile(routePath, "utf8");
    expect(route).not.toMatch(/expires_at > NOW\(\)/);
    expect(route).toMatch(/FROM community_story_watch_daily w/);
    expect(route).toMatch(/WHERE w\.creator_user_id = \$\{creatorId\}/);
    expect(route).toMatch(/SELECT COUNT\(\*\)::bigint AS total_plays/);
    expect(route).toMatch(/totalRecordedPlays >= MIN_RETENTION_PLAYS/);
    expect(route).toMatch(/play_day >= \$\{retentionStartDay\}::date/);
    expect(route).toMatch(/COUNT\(\*\) FILTER \(WHERE w\.completed\)/);
    expect(route).toMatch(/MIN_RETENTION_PLAYS = 5/);
    expect(route).toMatch(/retention_rate: retentionAvailable && plays >= MIN_RETENTION_PLAYS/);
    expect(route).toMatch(/retention_minimum_plays: MIN_RETENTION_PLAYS/);
    expect(route).toMatch(/retention_window_days: RETENTION_WINDOW_DAYS/);
    expect(route).toMatch(/total_recorded_plays: totalRecordedPlays/);
    expect(route).toMatch(/retention_available: retentionAvailable/);
    expect(route).toMatch(/rawDays < 1 \|\| rawDays > 90/);
    expect(route).toMatch(/onConflictDoUpdate/);
    expect(route).toMatch(/LEAST\(\$\{communityStoryWatchDailyTable\.duration_ms\} \+ EXCLUDED\.duration_ms/);
    expect(route).toMatch(/communityStoryWatchDailyTable\.completed\} OR EXCLUDED\.completed/);
    expect(route).toMatch(/db\.transaction/);
  });

  it("retains only bounded daily aggregates after story deletion and stores no device, network, or media identifiers", async () => {
    const [schema, migration, retentionMigration, scheduler] = await Promise.all([
      fs.readFile(schemaPath, "utf8"),
      fs.readFile(migrationPath, "utf8"),
      fs.readFile(retentionMigrationPath, "utf8"),
      fs.readFile(schedulerPath, "utf8"),
    ]);
    for (const source of [schema, migration]) {
      expect(source).toMatch(/duration_ms/);
      expect(source).toMatch(/completed/);
      expect(source).toMatch(/community_story_watch_daily_story_viewer_day_uidx/);
      expect(source).toMatch(/community_story_watch_event_key_uidx/);
      expect(source).not.toMatch(/REFERENCES community_stories|REFERENCES \(\(\) => communityStoriesTable/);
      expect(source).not.toMatch(/ip_address|user_agent|storage_key|media_url/i);
    }
    expect(migration).toMatch(/duration_ms >= 0 AND duration_ms <= 300000/);
    expect(schema).toMatch(/duration_ms.*<= 300000/);
    expect(migration).toContain("erase their already-aggregated creator insights.");
    expect(schema).toMatch(/community_story_watch_event_key_play_day_idx/);
    expect(retentionMigration).toMatch(/ADD COLUMN IF NOT EXISTS play_day date/);
    expect(scheduler).toMatch(/COMMUNITY_STORY_WATCH_RETENTION_DAYS = 90/);
    expect(scheduler).toMatch(/communityStoryWatchDailyTable\)\.where\(lt\(/);
    expect(scheduler).toMatch(/communityStoryWatchEventKeysTable\)\.where\(lt\(/);
    expect(scheduler).toMatch(/getUTCDate\(\) - \(COMMUNITY_STORY_WATCH_RETENTION_DAYS - 1\)/);
  });

  it("provides a useful empty state and does not request third-party analytics or media", async () => {
    const panel = await fs.readFile(panelPath, "utf8");
    expect(panel).toMatch(/No watch activity yet/);
    expect(panel).toMatch(/Retention hidden/);
    expect(panel).toMatch(/retention_minimum_plays/);
    expect(panel).toMatch(/total_recorded_plays/);
    expect(panel).toMatch(/rolling \{data\?\.retention_window_days \?\? 90\}-day window/);
    expect(panel).toMatch(/rolling \{data\.retention_window_days\}-day window/);
    expect(panel).toMatch(/\/api\/community\/creator\/watch-insights/);
    expect(panel).not.toMatch(/posthog|youtube|vimeo|storage_key/i);
  });
});