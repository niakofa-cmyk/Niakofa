import { describe, test } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "../..");
const client = fs.readFileSync(path.join(appRoot, "lib/community-story-client.ts"), "utf8");
const feed = fs.readFileSync(path.join(appRoot, "components/community/CommunityMomentsExperience.tsx"), "utf8");

describe("Community Spark comments client contract", () => {
  test("uses the dedicated GET/POST/DELETE comment request paths", () => {
    assert.match(client, /getStoryComments\(storyId: number, signal\?: AbortSignal\)/);
    assert.match(client, /`\/api\/community\/stories\/\$\{storyId\}\/comments`/);
    assert.match(client, /postStoryComment\(storyId: number, body: string\)/);
    assert.match(client, /method: "POST"/);
    assert.match(client, /deleteStoryComment\(storyId: number, commentId: number\)/);
    assert.match(client, /`\/api\/community\/stories\/\$\{storyId\}\/comments\/\$\{commentId\}`/);
    assert.match(client, /method: "DELETE"/);
  });

  test("keeps public comments separate from private Reply and does not gate them with reply_enabled", () => {
    assert.match(feed, /button-spark-comments-/);
    assert.match(feed, /openComments\(spark\.id\)/);
    assert.match(feed, /postStoryComment\(commentsOpenId, commentDraft\.trim\(\)\)/);
    const commentsButton = feed.slice(feed.indexOf("button-spark-comments-"), feed.indexOf("button-spark-comments-") + 500);
    assert.doesNotMatch(commentsButton, /reply_enabled/);
    assert.match(feed, /aria-label=\{spark\.reply_enabled === false \? "Replies are off"/);
  });

  test("covers loading, empty, error/retry, posting, pending, and delete UI states", () => {
    assert.match(feed, /commentsLoading/);
    assert.match(feed, /Loading comments/);
    assert.match(feed, /No public comments yet/);
    assert.match(feed, /commentsError/);
    assert.match(feed, /loadComments\(commentsSpark\.id\)/);
    assert.match(feed, /commentPosting/);
    assert.match(feed, /moderation_pending/);
    assert.match(feed, /await deleteStoryComment\(commentsOpenId, commentId\)/);
    assert.match(feed, /await loadComments\(commentsOpenId\)/);
    assert.match(feed, /role="dialog"/);
    assert.match(feed, /event\.key === "Escape"/);
    assert.match(feed, /aria-live="polite"/);
    assert.match(feed, /commentsDialogRef/);
    assert.match(feed, /commentsTriggerRef\.current\?\.focus\(\)/);
    assert.match(feed, /event\.key !== "Tab"/);
    assert.match(feed, /index === -1 \|\| current === dialog/);
    assert.match(feed, /commentsRequestRef\.current\.controller\?\.abort\(\)/);
    assert.match(feed, /commentsRequestRef\.current\.sequence !== sequence/);
    assert.match(client, /signal\?: AbortSignal/);
  });
});