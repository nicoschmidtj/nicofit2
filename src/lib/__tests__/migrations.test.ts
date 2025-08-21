import { migrate } from '../migrations';

const v4 = {
  version: 4,
  routines: [
    { name: 'Test', exercises: [
      { name: 'Belt squat cuádriceps', mode: 'reps', targetSets: 1, targetReps: 8 },
      { name: 'Movimiento misterioso', mode: 'reps', targetSets: 1, targetReps: 10 },
    ] }
  ],
  sessions: [],
  profileByExerciseId: {},
};

const { state } = migrate(v4);
console.assert(state.version === 5, 'version should be 5 after migration');
const firstKey = Object.keys(state.userRoutinesIndex)[0];
console.assert(Array.isArray(state.userRoutinesIndex[firstKey]), 'userRoutinesIndex should have arrays');

console.log('migrations tests passed');

