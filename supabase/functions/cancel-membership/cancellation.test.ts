import { test } from "node:test";
import assert from "node:assert/strict";
import { cancellationPlan } from "./cancellation";

test("29 October payment retains membership until 5 November at the same Brisbane time", () => {
  const paid = Date.parse("2026-10-29T17:49:30+10:00") / 1000;
  const now = Date.parse("2026-11-03T10:59:00+10:00") / 1000;
  assert.deepEqual(cancellationPlan(paid, now, false), {
    endsAt: Date.parse("2026-11-05T17:49:30+10:00") / 1000,
    scheduled: true,
  });
});
test("a missed payment does not gain another paid week or restore membership", () => {
  assert.equal(cancellationPlan(1793260170, 1793260171, true).scheduled, false);
});
test("at the seven-day mark there is no remaining membership time", () => {
  assert.equal(cancellationPlan(1793260170, 1793864970, false).scheduled, false);
});