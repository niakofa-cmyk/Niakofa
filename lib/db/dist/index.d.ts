import * as schema from "./schema";
export declare const pool: import("pg").Pool;
export declare const db: import("drizzle-orm/node-postgres").NodePgDatabase<typeof schema> & {
    $client: import("pg").Pool;
};
export * from "./schema";
export { communityStoriesTable, communityStoryMediaTable, communityStoryElementsTable, communityStoryViewsTable, communityStoryReactionsTable, communityStorySharesTable, } from "./schema/community-stories";
export { mediaAssetsTable, mediaProcessingJobsTable, } from "./schema/media-assets";
export { requestMessageAttachmentsTable } from "./schema/request-message-attachments";
export { exchangeListingsTable, exchangePickupRequestsTable } from "./schema/exchange";
//# sourceMappingURL=index.d.ts.map