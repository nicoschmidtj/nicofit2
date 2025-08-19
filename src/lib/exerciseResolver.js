import { getExerciseById } from './repoAdapter.js';

export function resolveExercise(id, customExercisesById) {
  return customExercisesById?.[id] || getExerciseById(id) || null;
}
