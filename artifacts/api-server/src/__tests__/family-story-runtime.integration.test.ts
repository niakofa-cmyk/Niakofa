import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import express from "express";
import request from "supertest";
import { pool } from "@workspace/db";
import { parseAuth, signTokenById } from "../middlewares/auth";
import familyRouter from "../routes/family";

const integrationEnabled = process.env.FAMILY_STORY_RUNTIME_TEST === "1";
const suite = integrationEnabled ? describe : describe.skip;

suite("Family Stories against migrated PostgreSQL", () => {
  const app = express();
  app.use(express.json());
  app.use(parseAuth);
  app.use(familyRouter);

  let familyId: number;
  let authorId: number;
  let otherMemberId: number;
  let storyId: number;
  let authorToken: string;
  let otherMemberToken: string;

  beforeAll(async () => {
    const { rows: migrationRows } = await pool.query<{ filename: string }>(
      "SELECT filename FROM _migrations_applied WHERE filename = $1",
      ["0186_family_story_experience.sql"],
    );
    expect(migrationRows).toHaveLength(1);

    const { rows: categoryColumn } = await pool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'family_stories'
         AND column_name = 'category'`,
    );
    expect(categoryColumn).toHaveLength(1);

    const { rows: users } = await pool.query<{ id: number }>(
      `INSERT INTO users (name, email, approval_status)
       VALUES ('Family Story Author', 'family-story-author@test.invalid', 'approved'),
              ('Family Story Reader', 'family-story-reader@test.invalid', 'approved')
       RETURNING id`,
    );
    authorId = users[0].id;
    otherMemberId = users[1].id;
    authorToken = signTokenById(authorId, 0);
    otherMemberToken = signTokenById(otherMemberId, 0);

    const { rows: families } = await pool.query<{ id: number }>(
      "INSERT INTO families (name, created_by) VALUES ('Isolated story regression family', $1) RETURNING id",
      [authorId],
    );
    familyId = families[0].id;
    await pool.query(
      `INSERT INTO family_members (family_id, user_id, display_name, role, status, joined_at)
       VALUES ($1, $2, 'Family Story Author', 'contributor', 'active', NOW()),
              ($1, $3, 'Family Story Reader', 'contributor', 'active', NOW())`,
      [familyId, authorId, otherMemberId],
    );
  });

  afterAll(async () => {
    if (familyId) await pool.query("DELETE FROM families WHERE id = $1", [familyId]);
    if (authorId || otherMemberId) {
      await pool.query("DELETE FROM users WHERE id = ANY($1::integer[])", [
        [authorId, otherMemberId].filter(Boolean),
      ]);
    }
    await pool.end();
  });

  it("lists, creates, privately scopes, author-checks, and clears a decade-dated story", async () => {
    const created = await request(app)
      .post(`/family/${familyId}/stories`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({
        title: "A private decade story",
        body: "A runtime regression story authored in isolation.",
        audience: "private",
        category: "oral",
        date_year: 1960,
        date_precision: "decade",
      });

    expect(created.status).toBe(201);
    expect(created.body.story).toMatchObject({
      audience: "private",
      category: "oral",
      author_id: authorId,
      date_year: 1960,
      date_precision: "decade",
      date_label: "1960s",
    });
    storyId = created.body.story.id;

    const authorList = await request(app)
      .get(`/family/${familyId}/stories`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(authorList.status).toBe(200);
    expect(authorList.body).toMatchObject({ total: 1, has_more: false });
    expect(authorList.body.stories[0]).toMatchObject({
      id: storyId,
      category: "oral",
      author: { id: authorId, name: "Family Story Author" },
      viewer_can_manage: true,
      date_label: "1960s",
    });

    const otherMemberList = await request(app)
      .get(`/family/${familyId}/stories`)
      .set("Authorization", `Bearer ${otherMemberToken}`);
    expect(otherMemberList.status).toBe(200);
    expect(otherMemberList.body).toMatchObject({ stories: [], total: 0 });

    const forbiddenPatch = await request(app)
      .patch(`/family/${familyId}/stories/${storyId}`)
      .set("Authorization", `Bearer ${otherMemberToken}`)
      .send({ title: "Unauthorized edit" });
    expect(forbiddenPatch.status).toBe(404);

    const cleared = await request(app)
      .patch(`/family/${familyId}/stories/${storyId}`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({
        date_year: null,
        date_month: null,
        date_day: null,
        date_precision: null,
      });
    expect(cleared.status).toBe(200);
    expect(cleared.body.story).toMatchObject({
      date_year: null,
      date_month: null,
      date_day: null,
      date_precision: null,
    });
    expect(cleared.body.story.date_label).toBeNull();

    const storedStory = await pool.query<{
      category: string;
      audience: string;
      author_id: number;
      date_year: number | null;
      date_month: number | null;
      date_day: number | null;
      date_precision: string | null;
    }>(
      `SELECT category, audience, author_id, date_year, date_month, date_day, date_precision
       FROM family_stories WHERE id = $1`,
      [storyId],
    );
    expect(storedStory.rows[0]).toMatchObject({
      category: "oral",
      audience: "private",
      author_id: authorId,
      date_year: null,
      date_month: null,
      date_day: null,
      date_precision: null,
    });
  });
});