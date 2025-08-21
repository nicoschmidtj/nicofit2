import repo from '../data/exercisesRepo.json' assert { type: 'json' };

/**
 * Devuelve un objeto { [routineKey]: string[] } clonado desde repo.routinesIndex.
 * Si no hay routinesIndex, retorna {}.
 */
export function buildDefaultUserRoutinesIndex() {
  const idx = repo?.routinesIndex || {};
  const out = {};
  for (const k of Object.keys(idx)) out[k] = [...(idx[k] || [])];
  return out;
}
