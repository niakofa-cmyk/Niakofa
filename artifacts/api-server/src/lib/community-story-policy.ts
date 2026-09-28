export type ExchangeStoryVisibilityPolicyInput = {
  viewerUserId: number;
  viewerCommunityId: number | null;
  authorUserId: number;
  authorCommunityId: number | null;
  listingSellerId: number;
  listingStatus: string;
  listingModerationStatus: string;
  sellerApprovalStatus: string | null;
  sellerIsSuspended: boolean;
  audience: string;
  blocks: Array<{ blocker_id: number; blocked_id: number }>;
};

export function canReadCommunityStoryAudience(
  audience: string,
  viewerCommunityId: number | null,
  storyCommunityId: number | null,
): boolean {
  return audience === "community" && viewerCommunityId === storyCommunityId;
}

export type StoryMediaWritePolicyInput = {
  userId: number;
  authorUserId: number;
  expiresAt: Date;
  now: Date;
  storyStatus: string;
  exchangeListingId: number | null;
  listingSellerId: number | null;
  listingStatus: string | null;
  listingModerationStatus: string | null;
  sellerApprovalStatus: string | null;
  sellerIsSuspended: boolean | null;
};

export function canWriteStoryMediaContext(input: StoryMediaWritePolicyInput): boolean {
  if (input.authorUserId !== input.userId || input.expiresAt <= input.now) return false;
  if (input.exchangeListingId === null) return true;
  return input.storyStatus === "draft"
    && input.listingSellerId === input.userId
    && input.listingStatus === "active"
    && input.listingModerationStatus === "approved"
    && input.sellerApprovalStatus === "approved"
    && input.sellerIsSuspended === false;
}

export function isDuplicateExchangeStoryVideoSession(input: {
  contextKind: string;
  mediaType: string;
  exchangeListingId: number | null;
  existingVideoSession: boolean;
}): boolean {
  return input.contextKind === "story"
    && input.mediaType === "video"
    && input.exchangeListingId !== null
    && input.existingVideoSession;
}

/**
 * Exchange-linked Stories are still scoped to their Community audience. The
 * associated listing must also remain publicly visible, and either-direction
 * blocks suppress access. Comparing nullable community ids deliberately means
 * a null-community Spark is visible only to another null-community viewer.
 */
export function canReadExchangeLinkedStory(input: ExchangeStoryVisibilityPolicyInput): boolean {
  if (
    input.listingSellerId !== input.authorUserId
    || input.listingStatus !== "active"
    || input.listingModerationStatus !== "approved"
    || input.sellerApprovalStatus !== "approved"
    || input.sellerIsSuspended
    || input.blocks.some((block) => (
      block.blocker_id === input.viewerUserId && block.blocked_id === input.authorUserId
    ) || (
      block.blocker_id === input.authorUserId && block.blocked_id === input.viewerUserId
    ))
  ) return false;

  if (input.viewerUserId === input.authorUserId) return true;
  return canReadCommunityStoryAudience(input.audience, input.viewerCommunityId, input.authorCommunityId);
}

export function isLinkedStoryVideoAssetReady(input: {
  linked: boolean;
  mediaType: string;
  mediaAssetId: number | null;
  assetStatus: string | null;
  variantKey: string | null;
}): boolean {
  if (!input.linked) return true;
  if (input.mediaType !== "video") return false;
  return input.mediaAssetId === null
    || input.assetStatus === "ready" && Boolean(input.variantKey);
}

export function storyVideoStreamContentType(variantKey: string | null, originalMimeType: string): string {
  return variantKey ? "video/mp4" : originalMimeType;
}