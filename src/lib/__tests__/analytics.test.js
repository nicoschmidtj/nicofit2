import { adherenceRate, missedSessions, streakDays, weeklyGoalProgress } from '../analytics.js';

const goals = { sessions: 4, volume: 6000, cardio: 90 };
const sessions = [
  { id: 's1', type: 'strength', dateISO: '2026-01-05T09:00:00.000Z', totalVolume: 2200 },
  { id: 's2', type: 'strength', dateISO: '2026-01-06T09:00:00.000Z', totalVolume: 2000 },
  { id: 's3', type: 'strength', dateISO: '2026-01-07T09:00:00.000Z', totalVolume: 2000 },
  { id: 'c1', type: 'cardio', dateISO: '2026-01-08T09:00:00.000Z', durationSec: 1800 },
];

const now = new Date('2026-01-08T12:00:00.000Z');
const progress = weeklyGoalProgress(sessions, goals, now);
console.assert(progress.sessions.current === 3, 'sesiones semanales debe contar strength');
console.assert(progress.volume.current === 6200, 'volumen semanal debe sumar volumen');
console.assert(progress.cardio.current === 30, 'cardio semanal debe convertir segundos a minutos');
console.assert(progress.sessions.ok === false, 'meta sesiones debe estar pendiente');
console.assert(progress.volume.ok === true, 'meta volumen debe estar cumplida');
console.assert(progress.cardio.ok === false, 'meta cardio debe estar pendiente');

const adherence = adherenceRate(sessions, goals, now);
console.assert(adherence === 69, 'adherencia promedio debe redondear porcentaje');

const missing = missedSessions(sessions, goals, now);
console.assert(missing === 1, 'debe faltar 1 sesión');

const streak = streakDays(sessions, now);
console.assert(streak === 3, 'racha debe contar días consecutivos de fuerza');

console.log('analytics tests passed');
