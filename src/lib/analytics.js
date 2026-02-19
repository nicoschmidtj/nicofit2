export function startOfISOWeek(d) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7;
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

const hashParams = (p) => JSON.stringify(p);
const freqCache = new Map();
const heatCache = new Map();
const histCache = new Map();

export function freqDaysByGroup(sessions, repo, { from, to, routineFilter } = {}) {
  const key = hashParams({
    from: from?.toISOString?.() || null,
    to: to?.toISOString?.() || null,
    routineFilter: routineFilter || null,
    lenSessions: sessions.length,
    lastSessionAt: sessions[sessions.length - 1]?.dateISO || sessions[sessions.length - 1]?.at || null,
  });
  if (freqCache.has(key)) return freqCache.get(key);
  const byGroupDay = new Map();
  for (const sess of sessions) {
    if (sess.type !== 'strength') continue;
    const d = new Date(sess.dateISO || sess.at || Date.now());
    if (from && d < from) continue;
    if (to && d > to) continue;
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
  const out = Array.from(byGroupDay.entries()).map(([group, daysSet]) => ({ group, days: daysSet.size })).filter((r) => Number.isFinite(r.days) && r.days > 0);
  out.sort((a, b) => b.days - a.days);
  freqCache.set(key, out);
  return out;
}

export function heatmapWeekGroup(sessions, repo, { from, to, routineFilter } = {}) {
  const key = hashParams({
    from: from?.toISOString?.() || null,
    to: to?.toISOString?.() || null,
    routineFilter: routineFilter || null,
    lenSessions: sessions.length,
    lastSessionAt: sessions[sessions.length - 1]?.dateISO || sessions[sessions.length - 1]?.at || null,
  });
  if (heatCache.has(key)) return heatCache.get(key);
  const matrix = new Map();
  for (const sess of sessions) {
    if (sess.type !== 'strength') continue;
    const d = new Date(sess.dateISO || sess.at || Date.now());
    if (from && d < from) continue;
    if (to && d > to) continue;
    if (routineFilter && sess.routineKey && sess.routineKey !== routineFilter) continue;
    const w = startOfISOWeek(d);
    const dk = dayKey(d);
    const seen = new Set();
    for (const st of sess.sets || []) {
      if (!validSet(st)) continue;
      const g = primaryGroupOf(st.exerciseId, repo, st.exerciseName);
      const key2 = g + '|' + dk;
      if (seen.has(key2)) continue;
      seen.add(key2);
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
    for (const g of groups) {
      const v = matrix.get(w).get(g) || 0;
      values[w][g] = Number.isFinite(v) ? v : 0;
    }
  }
  const result = { weeks, groups, values };
  heatCache.set(key, result);
  return result;
}

export function buildPerExerciseHistory(sessions, exercisesById) {
  const key = hashParams({
    lenSessions: sessions.length,
    lastSessionAt: sessions[sessions.length - 1]?.dateISO || sessions[sessions.length - 1]?.at || null,
  });
  if (histCache.has(key)) return histCache.get(key);
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
    const res = Object.values(byDay)
      .filter((d) => Number.isFinite(d.volume) && Number.isFinite(d.oneRM))
      .sort((a, b) => a.date.localeCompare(b.date));
    map.set(k, res);
  }
  histCache.set(key, map);
  return map;
}

const MS_DAY = 24 * 3600 * 1000;

export function streakDays(sessions, now = new Date()) {
  const today = dayKey(now);
  const trainedDays = new Set(
    (sessions || [])
      .filter((s) => s.type === 'strength')
      .map((s) => dayKey(s.dateISO || s.at || now))
  );
  let cursor = new Date(`${today}T00:00:00.000Z`);
  if (!trainedDays.has(dayKey(cursor))) {
    cursor = new Date(cursor.getTime() - MS_DAY);
  }
  let streak = 0;
  while (trainedDays.has(dayKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - MS_DAY);
  }
  return streak;
}

const isoWeekBounds = (now = new Date()) => {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);
  start.setHours(0, 0, 0, 0);
  return { start, end };
};

const weeklySnapshot = (sessions, now = new Date()) => {
  const { start, end } = isoWeekBounds(now);
  const weekSessions = (sessions || []).filter((s) => {
    const at = new Date(s.dateISO || s.at || now);
    return at >= start && at <= end;
  });
  const strengthSessions = weekSessions.filter((s) => s.type === 'strength').length;
  const volume = weekSessions
    .filter((s) => s.type === 'strength')
    .reduce((acc, s) => acc + Number(s.totalVolume || 0), 0);
  const cardioMinutes = weekSessions
    .filter((s) => s.type === 'cardio')
    .reduce((acc, s) => acc + Number(s.durationSec || 0), 0) / 60;
  return { strengthSessions, volume, cardioMinutes };
};

export function weeklyGoalProgress(sessions, goals = {}, now = new Date()) {
  const snapshot = weeklySnapshot(sessions, now);
  const targetSessions = Math.max(0, Number(goals.sessions || 0));
  const targetVolume = Math.max(0, Number(goals.volume || 0));
  const targetCardio = Math.max(0, Number(goals.cardio || 0));

  const build = (current, target) => {
    if (!target) return { current, target, progress: 1, ok: true };
    const progress = Math.min(1, current / target);
    return { current, target, progress, ok: current >= target };
  };

  return {
    sessions: build(snapshot.strengthSessions, targetSessions),
    volume: build(Math.round(snapshot.volume), targetVolume),
    cardio: build(Math.round(snapshot.cardioMinutes), targetCardio),
  };
}

export function adherenceRate(sessions, goals = {}, now = new Date()) {
  const progress = weeklyGoalProgress(sessions, goals, now);
  const values = [progress.sessions.progress, progress.volume.progress, progress.cardio.progress];
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100);
}

export function missedSessions(sessions, goals = {}, now = new Date()) {
  const progress = weeklyGoalProgress(sessions, goals, now);
  return Math.max(0, progress.sessions.target - progress.sessions.current);
}
