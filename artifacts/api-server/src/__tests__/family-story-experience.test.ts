import { promises as fs } from "node:fs";
import { describe, expect, it } from "@jest/globals";
import {
  familyStoryCanManage,
  formatFamilyStoryDate,
  UpdateStorySchema,
  validateStoryDateUpdate,
} from "../routes/family";

const routePath = new URL("../routes/family.ts", import.meta.url);
const schemaPath = new URL("../../../../lib/db/src/schema/family-stories.ts", import.meta.url);
const migrationPath = new URL("../../../../lib/db/migrations/0186_family_story_experience.sql", import.meta.url);

describe("Family Story experience contract", () => {
  it("formats only the date precision the author supplied", () => {
    expect(formatFamilyStoryDate({
      date_year: 1960,
      date_month: null,
      date_day: null,
      date_precision: "decade",
    })).toBe("1960s");
    expect(formatFamilyStoryDate({
      date_year: 1960,
      date_month: null,
      date_day: null,
      date_precision: "year",
    })).toBe("1960");
    expect(formatFamilyStoryDate({
      date_year: null,
      date_month: null,
      date_day: null,
      date_precision: null,
    })).toBeNull();
  });

  it("provides bounded server-side pagination, joined authors, and audience/date visibility filtering", async () => {
    const route = await fs.readFile(routePath, "utf8");
    expect(route).toMatch(/FamilyStoryListQuerySchema[\s\S]*?limit: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(100\)/);
    expect(route).toMatch(/leftJoin\(usersTable, eq\(familyStoriesTable\.author_id, usersTable\.id\)\)/);
    expect(route).toMatch(/\.limit\(limit\)[\s\S]*?\.offset\(\(page - 1\) \* limit\)/);
    expect(route).toMatch(/\.\.\.story,\s*author,/);
    expect(route).toContain("date_label: formatFamilyStoryDate(story)");
    expect(route).toContain("viewer_can_manage: familyStoryCanManage(story.author_id, userId, membership.role as string)");
    expect(route).toContain("const privateStoryVisibility = canReadPrivateMemory");
    expect(route).toMatch(/and\(eq\(familyStoriesTable\.audience, "private"\), privateStoryVisibility\)/);
    expect(route).toContain("EXISTS (");
    expect(route).not.toMatch(/for \(const story of allStories\)/);
  });

  it("allows owners and curators, but not ordinary members, to manage null-author legacy stories", async () => {
    expect(familyStoryCanManage(null, 10, "contributor")).toBe(false);
    expect(familyStoryCanManage(null, 10, "viewer")).toBe(false);
    expect(familyStoryCanManage(null, 10, "owner")).toBe(true);
    expect(familyStoryCanManage(null, 10, "curator")).toBe(true);
    expect(familyStoryCanManage(10, 10, "viewer")).toBe(true);
    expect(familyStoryCanManage(11, 10, "owner")).toBe(false);

    const route = await fs.readFile(routePath, "utf8");
    expect(route).toMatch(/router\.patch\("\/family\/:id\/stories\/:storyId"[\s\S]*?getFamilyMembership\(familyId, userId\)[\s\S]*?familyStoryCanManage\(existing\.author_id, userId, membership\.role as string\)/);
    expect(route).toMatch(/router\.delete\("\/family\/:id\/stories\/:storyId"[\s\S]*?getFamilyMembership\(familyId, userId\)[\s\S]*?familyStoryCanManage\(existing\.author_id, userId, membership\.role as string\)/);
    expect(route).toMatch(/existing\.author_id === null\s*\?\s*isNull\(familyStoriesTable\.author_id\)/);
  });

  it("does not broadcast private or family story creation events to global sockets", async () => {
    const route = await fs.readFile(routePath, "utf8");
    const stories = route.slice(route.indexOf("// ─── Stories"));
    expect(stories).not.toMatch(/broadcast\s*\(/);
    expect(stories).not.toContain('type: "family_story_created"');
  });

  it("allows explicit null clears while omitted PATCH fields remain unchanged and merged dates stay consistent", () => {
    const parsed = UpdateStorySchema.safeParse({
      memory_id: null,
      date_year: null,
      date_month: null,
      date_day: null,
      date_precision: null,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toMatchObject({
      memory_id: null,
      date_year: null,
      date_month: null,
      date_day: null,
      date_precision: null,
    });
    expect(Object.hasOwn(parsed.data, "title")).toBe(false);

    const current = { date_year: 1960, date_month: null, date_day: null, date_precision: "year" };
    expect(validateStoryDateUpdate({}, current).success).toBe(true);
    expect(validateStoryDateUpdate({ date_precision: "decade" }, current).success).toBe(true);
    expect(validateStoryDateUpdate({ date_year: null }, current).success).toBe(false);
    expect(validateStoryDateUpdate({
      date_year: null,
      date_month: null,
      date_day: null,
      date_precision: null,
    }, current).success).toBe(true);
    expect(validateStoryDateUpdate({ date_precision: "day" }, current).success).toBe(false);
  });

  it("keeps only the author's caption, with a durable unique key and no media or expiry mutation", async () => {
    const [route, schema, migration] = await Promise.all([
      fs.readFile(routePath, "utf8"),
      fs.readFile(schemaPath, "utf8"),
      fs.readFile(migrationPath, "utf8"),
    ]);
    const keepAction = route.slice(route.indexOf('router.post("/family/:id/stories/keep-moment"'));
    expect(keepAction).toContain("eq(communityStoriesTable.author_user_id, userId)");
    expect(keepAction).toContain("sql`${communityStoriesTable.expires_at} > NOW()`");
    expect(keepAction).toContain("body: caption");
    expect(keepAction).toContain('title: "Saved Moment"');
    expect(keepAction).toContain('audience: "private"');
    expect(keepAction).toContain("familyStoryKeepsTable");
    expect(keepAction).not.toContain("mediaAssetsTable");
    expect(keepAction).not.toContain("update(communityStoriesTable)");
    expect(schema).toContain('uniqueIndex("family_story_keeps_family_moment_uidx")');
    expect(migration).toMatch(/UNIQUE \(family_id, moment_id\)/);
    expect(migration).toMatch(/story_id integer REFERENCES family_stories\(id\) ON DELETE SET NULL/i);
  });
});