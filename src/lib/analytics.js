export function startOfISOWeek(d) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // 0=Monday
  date.setDate(date.getDate() - day);
  const weekNumber = (() => {
    const tmp = new Date(date.getTime());
    tmp.setHours(0, 0, 0, 0);
    tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
    const week1 = new Date(tmp.getFullYear(), 0, 4);
    return 1 + Math.round(((tmp - week1) / 86400000 - 3) / 7);
  })();
  return `${date.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

export function dayKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

const MUSCLE_FROM_NAME = (name = '') => {
  const n = String(name).toLowerCase();
  if (/(pecho|press banca|apertura)/.test(n)) return 'pecho';
  if (/(espalda|remo|jalón|pull)/.test(n)) return 'espalda';
  if (/(pierna|squat|peso muerto|zancada|cuádriceps|glúteo)/.test(n)) return 'pierna';
  if (/(hombro|militar|lateral|rear delt|face pull)/.test(n)) return 'hombro';
  if (/(bíceps|curl)/.test(n)) return 'brazo';
  if (/(tríceps|overhead|barra)/.test(n)) return 'brazo';
  if (/(core|abs|plancha|rueda|paloff|woodchopper|elevación piernas)/.test(n)) return 'core';
  return 'otros';
};

export function primaryGroupOf(exId, repo, nameFallback = '') {
  const ex = repo?.byId?.[exId];
  return ex?.muscles?.[0] || MUSCLE_FROM_NAME(nameFallback || ex?.name || '') || 'otros';
}

export function validSet(s) {
  return s && s.mode !== 'time' && Number.isFinite(s.reps) && Number.isFinite(s.weightKg) && s.reps > 0 && s.weightKg >= 0;
}

export function freqDaysByGroup(sessions, repo, { from, to, routineFilter }) {
  const byGroupDay = new Map();
  for (const sess of sessions) {
    if (sess.type !== 'strength') continue;
    const d = new Date(sess.dateISO || sess.at || Date.now());
    if (d < from || d > to) continue;
    if (routineFilter && sess.routineKey && sess.routineKey !== routineFilter) continue;
    const dk = dayKey(d);
    const seen = new Set();
    for (const st of sess.sets || []) {
      if (!validSet(st)) continue;
      const g = primaryGroupOf(st.exerciseId, repo, st.exerciseName);
      if (seen.has(g)) continue;
      seen.add(g);
    }
    for (const g of seen) {
      if (!byGroupDay.has(g)) byGroupDay.set(g, new Set());
      byGroupDay.get(g).add(dk);
    }
  }
  const out = Array.from(byGroupDay.entries()).map(([group, daysSet]) => ({ group, days: daysSet.size }));
  out.sort((a, b) => b.days - a.days);
  return out;
}

export function heatmapWeekGroup(sessions, repo, { from, to, routineFilter }) {
  const matrix = new Map();
  for (const sess of sessions) {
    if (sess.type !== 'strength') continue;
    const d = new Date(sess.dateISO || sess.at || Date.now());
    if (d < from || d > to) continue;
    if (routineFilter && sess.routineKey && sess.routineKey !== routineFilter) continue;
    const w = startOfISOWeek(d);
    const dk = dayKey(d);
    const seen = new Set();
    for (const st of sess.sets || []) {
      if (!validSet(st)) continue;
      const g = primaryGroupOf(st.exerciseId, repo, st.exerciseName);
      const key = g + '|' + dk;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!matrix.has(w)) matrix.set(w, new Map());
      const row = matrix.get(w);
      row.set(g, (row.get(g) || 0) + 1);
    }
  }
  const weeks = Array.from(matrix.keys()).sort();
  const groupsSet = new Set();
  for (const row of matrix.values()) for (const g of row.keys()) groupsSet.add(g);
  const groups = Array.from(groupsSet).sort();
  const values = {};
  for (const w of weeks) {
    values[w] = {};
    for (const g of groups) values[w][g] = matrix.get(w).get(g) || 0;
  }
  return { weeks, groups, values };
}

export function buildPerExerciseHistory(sessions, exercisesById) {
  const map = new Map();
  for (const sess of sessions) {
    if (sess.type !== 'strength') continue;
    const date = (sess.dateISO || '').slice(0, 10);
    for (const st of sess.sets || []) {
      const exId = st.exerciseId;
      const ex = exercisesById[exId];
      if (!ex) continue;
      const vol = validSet(st) ? st.reps * st.weightKg : 0;
      const one = validSet(st) ? Math.round(st.weightKg * (1 + st.reps / 30)) : 0;
      if (!map.has(exId)) map.set(exId, []);
      map.get(exId).push({ date, exerciseId: exId, exercise: ex.name || exId, volume: vol, oneRM: one });
    }
  }
  for (const [k, arr] of map.entries()) {
    const byDay = {};
    for (const it of arr) {
      if (!byDay[it.date]) byDay[it.date] = { ...it };
      else {
        byDay[it.date].volume += it.volume;
        byDay[it.date].oneRM = Math.max(byDay[it.date].oneRM, it.oneRM);
      }
    }
    map.set(k, Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)));
  }
  return map;
}

