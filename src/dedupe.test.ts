import assert from "node:assert/strict";
import { test } from "node:test";
import { createFirstSeen } from "./dedupe.ts";

test("only the first sighting of a key counts", () => {
  const firstSeen = createFirstSeen();
  assert.equal(firstSeen("a"), true);
  assert.equal(firstSeen("a"), false);
  assert.equal(firstSeen("b"), true);
});

test("keys are forgotten after the window", () => {
  let time = 0;
  const firstSeen = createFirstSeen(100, () => time);
  firstSeen("a");
  time = 99;
  assert.equal(firstSeen("a"), false);
  time = 100;
  assert.equal(firstSeen("a"), true);
});
