import { describe, expect, it } from "@jest/globals";
import {
  canReadCommunityStoryAudience,
  canReadExchangeLinkedStory,
  canWriteStoryMediaContext,
  filterStoryMentionRecipientsByVisibility,
  isDuplicateExchangeStoryVideoSession,
  type ExchangeStoryVisibilityPolicyInput,
} from "../lib/community-story-policy";

const visibleStory: ExchangeStoryVisibilityPolicyInput = {
  viewerUserId: 22,
  viewerCommunityId: 7,
  authorUserId: 11,
  authorCommunityId: 7,
  listingSellerId: 11,
  listingStatus: "active",
  listingModerationStatus: "approved",
  sellerApprovalStatus: "approved",
  sellerIsSuspended: false,
  audience: "community",
  blocks: [],
};

describe("exchange-linked community story visibility", () => {
  it("allows an approved listing and seller in the same community", () => {
    expect(canReadExchangeLinkedStory(visibleStory)).toBe(true);
  });

  it.each([
    ["withdrawn listing", { listingStatus: "withdrawn" }],
    ["non-approved listing", { listingModerationStatus: "pending" }],
    ["different seller", { listingSellerId: 99 }],
    ["unapproved seller", { sellerApprovalStatus: "pending" }],
    ["suspended seller", { sellerIsSuspended: true }],
    ["different community", { viewerCommunityId: 8 }],
    ["hub-only audience", { audience: "hub" }],
    ["viewer blocks author", { blocks: [{ blocker_id: 22, blocked_id: 11 }] }],
    ["author blocks viewer", { blocks: [{ blocker_id: 11, blocked_id: 22 }] }],
  ] as const)("denies access when %s", (_reason, override) => {
    expect(canReadExchangeLinkedStory({ ...visibleStory, ...override })).toBe(false);
  });

  it("does not let the author bypass listing withdrawal and suppresses blocked viewers", () => {
    const author = { ...visibleStory, viewerUserId: 11, viewerCommunityId: 7 };
    expect(canReadExchangeLinkedStory({ ...author, listingStatus: "withdrawn" })).toBe(false);
    expect(canReadExchangeLinkedStory({
      ...visibleStory,
      blocks: [{ blocker_id: 22, blocked_id: 11 }],
    })).toBe(false);
  });

  it("compares nullable communities consistently for linked stories", () => {
    expect(canReadExchangeLinkedStory({
      ...visibleStory,
      viewerCommunityId: null,
      authorCommunityId: null,
    })).toBe(true);
    expect(canReadExchangeLinkedStory({
      ...visibleStory,
      viewerCommunityId: null,
      authorCommunityId: 7,
    })).toBe(false);
  });
});

describe("community story audience matching", () => {
  it("requires exact nullable community equality", () => {
    expect(canReadCommunityStoryAudience("community", 7, 7)).toBe(true);
    expect(canReadCommunityStoryAudience("community", null, null)).toBe(true);
    expect(canReadCommunityStoryAudience("community", null, 7)).toBe(false);
    expect(canReadCommunityStoryAudience("community", 7, null)).toBe(false);
    expect(canReadCommunityStoryAudience("hub", null, null)).toBe(false);
  });
});

describe("Story mention notification visibility", () => {
  it("excludes the author and recipients who cannot read the Story", async () => {
    const candidates = [{ id: 11 }, { id: 22 }, { id: 33 }];
    const checked: number[] = [];
    const recipients = await filterStoryMentionRecipientsByVisibility(
      candidates,
      11,
      async (viewerUserId) => {
        checked.push(viewerUserId);
        return viewerUserId === 22;
      },
    );

    expect([...checked].sort()).toEqual([22, 33]);
    expect(recipients).toEqual([{ id: 22 }]);
  });

  it("fails closed for a recipient whose Story visibility check errors", async () => {
    const recipients = await filterStoryMentionRecipientsByVisibility(
      [{ id: 22 }, { id: 33 }],
      11,
      async (viewerUserId) => {
        if (viewerUserId === 22) throw new Error("visibility unavailable");
        return true;
      },
    );

    expect(recipients).toEqual([{ id: 33 }]);
  });
});

describe("story media upload eligibility", () => {
  const validInput = {
    userId: 11,
    authorUserId: 11,
    expiresAt: new Date("2027-01-02T00:00:00.000Z"),
    now: new Date("2027-01-01T00:00:00.000Z"),
    storyStatus: "draft",
    exchangeListingId: 91,
    listingSellerId: 11,
    listingStatus: "active",
    listingModerationStatus: "approved",
    sellerApprovalStatus: "approved",
    sellerIsSuspended: false,
  };

  it("allows an owned draft while its Exchange listing remains eligible", () => {
    expect(canWriteStoryMediaContext(validInput)).toBe(true);
  });

  it.each([
    ["not the author", { authorUserId: 22 }],
    ["expired", { expiresAt: new Date("2026-12-31T23:59:59.000Z") }],
    ["not a draft", { storyStatus: "published" }],
    ["listing belongs to another seller", { listingSellerId: 22 }],
    ["listing is inactive", { listingStatus: "withdrawn" }],
    ["listing is unapproved", { listingModerationStatus: "pending" }],
    ["seller is unapproved", { sellerApprovalStatus: "pending" }],
    ["seller is suspended", { sellerIsSuspended: true }],
  ] as const)("rejects a linked Story when it is %s", (_reason, override) => {
    expect(canWriteStoryMediaContext({ ...validInput, ...override })).toBe(false);
  });

  it("keeps ordinary unexpired Story author uploads independent of Exchange state", () => {
    expect(canWriteStoryMediaContext({
      ...validInput,
      exchangeListingId: null,
      storyStatus: "published",
      listingSellerId: null,
      listingStatus: null,
      listingModerationStatus: null,
      sellerApprovalStatus: null,
      sellerIsSuspended: null,
    })).toBe(true);
  });

  it("rejects a second video session only for an Exchange-linked Story", () => {
    expect(isDuplicateExchangeStoryVideoSession({
      contextKind: "story",
      mediaType: "video",
      exchangeListingId: 91,
      existingVideoSession: true,
    })).toBe(true);
    expect(isDuplicateExchangeStoryVideoSession({
      contextKind: "story",
      mediaType: "video",
      exchangeListingId: 91,
      existingVideoSession: false,
    })).toBe(false);
    expect(isDuplicateExchangeStoryVideoSession({
      contextKind: "story",
      mediaType: "photo",
      exchangeListingId: 91,
      existingVideoSession: true,
    })).toBe(false);
    expect(isDuplicateExchangeStoryVideoSession({
      contextKind: "direct",
      mediaType: "video",
      exchangeListingId: null,
      existingVideoSession: true,
    })).toBe(false);
  });
});