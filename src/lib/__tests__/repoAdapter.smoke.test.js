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

// Regression: empty names should never match the first repo exercise.
const withEmptyName = {
  routines: [
    { name: 'Test', exercises: [
      { name: '', mode: 'reps', targetSets: 1, targetReps: 8 },
    ] }
  ],
  sessions: [],
  profileByExerciseId: {}
};
const migratedEmpty = migrateToTemplates(withEmptyName);
const emptyKey = Object.keys(migratedEmpty.userRoutinesIndex)[0];
const [emptyId] = migratedEmpty.userRoutinesIndex[emptyKey];
console.assert(emptyId?.startsWith('custom/'), 'empty-name exercise must be migrated as custom');
console.assert(migratedEmpty.customExercisesById[emptyId]?.name === '', 'custom exercise should preserve empty name');

console.log('repoAdapter smoke tests passed');
