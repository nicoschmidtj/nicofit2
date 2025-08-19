import { getExerciseById } from './repoAdapter.js';

export function resolveExercise(id, customExercisesById) {
  const raw = customExercisesById?.[id] || getExerciseById(id);
  if (!raw) return null;
  const { fixed = {}, setup = {}, ...rest } = raw;
  return {
    ...rest,
    targetSets: fixed.targetSets,
    targetRepsRange: fixed.targetRepsRange,
    targetTimeSec: fixed.targetTimeSec,
    restSec: fixed.restSec,
    pulleyHeightMark: setup.pulleyHeightMark,
    benchAngleDeg: setup.benchAngleDeg,
    seatHeightMark: setup.seatHeightMark,
  };
}
