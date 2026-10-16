import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import {
  buildStoryPlaybackSetCookie,
  issueStoryPlaybackGrant,
  readStoryPlaybackCookie,
  STORY_PLAYBACK_COOKIE_NAME,
  verifyStoryPlaybackGrant,
} from "../lib/community-story-playback";
import { canReadExchangeLinkedStory } from "../lib/community-story-policy";
import { isMomentCompositionStatusVisibleToViewer } from "../lib/moment-video-compose";

describe("review-pending Story media privacy", () => {
  it("allows a ready attachment preview only to its author, not other viewers", () => {
    expect(isMomentCompositionStatusVisibleToViewer("pending", 11, 11)).toBe(true);
    expect(isMomentCompositionStatusVisibleToViewer("pending", 11, 12)).toBe(false);
    for (const status of ["rejected", "deletion_pending", "deleted"]) {
      expect(isMomentCompositionStatusVisibleToViewer(status, 11, 11)).toBe(false);
    }
    const route = readFileSync(new URL("../routes/community-stories.ts", import.meta.url), "utf8");
    const video = route.slice(route.indexOf("async function readableStoryVideoMedia"), route.indexOf("async function momentCompositionForStory"));
    const image = route.slice(route.indexOf('router.get("/community/stories/media/:id"'), route.indexOf('router.post("/community/stories/media/:id/playback-grant"'));
    for (const code of [video, image]) {
      expect(code).toContain("isMomentCompositionStatusVisibleToViewer(row.status, row.author_user_id,");
      expect(code).toContain('row.media_asset_id !== null && row.asset_status !== "ready"');
      expect(code).toContain("viewerCanReadRetainedStory(");
    }
  });
});

const secret = "test-session-secret-with-at-least-32-characters";
const now = 1_800_000_000_000;

describe("secure Story video playback grants", () => {
  it("issues short-lived, media-bound claims and rejects them at expiry", () => {
    const grant = issueStoryPlaybackGrant({
      mediaId: 51,
      userId: 9,
      tokenVersion: 4,
    }, secret, now);

    expect(grant.claims.expiresAt).toBe(now + 120_000);
    expect(verifyStoryPlaybackGrant(grant.value, 51, secret, now)).toEqual(grant.claims);
    expect(verifyStoryPlaybackGrant(grant.value, 51, secret, grant.claims.expiresAt)).toBeNull();
  });

  it("rejects tampered signatures, wrong media ids, and malformed cookie ambiguity", () => {
    const grant = issueStoryPlaybackGrant({ mediaId: 51, userId: 9, tokenVersion: 4 }, secret, now);
    const parts = grant.value.split(".");
    parts[2] = "10";
    expect(verifyStoryPlaybackGrant(parts.join("."), 51, secret, now)).toBeNull();
    expect(verifyStoryPlaybackGrant(grant.value, 52, secret, now)).toBeNull();

    const cookie = `${STORY_PLAYBACK_COOKIE_NAME}=${grant.value}`;
    expect(readStoryPlaybackCookie(cookie)).toBe(grant.value);
    expect(readStoryPlaybackCookie(`${cookie}; ${cookie}`)).toBeNull();
    expect(readStoryPlaybackCookie(`${STORY_PLAYBACK_COOKIE_NAME}=\"${grant.value}\"`)).toBeNull();
  });

  it("builds host-only, path-scoped HttpOnly cookies with Secure only on HTTPS", () => {
    const grant = issueStoryPlaybackGrant({ mediaId: 51, userId: 9, tokenVersion: 4 }, secret, now);
    const secureCookie = buildStoryPlaybackSetCookie(grant.value, 51, true);
    expect(secureCookie).toContain("Path=/api/community/stories/media/51");
    expect(secureCookie).toContain("HttpOnly");
    expect(secureCookie).toContain("SameSite=Strict");
    expect(secureCookie).toContain("Max-Age=120");
    expect(secureCookie).toContain("; Secure");
    expect(secureCookie).not.toMatch(/;\s*Domain=/i);
    expect(buildStoryPlaybackSetCookie(grant.value, 51, false)).not.toContain("; Secure");
  });

  it("retains linked Story community, listing-state, seller, and bilateral-block policy", () => {
    const policy = {
      viewerUserId: 9,
      viewerCommunityId: 3,
      authorUserId: 7,
      authorCommunityId: 3,
      listingSellerId: 7,
      listingStatus: "active",
      listingModerationStatus: "approved",
      sellerApprovalStatus: "approved",
      sellerIsSuspended: false,
      audience: "community",
      blocks: [] as Array<{ blocker_id: number; blocked_id: number }>,
    };
    expect(canReadExchangeLinkedStory(policy)).toBe(true);
    expect(canReadExchangeLinkedStory({ ...policy, viewerCommunityId: 4 })).toBe(false);
    expect(canReadExchangeLinkedStory({ ...policy, listingStatus: "withdrawn" })).toBe(false);
    expect(canReadExchangeLinkedStory({
      ...policy,
      blocks: [{ blocker_id: 7, blocked_id: 9 }],
    })).toBe(false);
  });
});