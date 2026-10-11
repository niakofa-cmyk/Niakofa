import assert from "node:assert/strict";
import test from "node:test";
import { resolveMomentVideoUrl } from "../moment-media-resolver";
import {
  PREFETCH_GRANT_TTL_MS, effectiveDurationS, fractionFromPointer, freshGrant, nextPreloadIndex, playbackFraction, shouldWarmVideoBytes, steppedSeek, timeFromFraction,
} from "../moment-player-core";

const origin = "https://app.niakofa.test";
const jsonResponse = (body: unknown, ok = true) => ({ ok, json: async () => body }) as unknown as Response;
const deps = (fetchFn: typeof fetch) => ({ origin, fetchFn, headers: () => ({}) });

test("progress, scrub and keyboard seek stay in range and tolerate unknown duration", () => {
  assert.equal(playbackFraction(5, 20), 0.25);
  assert.equal(playbackFraction(5, Infinity), 0);
  assert.equal(playbackFraction(30, 20), 1);
  assert.equal(timeFromFraction(0.5, 40), 20);
  assert.equal(timeFromFraction(2, 40), 40);
  assert.equal(fractionFromPointer(150, 100, 200), 0.25);
  assert.equal(fractionFromPointer(50, 100, 200), 0);
  assert.equal(fractionFromPointer(500, 100, 200), 1);
  assert.equal(fractionFromPointer(150, 100, 0), 0);
  assert.equal(steppedSeek(10, 60, 5), 15);
  assert.equal(steppedSeek(2, 60, -5), 0);
  assert.ok(steppedSeek(59, 60, 5) < 60, "never seeks onto the last frame (would end playback)");
  assert.equal(steppedSeek(5, NaN, 5), 0);
});

test("prefetch targets the next playable card within the lookahead only", () => {
  const card = (hasVideo: boolean, ready = true) => ({ hasVideo, ready });
  assert.equal(nextPreloadIndex([card(true), card(true)], 0), 1);
  assert.equal(nextPreloadIndex([card(true), card(false), card(true)], 0), 2);
  assert.equal(nextPreloadIndex([card(true), card(false), card(false), card(true)], 0), null);
  assert.equal(nextPreloadIndex([card(true), card(true, false), card(true)], 0), 2);
  assert.equal(nextPreloadIndex([card(true)], 0), null);
});

test("video bytes are warmed only on a good, non-data-saver connection; grants expire before the 120 s server TTL", () => {
  assert.equal(shouldWarmVideoBytes(undefined), true);
  assert.equal(shouldWarmVideoBytes({ saveData: true }), false);
  assert.equal(shouldWarmVideoBytes({ effectiveType: "3g" }), false);
  assert.equal(shouldWarmVideoBytes({ effectiveType: "4g" }), true);
  assert.ok(PREFETCH_GRANT_TTL_MS < 120_000);
  assert.equal(freshGrant({ url: "/u", at: 1000 }, 1000 + PREFETCH_GRANT_TTL_MS - 1), "/u");
  assert.equal(freshGrant({ url: "/u", at: 1000 }, 1000 + PREFETCH_GRANT_TTL_MS), null);
  assert.equal(freshGrant(undefined, 5), null);
});

test("resolver: a clip grant is POSTed to its own media path and the same-origin URL is returned", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchFn = (async (url: string, init?: RequestInit) => { calls.push([url, init]); return jsonResponse({ playback_url: "/api/community/stories/media/7/play" }); }) as unknown as typeof fetch;
  const url = await resolveMomentVideoUrl(3, { id: 7, media_url: "/api/community/stories/media/7" }, deps(fetchFn));
  assert.equal(url, "/api/community/stories/media/7/play");
  assert.equal(calls[0][0], "/api/community/stories/media/7/playback-grant");
  assert.equal(calls[0][1]?.method, "POST");
  assert.equal(calls[0][1]?.credentials, "same-origin");
});

test("resolver: refuses mismatched ids, foreign origins and token-bearing playback URLs without trusting the server", async () => {
  const never = (async () => { throw new Error("must not fetch"); }) as unknown as typeof fetch;
  await assert.rejects(resolveMomentVideoUrl(3, { id: 8, media_url: "/api/community/stories/media/7" }, deps(never)), /valid authenticated media reference/);
  await assert.rejects(resolveMomentVideoUrl(3, { id: 7, media_url: "https://evil.test/api/community/stories/media/7" }, deps(never)), /valid authenticated media reference/);
  await assert.rejects(resolveMomentVideoUrl(3, { id: 7, media_url: "/api/community/stories/media/7?token=x" }, deps(never)), /valid authenticated media reference/);
  for (const bad of ["https://evil.test/p", "/api/community/stories/media/7/play?sig=abc", "https://u:p@app.niakofa.test/p"]) {
    const fetchFn = (async () => jsonResponse({ playback_url: bad })) as unknown as typeof fetch;
    await assert.rejects(resolveMomentVideoUrl(3, { id: 7, media_url: "/api/community/stories/media/7" }, deps(fetchFn)), /Niakofa|URL token/);
  }
  const denied = (async () => jsonResponse({ error: "Nope." }, false)) as unknown as typeof fetch;
  await assert.rejects(resolveMomentVideoUrl(3, { id: 7, media_url: "/api/community/stories/media/7" }, deps(denied)), /Nope\./);
});

test("resolver: camera reels only accept their own story's grant and playback path", async () => {
  const reel = { id: 3, media_url: "/api/community/stories/3/moment-composition/playback-grant", isMomentReel: true };
  const ok = (async () => jsonResponse({ playback_url: "/api/community/stories/3/moment-composition/play" })) as unknown as typeof fetch;
  assert.equal(await resolveMomentVideoUrl(3, reel, deps(ok)), "/api/community/stories/3/moment-composition/play");
  const other = (async () => jsonResponse({ playback_url: "/api/community/stories/4/moment-composition/play" })) as unknown as typeof fetch;
  await assert.rejects(resolveMomentVideoUrl(3, reel, deps(other)), /invalid/);
  await assert.rejects(resolveMomentVideoUrl(9, reel, deps(ok)), /valid camera reel playback grant/);
});

test("scrub duration falls back from Infinity to the seekable range, then to the server's recorded length", () => {
  assert.equal(effectiveDurationS(12, 99, 5000), 12);
  assert.equal(effectiveDurationS(Infinity, 8, 5000), 8);
  assert.equal(effectiveDurationS(Infinity, null, 5000), 5);
  assert.equal(effectiveDurationS(NaN, 0, null), 0);
});
