/**
 * request_helpers — Help Chain membership.
 *
 * One row per (request, co-helper) pair. The primary helper on the request
 * (help_requests.helper_id) is NOT duplicated here — this table tracks
 * additional helpers who join to coordinate, not the official claimant.
 *
 * Uniqueness: a helper can only be in a chain once at a time. Leaving and
 * re-joining creates a new row (the old one is deleted on leave).
 */
export declare const requestHelpersTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "request_helpers";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "request_helpers";
            dataType: "number";
            columnType: "PgSerial";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        request_id: import("drizzle-orm/pg-core").PgColumn<{
            name: "request_id";
            tableName: "request_helpers";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        helper_id: import("drizzle-orm/pg-core").PgColumn<{
            name: "helper_id";
            tableName: "request_helpers";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        joined_at: import("drizzle-orm/pg-core").PgColumn<{
            name: "joined_at";
            tableName: "request_helpers";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
export type RequestHelper = typeof requestHelpersTable.$inferSelect;
export type InsertRequestHelper = typeof requestHelpersTable.$inferInsert;
//# sourceMappingURL=request-helpers.d.ts.map