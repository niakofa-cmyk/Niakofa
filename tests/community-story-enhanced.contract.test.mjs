import assert from "node:assert/strict";
import fs from "node:fs";

const rail = fs.readFileSync("artifacts/pay-it-forward/src/components/community/CommunityStoryRail.tsx", "utf8");
const interactionClient = fs.readFileSync("artifacts/pay-it-forward/src/lib/community-story-client.ts", "utf8");
const interactions = fs.readFileSync("artifacts/api-server/src/routes/community-story-interactions.ts", "utf8");
const messages = fs.readFileSync("artifacts/api-server/src/routes/direct-messages.ts", "utf8");
const scheduler = fs.readFileSync("artifacts/api-server/src/lib/scheduler.ts", "utf8");

assert.match(rail, /StoryMediaPlayer/);
assert.match(rail, /StoryShareSheet/);
assert.match(rail, /\/api\/community\/stories/);
assert.match(interactionClient, /story_id: input\.storyId/);
assert.match(interactions, /communityStoryViewsTable/);
assert.match(interactions, /communityStoryReactionsTable/);
assert.match(interactions, /communityStorySharesTable/);
assert.match(messages, /application\/x-niakofa-story\+json/);
assert.match(messages, /communityStoriesTable/);
assert.match(scheduler, /startCommunityStoryCleanupWorker/);
assert.doesNotMatch(rail, /\/api\/messages\/stories/);
assert.doesNotMatch(messages, /message_stories/);
