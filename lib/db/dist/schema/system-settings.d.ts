/**
 * system_settings — key/value store for global app configuration.
 *
 * Currently used by the Nia killswitch: key "nia_enabled" stores "true" or
 * "false" so the toggle survives Railway redeploys (unlike an in-memory var).
 *
 * Both api-server (admin-analytics.ts) and nia-service (lib/db.ts) read this
 * table — they share the same Postgres instance so a write in one is visible
 * to the other within nia-service's 10s cache window.
 */
export declare const systemSettingsTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "system_settings";
    schema: undefined;
    columns: {
        key: import("drizzle-orm/pg-core").PgColumn<{
            name: "key";
            tableName: "system_settings";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        value: import("drizzle-orm/pg-core").PgColumn<{
            name: "value";
            tableName: "system_settings";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        updated_at: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "system_settings";
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
export type SystemSetting = typeof systemSettingsTable.$inferSelect;
//# sourceMappingURL=system-settings.d.ts.map