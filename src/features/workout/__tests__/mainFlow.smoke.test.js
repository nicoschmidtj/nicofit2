import assert from "node:assert/strict";
import { buildFinishedSession } from "../mainFlow.js";
import { e1RM, fmtTime, fromDisplayToKg, toDisplayWeight } from "../../../lib/metrics.js";

const activeSession = {
  id: "s1",
  type: "strength",
  routineKey: "a",
  sets: [
    { mode: "reps", weightKg: 100, reps: 5 },
    { mode: "time", weightKg: 0, reps: 0 },
    { mode: "reps", weightKg: 60, reps: 10 },
  ],
};

const finished = buildFinishedSession(activeSession, 1800, 400);
assert.equal(finished.totalVolume, 1100);
assert.equal(finished.durationSec, 1800);
assert.equal(e1RM(100, 5), 117);
assert.equal(fmtTime(125), "2:05");
assert.equal(toDisplayWeight(100, "lb"), 220.5);
assert.equal(fromDisplayToKg(220.5, "lb"), 100);

console.log("main flow smoke test passed");
