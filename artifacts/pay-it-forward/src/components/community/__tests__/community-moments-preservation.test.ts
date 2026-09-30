import { describe, test } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "../../../..");
const moments = fs.readFileSync(path.join(appRoot, "src/components/community/CommunityMomentsExperience.tsx"), "utf8");
const directMessages = fs.readFileSync(path.resolve(appRoot, "../api-server/src/routes/direct-messages.ts"), "utf8");
const openApi = fs.readFileSync(path.resolve(appRoot, "../../lib/api-spec/openapi.yaml"), "utf8");

describe("Moment safety and preservation controls", () => {
  test("blocked-user listing returns only outgoing blocks and exposes only public identity fields", () => {
    const endpoint = directMessages.slice(
      directMessages.indexOf('router.get("/messages/direct/blocked-users"'),
      directMessages.indexOf('router.get("/messages/direct/users"', directMessages.indexOf('router.get("/messages/direct/blocked-users"')),
    );
    assert.match(endpoint, /requireAuth, requireApproved/);
    assert.match(endpoint, /eq\(directMessageBlocksTable\.blocker_id, userId\)/);
    assert.match(endpoint, /innerJoin\(usersTable, eq\(usersTable\.id, directMessageBlocksTable\.blocked_id\)\)/);
    assert.match(endpoint, /id: usersTable\.id,\s+name: usersTable\.name,\s+avatar_url: usersTable\.avatar_url/);
    assert.doesNotMatch(endpoint, /blocked_id:|blocker_id:/);
    assert.match(openApi, /getDirectMessageBlockedUsers/);
    assert.match(openApi, /DirectMessageBlockedUsers/);
  });

  test("author blocking is confirmed, uses the existing API hook, and removes the author only after success", () => {
    assert.match(moments, /Blocking also prevents direct messages between you and this account/);
    assert.match(moments, /useBlockDirectMessageUser/);
    assert.match(moments, /await blockUserMutation\.mutateAsync\(\{ id: authorId \}\)/);
    assert.match(moments, /setSparks\(remaining\)/);
    assert.match(moments, /catch \(reason\) \{\s+setInteractionError/);
    assert.match(moments, /button-block-moment-author-/);
  });

  test("only the caller's blocked accounts are manageable, with a reversible unblock control", () => {
    assert.match(moments, /useGetDirectMessageBlockedUsers/);
    assert.match(moments, /useUnblockDirectMessageUser/);
    assert.match(moments, /blockedUsersQuery\.data\?\.blocked_users\.map/);
    assert.match(moments, /await unblockUserMutation\.mutateAsync\(\{ id: userId \}\)/);
    assert.match(moments, /button-manage-blocked-users/);
    assert.match(moments, /button-unblock-user-/);
  });

  test("own captioned Moment action uses the existing private caption-only family dialog/API", () => {
    assert.match(moments, /spark\.author_user_id !== viewerId \|\| \(spark\.caption\?\.trim\(\) \?\? ""\) !== ""/);
    assert.match(moments, /KeepForMyFamilyDialog/);
    assert.match(moments, /button-keep-moment-/);
    assert.match(moments, /open=\{keepMomentId !== null\}/);
    const familyClient = fs.readFileSync(path.join(appRoot, "src/components/family/stories-client.ts"), "utf8");
    assert.match(familyClient, /keepMoment: \(familyId: number, momentId: number\)/);
    assert.match(familyClient, /method: "POST", body: JSON\.stringify\(\{ moment_id: momentId \}\)/);
    assert.match(familyClient, /headers: \{ \.\.\.authHeaders\(\)/);
  });
});