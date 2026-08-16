/**
 * Tests for NiakofaCharacterAssetLibrary — multi-representation character pipeline.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  enforceCharacterArtTier,
  getCharacterAssets,
  getDialogueBustSrc,
  getDialogueFaceSrc,
  getCharacterVariation,
  auditCharacterAssets,
  CHARACTER_ASSET_REGISTRY,
  type ArtTier,
  type CharacterRole,
} from "../niakofa-character-asset-library.js";

// ── enforceCharacterArtTier ───────────────────────────────────────────────────

describe("enforceCharacterArtTier", () => {
  it("does not throw for protagonist with handDrawn tier", () => {
    assert.doesNotThrow(() =>
      enforceCharacterArtTier("kwame-mensah", "protagonist", "handDrawn")
    );
  });

  it("throws for protagonist with prototypePixel tier", () => {
    assert.throws(
      () => enforceCharacterArtTier("kwame-mensah", "protagonist", "prototypePixel"),
      /Art tier violation/
    );
  });

  it("throws for protagonist with placeholder tier", () => {
    assert.throws(
      () => enforceCharacterArtTier("kwame-mensah", "protagonist", "placeholder"),
      /Art tier violation/
    );
  });

  it("throws for antagonist with prototypePixel tier", () => {
    assert.throws(
      () => enforceCharacterArtTier("villain-id", "antagonist", "prototypePixel"),
      /Art tier violation/
    );
  });

  it("does not throw for supporting with prototypePixel", () => {
    assert.doesNotThrow(() =>
      enforceCharacterArtTier("npc-1", "supporting", "prototypePixel")
    );
  });

  it("does not throw for background with placeholder", () => {
    assert.doesNotThrow(() =>
      enforceCharacterArtTier("bg-npc", "background", "placeholder")
    );
  });

  const roles: CharacterRole[] = ["protagonist", "antagonist"];
  const tiers: ArtTier[] = ["prototypePixel", "placeholder"];
  for (const role of roles) {
    for (const tier of tiers) {
      it(`throws for ${role} × ${tier}`, () => {
        assert.throws(
          () => enforceCharacterArtTier("test", role, tier),
          /Art tier violation/
        );
      });
    }
  }
});

// ── CHARACTER_ASSET_REGISTRY ──────────────────────────────────────────────────

describe("CHARACTER_ASSET_REGISTRY", () => {
  it("contains kwame-mensah", () => {
    assert.ok("kwame-mensah" in CHARACTER_ASSET_REGISTRY);
  });

  it("kwame-mensah has handDrawn production tier", () => {
    assert.equal(CHARACTER_ASSET_REGISTRY["kwame-mensah"].productionTier, "handDrawn");
  });

  it("kwame-mensah has protagonist role", () => {
    assert.equal(CHARACTER_ASSET_REGISTRY["kwame-mensah"].role, "protagonist");
  });

  it("kwame-mensah explorationWalk has frames", () => {
    const walk = CHARACTER_ASSET_REGISTRY["kwame-mensah"].explorationWalk;
    assert.ok(walk, "explorationWalk should exist");
    assert.ok(walk!.frames.length > 0, "should have at least one frame");
  });

  it("kwame-mensah explorationWalk fps is 12", () => {
    assert.equal(CHARACTER_ASSET_REGISTRY["kwame-mensah"].explorationWalk?.fps, 12);
  });
});

// ── getCharacterAssets ────────────────────────────────────────────────────────

describe("getCharacterAssets", () => {
  it("returns record for known id", () => {
    const record = getCharacterAssets("kwame-mensah");
    assert.ok(record);
    assert.equal(record!.id, "kwame-mensah");
  });

  it("returns undefined for unknown id", () => {
    assert.equal(getCharacterAssets("no-such-character"), undefined);
  });
});

// ── getDialogueBustSrc ────────────────────────────────────────────────────────

describe("getDialogueBustSrc", () => {
  it("returns placeholder path for kwame-mensah (bust not yet commissioned)", () => {
    const src = getDialogueBustSrc("kwame-mensah");
    assert.ok(src.includes("placeholder"), "should fall back to placeholder");
  });

  it("returns placeholder for unknown character", () => {
    const src = getDialogueBustSrc("no-one");
    assert.ok(src.includes("placeholder"));
  });
});

// ── getDialogueFaceSrc ────────────────────────────────────────────────────────

describe("getDialogueFaceSrc", () => {
  it("returns placeholder path for kwame-mensah (face not yet commissioned)", () => {
    const src = getDialogueFaceSrc("kwame-mensah");
    assert.ok(src.includes("placeholder"));
  });
});

// ── getCharacterVariation ─────────────────────────────────────────────────────

describe("getCharacterVariation", () => {
  it("returns base record when variation id is unknown", () => {
    const base = getCharacterAssets("kwame-mensah")!;
    const varied = getCharacterVariation("kwame-mensah", "nonexistent");
    assert.equal(varied?.id, base.id);
    assert.equal(varied?.displayName, base.displayName);
  });

  it("returns undefined for unknown character id", () => {
    const result = getCharacterVariation("ghost", "v1");
    assert.equal(result, undefined);
  });
});

// ── auditCharacterAssets ──────────────────────────────────────────────────────

describe("auditCharacterAssets", () => {
  it("returns one entry per registered character", () => {
    const count = Object.keys(CHARACTER_ASSET_REGISTRY).length;
    const audit = auditCharacterAssets();
    assert.equal(audit.length, count);
  });

  it("kwame-mensah has missing portrait and dialogueBust (pending commission)", () => {
    const audit = auditCharacterAssets();
    const kwame = audit.find(a => a.characterId === "kwame-mensah");
    assert.ok(kwame, "kwame should be in audit");
    assert.ok(kwame!.missingAssets.includes("portrait"), "portrait should be missing");
    assert.ok(kwame!.missingAssets.includes("dialogueBust"), "bust should be missing");
  });

  it("kwame-mensah explorationWalk is not missing", () => {
    const audit = auditCharacterAssets();
    const kwame = audit.find(a => a.characterId === "kwame-mensah")!;
    assert.ok(!kwame.missingAssets.includes("explorationWalk"));
    assert.ok(kwame.readyAssets.includes("explorationWalk"));
  });

  it("kwame-mensah is NOT overall ready (pending art)", () => {
    const audit = auditCharacterAssets();
    const kwame = audit.find(a => a.characterId === "kwame-mensah")!;
    assert.equal(kwame.overallReady, false);
  });
});
