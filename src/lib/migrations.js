import repo from '../data/exercisesRepo.json' with { type: 'json' };
import { getTemplateRoutineKeys, normalizeName } from './repoAdapter.js';

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return Math.abs(h).toString(36);
}

function inferMuscles(name = '') {
  const n = normalizeName(name);
  if (/(pecho|press banca|apertura)/.test(n)) return ['pecho'];
  if (/(espalda|remo|jalon|pull)/.test(n)) return ['espalda'];
  if (/(pierna|squat|peso muerto|zancada|cuadriceps|gluteo)/.test(n)) return ['pierna'];
  if (/(hombro|militar|lateral|rear delt|face pull)/.test(n)) return ['hombro'];
  if (/(biceps|curl)/.test(n)) return ['brazo'];
  if (/(triceps|overhead|barra)/.test(n)) return ['brazo'];
  if (/(core|abs|plancha|rueda|paloff|woodchopper|elevacion piernas)/.test(n)) return ['core'];
  return [];
}

export function migrateToTemplates(prevData = {}) {
  const data = { ...prevData };
  data.customExercisesById = data.customExercisesById || {};
  data.profileByExerciseId = data.profileByExerciseId || {};

  const allRepoExercises = Object.values(repo.byId || {});
  const findMatchId = (name) => {
    const norm = normalizeName(name);
    for (const ex of allRepoExercises) {
      const n = normalizeName(ex.name);
      if (n === norm || n.includes(norm) || norm.includes(n)) return ex.id;
    }
    return null;
  };

  if (!data.userRoutinesIndex && Array.isArray(data.routines)) {
    const templateKeys = getTemplateRoutineKeys();
    data.userRoutinesIndex = {};
    templateKeys.forEach(k => { data.userRoutinesIndex[k] = []; });

    data.routines.forEach((r, idx) => {
      const key = templateKeys[idx] || `custom_${idx}`;
      data.userRoutinesIndex[key] = data.userRoutinesIndex[key] || [];
      (r.exercises || []).forEach(oldEx => {
        const matchId = findMatchId(oldEx.name);
        if (matchId) {
          data.userRoutinesIndex[key].push(matchId);
        } else {
          const id = `custom/${simpleHash(oldEx.name)}`;
          data.customExercisesById[id] = {
            id,
            name: oldEx.name,
            muscles: inferMuscles(oldEx.name),
            mode: oldEx.mode,
            fixed: {
              targetSets: oldEx.targetSets,
              targetRepsRange: oldEx.targetRepsRange || (oldEx.targetReps ? String(oldEx.targetReps) : undefined),
              targetTimeSec: oldEx.targetTimeSec,
              restSec: oldEx.restSec,
            },
            setup: oldEx.setup,
            notes: oldEx.notes,
          };
          data.userRoutinesIndex[key].push(id);
        }
      });
    });
    data.version = 5;
  }

  if (data.userRoutinesIndex) {
    const validRepoIds = new Set(allRepoExercises.map(ex => ex.id));
    Object.keys(data.userRoutinesIndex).forEach(key => {
      const arr = data.userRoutinesIndex[key] || [];
      data.userRoutinesIndex[key] = arr.filter(id => data.customExercisesById[id] || validRepoIds.has(id));
    });
  }

  return data;
}
