export interface StructuredMemory {
    recurring_needs: string[];
    accessibility_notes: string[];
    people_mentioned: {
        name: string;
        relation: string;
    }[];
    corrections: string[];
    preferred_language?: string;
    emotional_arc?: "improving" | "stable" | "declining" | "unknown";
    resources_that_worked?: string[];
}
export declare const niaMemoriesTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "nia_memories";
    schema: undefined;
    columns: {
        user_id: import("drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "nia_memories";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        memory: import("drizzle-orm/pg-core").PgColumn<{
            name: "memory";
            tableName: "nia_memories";
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
        structured: import("drizzle-orm/pg-core").PgColumn<{
            name: "structured";
            tableName: "nia_memories";
            dataType: "json";
            columnType: "PgJsonb";
            data: StructuredMemory;
            driverParam: unknown;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: StructuredMemory;
        }>;
        created_at: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "nia_memories";
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
        updated_at: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "nia_memories";
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
export type NiaMemory = typeof niaMemoriesTable.$inferSelect;
//# sourceMappingURL=nia-memories.d.ts.map