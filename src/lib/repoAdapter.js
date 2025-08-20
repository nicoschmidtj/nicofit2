import repo from '../data/exercisesRepo.json';
import { loadRepo, getExercise, listRoutine, primaryGroup, findAlternatives } from '../lib/repo.js';
export { primaryGroup, loadRepo, findAlternatives };

export function getRoutineBaseDefaults(routineKey, exId) {
  const cands = [
    repo?.routineDefaults?.[routineKey]?.[exId]?.initialWeightKg,
    repo?.routinesDetail?.[routineKey]?.[exId]?.initialWeightKg,
    repo?.routinesDetail?.[routineKey]?.[exId]?.weightKg,
    repo?.routinesDetail?.[routineKey]?.[exId]?.pesoKg,
    repo?.byId?.[exId]?.defaults?.initialWeightKg,
    repo?.byId?.[exId]?.fixed?.suggestedWeightKg,
    repo?.byId?.[exId]?.suggestedWeightKg,
  ];
  for (const v of cands) if (Number.isFinite(v)) return v;
  return undefined;
}

export function getExerciseDefaults(exId) {
  const e = repo?.byId?.[exId] || {};
  const a = e?.defaults?.initialWeightKg;
  const b = e?.fixed?.minimumWeightKg;
  return {
    initialWeightKg: Number.isFinite(a) ? a : undefined,
    minimumWeightKg: Number.isFinite(b) ? b : undefined,
  };
}

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
