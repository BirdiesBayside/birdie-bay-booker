/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { extensionOptions, extendedEndTime } from "./session-extension";

test("a 30-minute gap offers only 30 minutes", () => {
  assert.deepEqual(extensionOptions(30), [30]);
  assert.equal(extendedEndTime("12:30:00", 30), "13:00");
});
test("offers 30-minute increments capped at 4 extra hours", () => {
  assert.deepEqual(extensionOptions(600), [30, 60, 90, 120, 150, 180, 210, 240]);
});
test("does not offer extra time without a full 30-minute gap", () => {
  assert.deepEqual(extensionOptions(29), []);
  assert.deepEqual(extensionOptions(0), []);
});