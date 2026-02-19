const LOAD_STEP_KG = 2.5;

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const toISODate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();

export const rpeToRir = (rpe) => {
  const x = Math.round(parseFloat(rpe || 0));
  if (x >= 10) return 0;
  if (x >= 9) return 1;
  if (x >= 8) return 2;
  return 3;
};

export const parseRange = (ex) => {
  if (ex.mode === 'time') return [ex.targetTimeSec || 0, ex.targetTimeSec || 0];
  const str = ex.targetRepsRange || `${ex.targetReps || 0}`;
  const nums = String(str).match(/\d+/g)?.map((n) => parseInt(n, 10)) || [];
  if (nums.length === 0) return [ex.targetReps || 0, ex.targetReps || 0];
  if (nums.length === 1) return [nums[0], nums[0]];
  return [nums[0], nums[1]];
};

export const calcNext = ({ last, ex, profile }) => {
  if (!last || ex.mode === 'time') return {};
  const [minReps, maxReps] = parseRange(ex);
  const minW = profile?.minWeightKg || 0;
  let weightKg = last.weightKg;
  let reps = last.reps;
  const rir = last.rir ?? rpeToRir(last.rpe || 8);

  if (rir >= 3) {
    weightKg = Math.max(minW, last.weightKg + LOAD_STEP_KG);
  } else if (rir === 2) {
    if (reps < maxReps) reps += 1;
  } else if (rir <= 0 || reps < minReps) {
    if (last.weightKg - LOAD_STEP_KG >= minW) {
      weightKg = Math.max(minW, last.weightKg - LOAD_STEP_KG);
    } else {
      reps = Math.max(1, reps - 1);
    }
  }

  return { weightKg, reps };
};

export const validateSetRegistration = ({ state, activeSession }) => {
  if (!activeSession) return 'Inicia la sesión primero';
  if (!state) return 'Estado de ejercicio no encontrado';
  if (state.drop && state.sets.some((s) => !s.checked)) {
    return 'Completa todas las series base antes del drop-set';
  }
  return null;
};

export const createStrengthSession = (routineKey) => ({
  id: uid(),
  type: 'strength',
  dateISO: toISODate(),
  routineKey,
  sets: [],
  startedAt: Date.now(),
});

export const appendSetsToSession = (session, sets) => ({
  ...session,
  sets: [...(session?.sets || []), ...sets],
});

export const finalizeStrengthSession = ({ session, durationSec, kcal }) => ({
  ...session,
  durationSec,
  kcal,
  totalVolume: (session.sets || []).reduce((acc, s) => acc + (s.mode === 'time' ? 0 : s.weightKg * s.reps), 0),
});
