import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createCommunityStoryWatchContribution,
  postCommunityStoryWatchContribution,
} from "../communityStoryWatchClient";

const componentPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../components/community/CommunityMomentsExperience.tsx",
);
const panelPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../components/community/CreatorInsightsPanel.tsx",
);

describe("first-party Story watch contributions", () => {
  it("creates a distinct idempotency key for each bounded incremental contribution", () => {
    const generated: string[] = [];
    const createId = () => {
      const id = `00000000-0000-4000-8000-${String(generated.length + 1).padStart(12, "0")}`;
      generated.push(id);
      return id;
    };
    const pause = createCommunityStoryWatchContribution(42, 1250, false, createId);
    const completion = createCommunityStoryWatchContribution(42, 0, true, createId);
    assert.equal(pause.eventId, "00000000-0000-4000-8000-000000000001");
    assert.equal(completion.eventId, "00000000-0000-4000-8000-000000000002");
    assert.throws(() => createCommunityStoryWatchContribution(42, 300001, false, createId));
    assert.throws(() => createCommunityStoryWatchContribution(42, 0, false, createId));
  });

  it("retries with the same UUID and exact delta without exposing media URLs", async () => {
    const contribution = createCommunityStoryWatchContribution(
      17,
      2400,
      true,
      () => "00000000-0000-4000-8000-000000000017",
    );
    const calls: Array<{ url: string; options?: RequestInit; body: string }> = [];
    const fetcher: typeof fetch = async (input, options) => {
      calls.push({
        url: String(input),
        options,
        body: String(options?.body),
      });
      return new Response(null, { status: calls.length === 1 ? 503 : 201 });
    };
    await postCommunityStoryWatchContribution(contribution, fetcher);
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.url, "/api/community/stories/17/watch");
    assert.equal(calls[1]?.url, calls[0]?.url);
    assert.equal(calls[0]?.body, calls[1]?.body);
    assert.deepEqual(JSON.parse(calls[1]!.body), {
      event_id: contribution.eventId,
      duration_ms: 2400,
      completed: true,
    });
    assert.equal(calls[0]?.options?.credentials, "same-origin");
    assert.equal(calls[0]?.options?.keepalive, true);
  });

  it("accumulates video media-time locally and flushes only at playback boundaries without creator self-views", () => {
    const component = fs.readFileSync(componentPath, "utf8");
    assert.match(component, /onTimeUpdate=\{\(event\) => accumulateWatchTime/);
    assert.match(component, /onPause=\{\(event\) =>/);
    assert.match(component, /onPause=\{\(event\) => \{\s*accumulateWatchTime/);
    assert.match(component, /onEnded=\{\(event\) =>/);
    assert.match(component, /flushCurrentWatchContribution\(\)/);
    assert.match(component, /authorId === viewerId/);
    assert.match(component, /CreatorInsightsPanel/);
    const panel = fs.readFileSync(panelPath, "utf8");
    assert.match(panel, /data\.retention_available && day\.plays >= data\.retention_minimum_plays && day\.retention_rate !== null/);
    assert.match(panel, /total_recorded_plays/);
    assert.match(panel, /day\.plays >= data\.retention_minimum_plays/);
    assert.match(panel, /retention_window_days/);
    assert.match(panel, /plays that day/);
    assert.match(panel, /Retention hidden/);
    const timeUpdate = component.slice(component.indexOf("const accumulateWatchTime"), component.indexOf("useEffect(() =>", component.indexOf("const accumulateWatchTime")));
    assert.doesNotMatch(timeUpdate, /fetch\(|postCommunityStoryWatchContribution/);
  });
});