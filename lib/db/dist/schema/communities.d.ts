/**
 * communities — region-scoped community funding pools.
 *
 * Each community (county, city, neighbourhood) has a target_reserve_amount
 * set by an admin — the "healthy" pool balance for that region.
 *
 * The wage multiplier for helpers in this community becomes:
 *   tier_multiplier × clamp(pool_balance / target_reserve_amount, 0.5, 1.0)
 *
 * Clamping to [0.5, 1.0] means:
 *   - A fully-funded pool (balance ≥ target) gives the full tier bonus.
 *   - A depleted pool (balance ≤ 50% of target) still pays 50% of the bonus
 *     so helpers are never penalised to zero, but the pool can't be drained
 *     into insolvency by high multipliers.
 *
 * Seeded with a single "Tarrant County" row on first install so every
 * existing users.community_id can resolve without changes to legacy data.
 *
 * Per-county livable wage: hourly_rate overrides the global
 * pool_minimum_hourly_rate system setting for this community when set.
 * Null = fall through to the global setting ($15/hr default).
 */
export declare const communitiesTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "communities";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "communities";
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
        name: import("drizzle-orm/pg-core").PgColumn<{
            name: "name";
            tableName: "communities";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        target_reserve_amount: import("drizzle-orm/pg-core").PgColumn<{
            name: "target_reserve_amount";
            tableName: "communities";
            dataType: "number";
            columnType: "PgReal";
            data: number;
            driverParam: string | number;
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
        hourly_rate: import("drizzle-orm/pg-core").PgColumn<{
            name: "hourly_rate";
            tableName: "communities";
            dataType: "number";
            columnType: "PgReal";
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
        description: import("drizzle-orm/pg-core").PgColumn<{
            name: "description";
            tableName: "communities";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        sponsor_name: import("drizzle-orm/pg-core").PgColumn<{
            name: "sponsor_name";
            tableName: "communities";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        sponsor_logo_url: import("drizzle-orm/pg-core").PgColumn<{
            name: "sponsor_logo_url";
            tableName: "communities";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        county: import("drizzle-orm/pg-core").PgColumn<{
            name: "county";
            tableName: "communities";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        state: import("drizzle-orm/pg-core").PgColumn<{
            name: "state";
            tableName: "communities";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        created_at: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "communities";
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
export type Community = typeof communitiesTable.$inferSelect;
export type NewCommunity = typeof communitiesTable.$inferInsert;
//# sourceMappingURL=communities.d.ts.map