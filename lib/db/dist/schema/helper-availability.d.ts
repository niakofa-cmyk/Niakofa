/**
 * helper_availability — weekly recurring time windows per helper.
 *
 * day_of_week: 0 (Sun) – 6 (Sat), matching JS Date.getDay().
 * start_min / end_min: minutes from midnight (0–1440).
 *   e.g. 9:00 AM = 540, 5:30 PM = 1050, midnight end = 1440.
 *
 * Stored as integers so the matching engine can do a trivial
 *   currentDayOfWeek === day_of_week && currentMinute >= start_min && currentMinute < end_min
 * check without any date-parsing overhead.
 *
 * Replacing a helper's schedule is a DELETE WHERE user_id + bulk INSERT —
 * no partial-update complexity.
 */
export declare const helperAvailabilityTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "helper_availability";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "helper_availability";
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
        user_id: import("drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "helper_availability";
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
        day_of_week: import("drizzle-orm/pg-core").PgColumn<{
            name: "day_of_week";
            tableName: "helper_availability";
            dataType: "number";
            columnType: "PgSmallInt";
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
        start_min: import("drizzle-orm/pg-core").PgColumn<{
            name: "start_min";
            tableName: "helper_availability";
            dataType: "number";
            columnType: "PgSmallInt";
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
        end_min: import("drizzle-orm/pg-core").PgColumn<{
            name: "end_min";
            tableName: "helper_availability";
            dataType: "number";
            columnType: "PgSmallInt";
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
    };
    dialect: "pg";
}>;
export type HelperAvailability = typeof helperAvailabilityTable.$inferSelect;
export type InsertHelperAvailability = typeof helperAvailabilityTable.$inferInsert;
//# sourceMappingURL=helper-availability.d.ts.map