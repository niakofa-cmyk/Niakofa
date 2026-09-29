import assert from "node:assert/strict";
import test from "node:test";
import { familyAssetPath } from "../family-asset-client";

test("Family Vault asset paths preserve only server-owned family segments", () => {
  assert.equal(
    familyAssetPath("families/12/memories/34/1690000000_grandma_photo.jpg"),
    "/api/family/assets/families/12/memories/34/1690000000_grandma_photo.jpg",
  );
  assert.equal(
    familyAssetPath("families/12/memories/34/old family photo.png"),
    "/api/family/assets/families/12/memories/34/old%20family%20photo.png",
  );
});

test("Family Vault asset paths reject traversal and unrelated storage keys", () => {
  for (const key of [
    "../private.txt",
    "users/12/avatar.png",
    "families/12/memories/34/../private.txt",
    "families/x/memories/34/file.jpg",
    "families/12/memories/34",
  ]) {
    assert.throws(() => familyAssetPath(key), /invalid media reference/i);
  }
});