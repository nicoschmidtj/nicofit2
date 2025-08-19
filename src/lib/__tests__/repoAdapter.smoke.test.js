import { getTemplateRoutineKeys, getTemplateExercises } from '../repoAdapter.js';
import { migrateToTemplates } from '../migrations.js';

const keys = getTemplateRoutineKeys();
console.assert(Array.isArray(keys) && keys.length > 0, 'getTemplateRoutineKeys should return >0 keys');

const exs = getTemplateExercises(keys[0]);
console.assert(exs.every(e => e && e.fixed), 'getTemplateExercises should return exercises with fixed');

const prev = {
  routines: [
    { name: 'Test', exercises: [
      { name: 'Belt squat cuádriceps', mode: 'reps', targetSets: 1, targetReps: 8 },
      { name: 'Movimiento misterioso', mode: 'reps', targetSets: 1, targetReps: 10 }
    ] }
  ],
  sessions: [],
  profileByExerciseId: {}
};
const migrated = migrateToTemplates(prev);
const firstKey = Object.keys(migrated.userRoutinesIndex)[0];
const ids = migrated.userRoutinesIndex[firstKey];
console.assert(ids.length === 2, 'migration should map two exercises');
console.assert(ids.some(id => id.startsWith('custom/')), 'migration should create a custom exercise');
console.assert(Object.keys(migrated.customExercisesById).length === 1, 'customExercisesById should contain one entry');

console.log('repoAdapter smoke tests passed');
