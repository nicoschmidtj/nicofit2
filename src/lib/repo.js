import repoJson from '../data/exercisesRepo.json';

/**
 * Load the exercises repository.
 * @returns {object} Repository data
 */
export function loadRepo() {
  return repoJson;
}

/**
 * Get an exercise by id.
 * @param {object} repo - Repository data
 * @param {string} id - Exercise identifier
 * @returns {object|undefined}
 */
export function getExercise(repo, id) {
  return repo?.byId?.[id];
}

/**
 * List exercises for a routine.
 * @param {object} repo - Repository data
 * @param {object} routinesIndex - Index of routines
 * @param {string} key - Routine key
 * @returns {object[]} Array of exercises
 */
export function listRoutine(repo, routinesIndex, key) {
  const ids = routinesIndex?.[key] || [];
  return ids.map(id => repo.byId[id]).filter(Boolean);
}

/**
 * Primary muscle group of an exercise.
 * @param {object} ex - Exercise data
 * @returns {string|null} Primary group
 */
export function primaryGroup(ex) {
  return ex?.muscles?.[0] ?? null;
}

/**
 * Find exercises matching criteria.
 * @param {object} repo - Repository data
 * @param {object} [criteria]
 * @param {string[]} [criteria.muscles=[]] - Muscle groups to match
 * @param {string|null} [criteria.implement=null] - Required implement
 * @returns {object[]} Matching exercises
 */
export function findAlternatives(repo, { muscles = [], implement = null } = {}) {
  return Object.values(repo.byId).filter(ex => {
    if (muscles.length && !muscles.some(m => ex.muscles?.includes(m))) return false;
    if (implement && ex.implement !== implement) return false;
    return true;
  });
}

