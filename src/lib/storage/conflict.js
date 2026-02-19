const ENTITY_KEYS = ["sessions", "profileByExerciseId", "userRoutinesIndex"];

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

const uniqueSorted = (arr = []) => [...new Set(arr)].sort((a, b) => String(a).localeCompare(String(b)));

function mergeEntityValue(key, localValue, remoteValue) {
  if (key === "sessions") {
    const byId = new Map();
    [...(localValue || []), ...(remoteValue || [])].forEach((session) => {
      if (!session?.id) return;
      const prev = byId.get(session.id);
      if (!prev) {
        byId.set(session.id, session);
        return;
      }
      const prevAt = new Date(prev.dateISO || 0).getTime();
      const nextAt = new Date(session.dateISO || 0).getTime();
      byId.set(session.id, nextAt >= prevAt ? session : prev);
    });
    return [...byId.values()].sort((a, b) => new Date(b.dateISO || 0).getTime() - new Date(a.dateISO || 0).getTime());
  }

  if (key === "profileByExerciseId") {
    return {
      ...(remoteValue || {}),
      ...(localValue || {}),
    };
  }

  if (key === "userRoutinesIndex") {
    const allRoutineIds = uniqueSorted([...(Object.keys(localValue || {})), ...(Object.keys(remoteValue || {}))]);
    return allRoutineIds.reduce((acc, routineId) => {
      acc[routineId] = uniqueSorted([...(localValue?.[routineId] || []), ...(remoteValue?.[routineId] || [])]);
      return acc;
    }, {});
  }

  return clone(localValue ?? remoteValue);
}

export function mergeWithConflictStrategy(localState, remoteState, updatedAt) {
  const merged = { ...(remoteState || {}), ...(localState || {}) };

  ENTITY_KEYS.forEach((key) => {
    const localAt = updatedAt?.local?.[key] || 0;
    const remoteAt = updatedAt?.remote?.[key] || 0;

    if (key === "userRoutinesIndex") {
      merged[key] = mergeEntityValue(key, localState?.[key], remoteState?.[key]);
      return;
    }

    if (localAt > remoteAt) {
      merged[key] = clone(localState?.[key]);
      return;
    }
    if (remoteAt > localAt) {
      merged[key] = clone(remoteState?.[key]);
      return;
    }
    merged[key] = mergeEntityValue(key, localState?.[key], remoteState?.[key]);
  });

  return merged;
}

export function nextUpdatedAt(prev = {}, nextState = {}, previousState = {}) {
  const now = Date.now();
  const draft = { ...prev };
  ENTITY_KEYS.forEach((key) => {
    const hasChanged = JSON.stringify(nextState?.[key] ?? null) !== JSON.stringify(previousState?.[key] ?? null);
    draft[key] = hasChanged ? now : (draft[key] || now);
  });
  return draft;
}

export const CONFLICT_ENTITY_KEYS = ENTITY_KEYS;
