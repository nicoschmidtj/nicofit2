import repo from '../data/exercisesRepo.json' with { type: 'json' };

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

export function getOnboardingTemplateCatalog() {
  return repo?.onboardingTemplates || {};
}

export function buildOnboardingSeed(answers = {}) {
  const templates = getOnboardingTemplateCatalog();
  const goals = templates?.goalMap || {};
  const exp = templates?.experienceMap || {};
  const days = templates?.daysPerWeekMap || {};
  const equip = templates?.equipmentMap || {};
  const limits = templates?.limitationsMap || {};

  const goalPick = goals[answers.goal] || goals.fitness_general || {};
  const expPick = exp[answers.experience] || exp.beginner || {};
  const daysPick = days[String(answers.daysPerWeek)] || days['3'] || {};
  const equipPick = equip[answers.equipment] || equip.full_gym || {};
  const limitPick = limits[answers.limitations] || limits.none || {};

  const routineIds = [
    ...(goalPick.routineIds || []),
    ...(expPick.routineIds || []),
    ...(daysPick.routineIds || []),
    ...(equipPick.routineIds || []),
    ...(limitPick.routineIds || []),
  ].filter((id, idx, arr) => id && arr.indexOf(id) === idx);

  const selectedRoutineIds = routineIds.length > 0 ? routineIds : ['rutina_express_1'];

  const userRoutinesIndex = {};
  const customRoutineNames = {};
  selectedRoutineIds.forEach((id) => {
    userRoutinesIndex[id] = [...(repo?.routinesIndex?.[id] || [])];
    customRoutineNames[id] = templates?.routineNameMap?.[id] || id;
  });

  const profileBase = {
    goal: answers.goal,
    experience: answers.experience,
    daysPerWeek: Number(answers.daysPerWeek || 3),
    equipment: answers.equipment,
    limitations: answers.limitations,
    createdAt: new Date().toISOString(),
  };

  const firstWeekChecklist = templates?.firstWeekChecklist || [];

  return { userRoutinesIndex, customRoutineNames, profileBase, firstWeekChecklist };
}
