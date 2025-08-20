export const roundToNearest = (val, step = 1) => Math.round(val / step) * step;

export function getLastUsedSetForExercise(exId, sessions = []) {
  const sorted = [...(sessions || [])]
    .filter((s) => s.type === 'strength')
    .sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));
  for (const sess of sorted) {
    const sets = (sess.sets || []).filter(
      (st) => st.exerciseId === exId && st.mode === 'reps' && st.weightKg > 0
    );
    if (sets.length) {
      const last = sets[sets.length - 1];
      return { weightKg: last.weightKg, reps: last.reps, rir: last.rir, dateISO: sess.dateISO };
    }
  }
  return null;
}

export function getInitialWeightForExercise(exId, data, repo) {
  const prof = data?.profileByExerciseId?.[exId];
  let weight = prof?.next?.weightKg;
  if (weight == null) weight = prof?.last?.weightKg;
  if (weight == null) {
    const last = getLastUsedSetForExercise(exId, data?.sessions);
    weight = last?.weightKg;
  }
  if (weight == null) {
    const ex = repo?.byId?.[exId];
    weight = ex?.defaults?.initialWeightKg ?? ex?.fixed?.minimumWeightKg;
  }
  weight = weight ?? 0;
  return roundToNearest(weight, 0.25);
}
