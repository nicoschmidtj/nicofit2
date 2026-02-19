import { buildPerExerciseHistory, calcNext } from '../progression';

const exId = 'ex/squat';
const ex = { mode: 'reps', fixed: { targetSets: 3, targetRepsRange: '6-8' } };

const mkSession = (dateISO: string, sets: Array<{ reps: number; weightKg: number; rir: number }>) => ({
  type: 'strength',
  dateISO,
  sets: sets.map((s) => ({ exerciseId: exId, mode: 'reps', ...s })),
});

// Fatiga alta: deload
const fatigueHistory = buildPerExerciseHistory({
  exerciseId: exId,
  targetSets: 3,
  sessions: [
    mkSession('2026-01-05', [{ reps: 7, weightKg: 100, rir: 1 }]),
    mkSession('2026-01-10', [{ reps: 6, weightKg: 100, rir: 0 }]),
  ],
});
const deload = calcNext({
  last: { weightKg: 100, reps: 6, rir: 0, dateISO: new Date().toISOString().slice(0, 10) },
  ex,
  profileType: 'strength',
  history: fatigueHistory,
});
console.assert((deload.weightKg || 0) < 100, 'fatiga alta debe reducir carga');
console.assert(String(deload.explanation || '').toLowerCase().includes('deload'), 'debe explicar deload');

// Estancamiento: sumar reps
const stallHistory = [
  { date: '2026-01-01', avgRir: 2, setsCompleted: 3, compliance: 1, topReps: 6, topWeightKg: 80, topE1RM: 96 },
  { date: '2026-01-08', avgRir: 2, setsCompleted: 3, compliance: 1, topReps: 6, topWeightKg: 80, topE1RM: 96 },
  { date: '2026-01-15', avgRir: 2, setsCompleted: 3, compliance: 1, topReps: 6, topWeightKg: 80, topE1RM: 95 },
];
const stalled = calcNext({
  last: { weightKg: 80, reps: 6, rir: 2, dateISO: new Date().toISOString().slice(0, 10) },
  ex,
  profileType: 'hypertrophy',
  history: stallHistory,
});
console.assert((stalled.reps || 0) === 7, 'estancamiento debe priorizar reps');

// Regreso tras pausa
const paused = calcNext({
  last: { weightKg: 90, reps: 8, rir: 2, dateISO: '2025-01-01' },
  ex,
  profileType: 'recomposition',
  history: stallHistory,
});
console.assert((paused.weightKg || 0) < 90, 'regreso tras pausa debe bajar carga');
console.assert(String(paused.explanation || '').includes('días sin entrenar'), 'debe explicar pausa');

// Progreso claro: subir carga con explicación
const progressHistory = [
  { date: '2026-01-01', avgRir: 2, setsCompleted: 3, compliance: 1, topReps: 8, topWeightKg: 70, topE1RM: 88 },
  { date: '2026-01-08', avgRir: 2.5, setsCompleted: 3, compliance: 1, topReps: 8, topWeightKg: 70, topE1RM: 88.5 },
];
const progressed = calcNext({
  last: { weightKg: 70, reps: 8, rir: 2, dateISO: new Date().toISOString().slice(0, 10) },
  ex,
  profileType: 'strength',
  history: progressHistory,
});
console.assert(progressed.weightKg === 72.5, 'debe subir 2.5 kg en fuerza');
console.assert(String(progressed.explanation || '').includes('RIR>=2 en 2 sesiones'), 'debe ser explicable para el usuario');

console.log('progression tests passed');
