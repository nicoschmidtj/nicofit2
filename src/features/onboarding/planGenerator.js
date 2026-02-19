import repo from '../../data/exercisesRepo.json' with { type: 'json' };
import { buildDefaultUserRoutinesIndex } from '../../lib/defaultUserRoutines.js';

const PROFILE_BY_GOAL = {
  fuerza: 'strength',
  hipertrofia: 'hypertrophy',
  recomposicion: 'recomposition',
};

const PRIORITY_KEYS = {
  fuerza: ['rutina1', 'rutina2', 'rutina3', 'extra1', 'extra2', 'rutina_express_1'],
  hipertrofia: ['rutina1', 'rutina2', 'rutina3', 'extra1', 'extra2', 'rutina_express_1'],
  recomposicion: ['rutina_express_1', 'rutina1', 'rutina2', 'rutina3', 'extra1', 'extra2'],
};

const normalize = (v = '') => String(v || '').toLowerCase();

function buildBlockedMuscles(limitations = '') {
  const text = normalize(limitations);
  const blocked = new Set();
  if (text.includes('hombro')) blocked.add('hombro');
  if (text.includes('rodilla') || text.includes('pierna')) blocked.add('pierna');
  if (text.includes('espalda') || text.includes('lumbar')) blocked.add('espalda');
  return blocked;
}

function canUseExercise(exercise, equipmentSet, blockedMuscles) {
  if (!exercise) return false;
  const implement = normalize(exercise.implement || 'otros');
  if (!equipmentSet.has('todos') && !equipmentSet.has(implement) && implement !== 'peso_corporal' && implement !== 'otros') {
    return false;
  }
  if (blockedMuscles.size > 0 && (exercise.muscles || []).some((m) => blockedMuscles.has(normalize(m)))) {
    return false;
  }
  return true;
}

export function generateOnboardingPlan(answers) {
  const objective = answers.objective || 'hipertrofia';
  const daysPerWeek = Math.max(2, Math.min(6, Number(answers.daysPerWeek || 3)));
  const progressionProfile = PROFILE_BY_GOAL[objective] || 'hypertrophy';
  const defaults = buildDefaultUserRoutinesIndex();
  const equipmentSet = new Set((answers.equipment || []).length ? answers.equipment : ['todos']);
  const blockedMuscles = buildBlockedMuscles(answers.limitations);

  const allRoutineKeys = Object.keys(defaults);
  const prioritized = PRIORITY_KEYS[objective] || allRoutineKeys;
  const orderedKeys = [...prioritized.filter((k) => allRoutineKeys.includes(k)), ...allRoutineKeys.filter((k) => !prioritized.includes(k))];

  const selectedRoutines = {};
  for (const key of orderedKeys) {
    if (Object.keys(selectedRoutines).length >= daysPerWeek) break;
    const filteredIds = (defaults[key] || []).filter((id) => canUseExercise(repo.byId?.[id], equipmentSet, blockedMuscles));
    if (filteredIds.length >= 3) {
      selectedRoutines[key] = filteredIds;
    }
  }

  if (Object.keys(selectedRoutines).length === 0) {
    Object.assign(selectedRoutines, defaults);
  }

  const profileByExerciseId = {};
  Object.values(selectedRoutines).flat().forEach((exerciseId) => {
    profileByExerciseId[exerciseId] = { progressionProfile };
  });

  const summary = {
    objective,
    experience: answers.experience,
    daysPerWeek,
    totalExercises: Object.values(selectedRoutines).reduce((acc, arr) => acc + arr.length, 0),
  };

  return { userRoutinesIndex: selectedRoutines, profileByExerciseId, summary };
}
