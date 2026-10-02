import { promises as fs } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const hubRoutePath = new URL("../routes/community-hub-feed.ts", import.meta.url);

describe("private Hub media streaming contract", () => {
  it("streams member-only Hub attachments through the same-origin API", async () => {
    const route = await fs.readFile(hubRoutePath, "utf8");

    expect(route).toContain('router.get("/community/media/:mediaId", requireAuth, requireApproved, generalApiLimiter');
    expect(route).toContain("isApprovedHubMember(req.authenticatedUserId!, media.hub_id)");
    expect(route).toContain("await streamAssetSameOrigin(key, res);");
    expect(route).not.toContain("await streamOrRedirectAsset(key, res);");
  });
});