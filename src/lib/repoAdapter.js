import repo from '../data/exercisesRepo.json';
import { loadRepo, getExercise, listRoutine, primaryGroup, findAlternatives } from '../lib/repo.js';
export { primaryGroup, loadRepo, findAlternatives };

export function getRoutineBaseDefaults(routineKey, exId) {
  const r1 = repo?.routineDefaults?.[routineKey]?.[exId]?.initialWeightKg;
  const r2 = repo?.routinesDetail?.[routineKey]?.[exId]?.initialWeightKg;
  const r3 = repo?.byId?.[exId]?.defaults?.initialWeightKg;
  return (Number.isFinite(r1) ? r1 : Number.isFinite(r2) ? r2 : (Number.isFinite(r3) ? r3 : undefined));
}

export function getExerciseDefaults(exId) {
  const e = repo?.byId?.[exId] || {};
  return {
    initialWeightKg: Number.isFinite(e?.defaults?.initialWeightKg) ? e.defaults.initialWeightKg : undefined,
    minimumWeightKg: Number.isFinite(e?.fixed?.minimumWeightKg) ? e.fixed.minimumWeightKg : undefined,
  };
}

export function getTemplateRoutineKeys() {
  return Object.keys(repo.routinesIndex || {});
}

export function getTemplateRoutineName(key) {
  return repo.meta?.routineNames?.[key] || key;
}

export function getTemplateExercises(key) {
  return listRoutine(repo, repo.routinesIndex, key);
}

export function getExerciseById(id) {
  return getExercise(repo, id);
}

export function suggestAlternativesByExerciseId(id) {
  const ex = getExerciseById(id);
  if (!ex) return [];
  return findAlternatives(repo, { muscles: ex.muscles, implement: ex.implement }).filter(e => e.id !== id);
}

export function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();
}
