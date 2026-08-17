import { test } from "node:test";
import assert from "node:assert/strict";
import { directionFromVector, clipIdFor } from "../animation/direction.js";

test("cardinal directions map exactly", () => {
  assert.equal(directionFromVector(1, 0), "right");
  assert.equal(directionFromVector(-1, 0), "left");
  assert.equal(directionFromVector(0, 1), "down");
  assert.equal(directionFromVector(0, -1), "up");
});

test("drawn diagonals (up-left, up-right) map exactly", () => {
  assert.equal(directionFromVector(1, -1), "up_right");
  assert.equal(directionFromVector(-1, -1), "up_left");
});

test("undrawn diagonals (down-left, down-right) fall back to the nearest available direction", () => {
  assert.equal(directionFromVector(1, 1), "right");
  assert.equal(directionFromVector(-1, 1), "left");
});

test("zero vector defaults to down", () => {
  assert.equal(directionFromVector(0, 0), "down");
});

test("clipIdFor folds hurt/talk's missing up-diagonal art onto up", () => {
  assert.equal(clipIdFor("hurt", "up_left"), "kwame_hurt_up");
  assert.equal(clipIdFor("hurt", "up_right"), "kwame_hurt_up");
  assert.equal(clipIdFor("hurt", "left"), "kwame_hurt_left");
  assert.equal(clipIdFor("walk", "up_left"), "kwame_walk_up_left");
});
