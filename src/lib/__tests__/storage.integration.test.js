import { createStorage } from '../storage/index.js';

function createKV(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
    dump: () => Object.fromEntries(store.entries()),
  };
}

(function migrationAndSyncTest() {
  const local = createKV({
    nicofit_auth_user: 'user-1',
    nicofit_data_v5: JSON.stringify({
      state: {
        version: 4,
        settings: { unit: 'kg', defaultRestSec: 90, sound: true, vibration: true, theme: 'system' },
        sessions: [],
        profileByExerciseId: {},
        routines: [{ name: 'A', exercises: [{ name: 'Press banca', mode: 'reps', targetSets: 3, targetReps: 10 }] }],
      },
      metadata: { updatedAt: {} },
    }),
  });
  const remote = createKV();
  const storage = createStorage({ local, remote });

  const loaded = storage.loadState();
  console.assert(loaded.state.version === 5, 'should migrate local state to v5');
  console.assert(loaded.state.userRoutinesIndex, 'migration should generate userRoutinesIndex');
})();

(async function conflictMergeTest() {
  const local = createKV({ nicofit_auth_user: 'user-1' });
  const remote = createKV({
    'nicofit_remote_v1:user-1': JSON.stringify({
      userId: 'user-1',
      state: {
        version: 5,
        settings: { unit: 'kg', defaultRestSec: 90, sound: true, vibration: true, theme: 'system' },
        sessions: [{ id: 's-remote', type: 'strength', dateISO: '2026-01-01' }],
        profileByExerciseId: { ex1: { last: { reps: 8 } } },
        userRoutinesIndex: { a: ['ex1'] },
      },
      metadata: {
        updatedAt: { sessions: 50, profileByExerciseId: 100, userRoutinesIndex: 100 },
      },
    }),
  });

  const storage = createStorage({ local, remote });
  const statuses = [];
  storage.subscribeSyncStatus((s) => statuses.push(s.phase));

  const result = await storage.saveState({
    state: {
      version: 5,
      settings: { unit: 'kg', defaultRestSec: 90, sound: true, vibration: true, theme: 'system' },
      sessions: [{ id: 's-local', type: 'strength', dateISO: '2026-02-01' }],
      profileByExerciseId: { ex2: { last: { reps: 12 } } },
      userRoutinesIndex: { b: ['ex2'] },
    },
    previousState: {
      version: 5,
      settings: { unit: 'kg', defaultRestSec: 90, sound: true, vibration: true, theme: 'system' },
      sessions: [],
      profileByExerciseId: { ex2: { last: { reps: 12 } } },
      userRoutinesIndex: { b: ['ex2'] },
    },
    metadata: { updatedAt: { sessions: 200, profileByExerciseId: 10, userRoutinesIndex: 10 } },
  });

  console.assert(result.state.sessions.some((s) => s.id === 's-local'), 'local newer sessions should win');
  console.assert(result.state.profileByExerciseId.ex1, 'remote newer profile should win');
  console.assert(result.state.userRoutinesIndex.a, 'remote routines should survive deterministic merge');
  console.assert(result.state.userRoutinesIndex.b, 'local routines should survive deterministic merge');
  console.assert(statuses.includes('conflict') || statuses.includes('idle'), 'sync status should be emitted');
})();
