import { getRoutineBaseDefaults, getExerciseDefaults } from './repoAdapter.js';

export const roundToNearest = (val, step = 1) => Math.round(val / step) * step;

export function getLastUsedSetForExercise(exId, sessions = []) {
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    if (s?.type !== 'strength') continue;
    const sets = Array.isArray(s.sets) ? [...s.sets].reverse() : [];
    for (const st of sets) {
      if (st.exerciseId === exId && st.mode !== 'time' && Number.isFinite(st.weightKg) && st.weightKg > 0) {
        return st;
      }
    }
  }
  return null;
}

export function round025(x) {
  return Math.round(x / 0.25) * 0.25;
}

export function getInitialWeightForExercise(exId, routineKey, data) {
  const prof = data?.profileByExerciseId?.[exId];
  if (Number.isFinite(prof?.next?.weightKg)) return round025(prof.next.weightKg);

  const routineDefault = getRoutineBaseDefaults(routineKey, exId);
  if (Number.isFinite(routineDefault)) return round025(routineDefault);

  if (Number.isFinite(prof?.last?.weightKg)) return round025(prof.last.weightKg);

  const lastSet = getLastUsedSetForExercise(exId, data?.sessions || []);
  if (Number.isFinite(lastSet?.weightKg)) return round025(lastSet.weightKg);

  const exDef = getExerciseDefaults(exId);
  if (Number.isFinite(exDef.initialWeightKg)) return round025(exDef.initialWeightKg);
  if (Number.isFinite(exDef.minimumWeightKg)) return round025(exDef.minimumWeightKg);

  return 0;
}
