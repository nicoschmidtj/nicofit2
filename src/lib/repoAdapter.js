import repo from '../data/exercisesRepo.json' with { type: 'json' };
import { loadRepo, getExercise, listRoutine, primaryGroup, findAlternatives } from '../lib/repo.js';
export { primaryGroup, loadRepo, findAlternatives };

export function getRoutineBaseDefaults(routineKey, exId) {
  // In exercisesRepo.json there are no routineDefaults; use per-exercise base
  const w = repo?.byId?.[exId]?.initialRecord?.weightKg;
  return Number.isFinite(w) ? w : undefined;
}

export function getExerciseDefaults(exId) {
  const e = repo?.byId?.[exId] || {};
  const w = e?.initialRecord?.weightKg;
  return { initialWeightKg: Number.isFinite(w) ? w : undefined };
}

export function getRepo() { return repo; }

export function listMuscleGroups() {
  const set = new Set();
  for (const k in (repo?.byId || {})) {
    const m = repo.byId[k]?.muscles;
    if (Array.isArray(m) && m[0]) set.add(String(m[0]));
  }
  return Array.from(set);
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
