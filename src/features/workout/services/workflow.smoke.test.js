import assert from 'node:assert/strict';
import { createStrengthSession, appendSetsToSession, finalizeStrengthSession } from './workoutService.js';

const session = createStrengthSession('push-day');
const afterSet1 = appendSetsToSession(session, [{ mode: 'reps', reps: 10, weightKg: 40 }]);
const afterSet2 = appendSetsToSession(afterSet1, [{ mode: 'reps', reps: 8, weightKg: 45 }]);
const finished = finalizeStrengthSession({ session: afterSet2, durationSec: 2400, kcal: 350 });

assert.equal(finished.sets.length, 2);
assert.equal(finished.totalVolume, 760);
assert.equal(finished.kcal, 350);

console.log('workflow.smoke.test.js: ok');
