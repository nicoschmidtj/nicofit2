export type ProgressionProfile = 'strength' | 'hypertrophy' | 'recomposition';

type ExerciseLike = {
  mode?: string;
  targetReps?: number;
  targetRepsRange?: string;
  fixed?: {
    targetSets?: number;
    targetRepsRange?: string;
  };
};

type LastSet = {
  weightKg: number;
  reps: number;
  rir?: number;
  dateISO?: string;
};

type SessionLike = {
  type?: string;
  dateISO?: string;
  at?: number;
  sets?: Array<{
    exerciseId?: string;
    mode?: string;
    reps?: number;
    weightKg?: number;
    rir?: number;
  }>;
};

type BuildHistoryInput = {
  sessions: SessionLike[];
  exerciseId: string;
  targetSets?: number;
  weeks?: number;
};

export type ProgressionHistoryPoint = {
  date: string;
  avgRir: number;
  setsCompleted: number;
  compliance: number;
  topReps: number;
  topWeightKg: number;
  topE1RM: number;
};

type CalcNextInput = {
  last?: LastSet | null;
  ex: ExerciseLike;
  profile?: {
    minWeightKg?: number;
  };
  profileType?: ProgressionProfile;
  history?: ProgressionHistoryPoint[];
};

export const PROGRESSION_PROFILES: Record<ProgressionProfile, { loadStepKg: number; repStep: number; deloadPct: number; pauseBackoffPct: number }> = {
  strength: { loadStepKg: 2.5, repStep: 1, deloadPct: 0.1, pauseBackoffPct: 0.08 },
  hypertrophy: { loadStepKg: 1.25, repStep: 1, deloadPct: 0.08, pauseBackoffPct: 0.06 },
  recomposition: { loadStepKg: 1.25, repStep: 2, deloadPct: 0.06, pauseBackoffPct: 0.05 },
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const parseRange = (ex: ExerciseLike) => {
  const str = ex.fixed?.targetRepsRange || ex.targetRepsRange || `${ex.targetReps || 0}`;
  const nums = String(str)
    .match(/\d+/g)
    ?.map((n) => parseInt(n, 10)) || [];
  if (nums.length === 0) return [ex.targetReps || 0, ex.targetReps || 0] as const;
  if (nums.length === 1) return [nums[0], nums[0]] as const;
  return [nums[0], nums[1]] as const;
};

const dateDiffInDays = (aISO: string, bISO: string) => {
  const a = new Date(`${aISO}T00:00:00`);
  const b = new Date(`${bISO}T00:00:00`);
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
};

const e1rm = (weightKg: number, reps: number) => (weightKg > 0 && reps > 0 ? weightKg * (1 + reps / 30) : 0);

export function buildPerExerciseHistory({ sessions, exerciseId, targetSets = 3, weeks = 4 }: BuildHistoryInput): ProgressionHistoryPoint[] {
  const safeWeeks = clamp(weeks, 2, 6);
  const cutoff = new Date(Date.now() - safeWeeks * 7 * 86400000);
  const byDate = new Map<string, ProgressionHistoryPoint>();

  for (const session of sessions || []) {
    if (session.type !== 'strength') continue;
    const when = new Date(session.dateISO || session.at || Date.now());
    if (Number.isNaN(when.getTime()) || when < cutoff) continue;
    const date = when.toISOString().slice(0, 10);

    const sets = (session.sets || []).filter((set) => {
      return set.exerciseId === exerciseId && set.mode !== 'time' && Number.isFinite(set.reps) && Number.isFinite(set.weightKg);
    });

    if (sets.length === 0) continue;

    const avgRir = sets.reduce((acc, set) => acc + (set.rir ?? 1), 0) / sets.length;
    const topReps = Math.max(...sets.map((set) => set.reps || 0));
    const topWeightKg = Math.max(...sets.map((set) => set.weightKg || 0));
    const topE1RM = Math.max(...sets.map((set) => e1rm(set.weightKg || 0, set.reps || 0)));
    const setsCompleted = sets.length;
    const compliance = Math.min(1, setsCompleted / Math.max(1, targetSets));

    byDate.set(date, {
      date,
      avgRir: round1(avgRir),
      setsCompleted,
      compliance: round1(compliance),
      topReps,
      topWeightKg: round1(topWeightKg),
      topE1RM: round1(topE1RM),
    });
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function calcNext({ last, ex, profile, profileType = 'hypertrophy', history = [] }: CalcNextInput) {
  if (!last || ex.mode === 'time') return {};

  const conf = PROGRESSION_PROFILES[profileType] || PROGRESSION_PROFILES.hypertrophy;
  const [minReps, maxReps] = parseRange(ex);
  const minWeight = profile?.minWeightKg || 0;

  const recent = history.slice(-2);
  const avgRir2 = recent.length ? recent.reduce((acc, row) => acc + row.avgRir, 0) / recent.length : last.rir ?? 1;
  const avgCompliance2 = recent.length ? recent.reduce((acc, row) => acc + row.compliance, 0) / recent.length : 1;
  const e1rmTrend = history.length >= 3 ? history[history.length - 1].topE1RM - history[history.length - 3].topE1RM : 0;
  const daysSince = last.dateISO ? dateDiffInDays(new Date().toISOString().slice(0, 10), last.dateISO) : 0;

  const next = {
    weightKg: round1(last.weightKg),
    reps: last.reps,
    explanation: 'Mantén carga y reps para consolidar técnica.',
  };

  if (daysSince >= 14) {
    next.weightKg = round1(Math.max(minWeight, last.weightKg * (1 - conf.pauseBackoffPct)));
    next.explanation = `-${Math.round(conf.pauseBackoffPct * 100)}% porque vuelves tras ${daysSince} días sin entrenar este ejercicio.`;
    return next;
  }

  if (avgRir2 < 1 && avgCompliance2 < 0.75) {
    next.weightKg = round1(Math.max(minWeight, last.weightKg * (1 - conf.deloadPct)));
    next.reps = Math.max(minReps, last.reps - 1);
    next.explanation = `Deload (${Math.round(conf.deloadPct * 100)}%) por fatiga alta (RIR medio ${round1(avgRir2)}) y cumplimiento bajo.`;
    return next;
  }

  if (last.reps >= maxReps && avgRir2 >= 2 && avgCompliance2 >= 0.9) {
    next.weightKg = round1(Math.max(minWeight, last.weightKg + conf.loadStepKg));
    next.explanation = `+${conf.loadStepKg} kg porque completaste tope de reps con RIR>=2 en 2 sesiones.`;
    return next;
  }

  if (e1rmTrend <= 0 && avgCompliance2 >= 0.8) {
    next.reps = Math.min(maxReps, last.reps + conf.repStep);
    next.explanation = `+${conf.repStep} rep${conf.repStep > 1 ? 's' : ''} por estancamiento de e1RM sin pérdida de cumplimiento.`;
    return next;
  }

  if (last.reps < maxReps && avgRir2 >= 1.5) {
    next.reps = Math.min(maxReps, last.reps + 1);
    next.explanation = '+1 rep para acercarte al tope del rango manteniendo reserva.';
  }

  return next;
}
