import * as schema from "./schema";
export declare const pool: import("pg").Pool;
export declare const db: import("drizzle-orm/node-postgres").NodePgDatabase<typeof schema> & {
    $client: import("pg").Pool;
};
export * from "./schema";
export { communityStoriesTable, communityStoryMediaTable, communityStoryMomentCompositionsTable, communityStoryElementsTable, communityStoryViewsTable, communityStoryReactionsTable, communityStorySharesTable, communityStoryCommentsTable, } from "./schema/community-stories";
export { mediaAssetsTable, mediaProcessingJobsTable, mediaUploadSessionsTable, mediaUploadChunksTable, } from "./schema/media-assets";
export { requestMessageAttachmentsTable } from "./schema/request-message-attachments";
export { exchangeListingsTable, exchangePickupRequestsTable, exchangeDigestDeliveriesTable, } from "./schema/exchange";
export { exchangeSparksTable } from "./schema/exchange-sparks";
//# sourceMappingURL=index.d.ts.map