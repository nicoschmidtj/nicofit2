import assert from 'node:assert/strict';
import {
  calcNext,
  createStrengthSession,
  appendSetsToSession,
  finalizeStrengthSession,
  validateSetRegistration,
} from './workoutService.js';

const ex = { mode: 'reps', targetRepsRange: '8-12' };
assert.deepEqual(calcNext({ last: { weightKg: 80, reps: 8, rir: 3 }, ex, profile: {} }), { weightKg: 82.5, reps: 8 });
assert.equal(validateSetRegistration({ state: null, activeSession: null }), 'Inicia la sesión primero');

const session = createStrengthSession('upper-a');
const withSet = appendSetsToSession(session, [{ mode: 'reps', reps: 5, weightKg: 100 }]);
const done = finalizeStrengthSession({ session: withSet, durationSec: 1800 });
assert.equal(done.totalVolume, 500);

console.log('workoutService.test.js: ok');
