import { getRoutineBaseDefaults, getExerciseDefaults } from './repoAdapter.js';

export const roundToNearest = (val, step = 1) => Math.round(val / step) * step;

export function round025(x) { return Math.round(x / 0.25) * 0.25; }

export function getLastUsedSetForExercise(exId, sessions = []) {
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    if (s?.type !== 'strength') continue;
    const arr = Array.isArray(s.sets) ? [...s.sets].reverse() : [];
    for (const st of arr) {
      if (st.exerciseId === exId && st.mode !== 'time' && Number.isFinite(st.weightKg) && st.weightKg > 0) return st;
    }
  }
  return null;
}

/** Prioridad exacta pedida:
 * 1) profile.next.weightKg
 * 2) default de rutina/ejercicio en JSON (initialRecord.weightKg)
 * 3) profile.last.weightKg
 * 4) último set histórico
 * 5) 0
 */
export function getInitialWeightForExercise(exId, routineKey, data) {
  const prof = data?.profileByExerciseId?.[exId];
  if (Number.isFinite(prof?.next?.weightKg)) return round025(prof.next.weightKg);

  const rdef = getRoutineBaseDefaults(routineKey, exId);
  if (Number.isFinite(rdef)) return round025(rdef);

  if (Number.isFinite(prof?.last?.weightKg)) return round025(prof.last.weightKg);

  const last = getLastUsedSetForExercise(exId, data?.sessions || []);
  if (Number.isFinite(last?.weightKg)) return round025(last.weightKg);

  const exDef = getExerciseDefaults(exId);
  if (Number.isFinite(exDef.initialWeightKg)) return round025(exDef.initialWeightKg);

  return 0;
}
