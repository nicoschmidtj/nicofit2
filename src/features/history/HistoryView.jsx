import React, { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, CartesianGrid, Legend, LineChart, Line, PieChart, Pie, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Trash2 } from "lucide-react";
import { freqDaysByGroup, heatmapWeekGroup, validSet } from "../../lib/analytics.js";
import { loadRepo } from "../../lib/repoAdapter.js";
import { Card, Button, IconButton } from "../../ui.jsx";
import { e1RM, fmtTime, toDisplayWeight } from "../../lib/metrics.ts";

const repo = loadRepo();

const GROUP_COLORS = { pecho: "#EF4444", espalda: "#3B82F6", pierna: "#10B981", hombro: "#F59E0B", brazo: "#8B5CF6", core: "#06B6D4", otros: "#9CA3AF" };

function HeatmapWeekGroup({ data }) {
  const max = Math.max(...Object.values(data.values).flatMap((row) => Object.values(row)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="p-1 text-left">Semana</th>
            {data.groups.map((g) => (
              <th key={g} className="p-1 text-center whitespace-nowrap">{g}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.weeks.map((w) => (
            <tr key={w}>
              <td className="p-1 whitespace-nowrap">{w}</td>
              {data.groups.map((g) => {
                const v = data.values[w][g] || 0;
                const bg = v ? GROUP_COLORS[g] : "transparent";
                const opacity = max ? v / max : 0;
                return <td key={g} style={{ background: bg, opacity }} className="w-6 h-6" title={`${v}`}></td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function prsRecientes(sessions, routines, days = 30, routineKey = "all") {
  const exName = new Map();
  for (const r of routines) {
    for (const ex of r.exercises) exName.set(ex.id, ex.name);
  }
  const sorted = [...sessions]
    .filter((s) => s.type === "strength" && (routineKey === "all" || s.routineKey === routineKey))
    .sort((a, b) => new Date(a.dateISO) - new Date(b.dateISO));
  const bestE1 = new Map();
  const bestVol = new Map();
  const bestReps = new Map();
  const res = [];
  const since = Date.now() - days * 24 * 3600 * 1000;
  for (const s of sorted) {
    const t = new Date(s.dateISO).getTime();
    for (const st of s.sets || []) {
      if (st.mode === "time") continue;
      const id = st.exerciseId;
      const name = exName.get(id) || "Ejercicio";
      const vol = (st.weightKg || 0) * (st.reps || 0);
      const e1 = e1RM(st.weightKg, st.reps);
      const reps = st.reps || 0;
      if (e1 > (bestE1.get(id) || 0)) {
        if (t >= since) res.push({ id: `${st.id}-e1`, name, metric: "e1RM", dateISO: s.dateISO });
        bestE1.set(id, e1);
      }
      if (vol > (bestVol.get(id) || 0)) {
        if (t >= since) res.push({ id: `${st.id}-vol`, name, metric: "volumen", dateISO: s.dateISO });
        bestVol.set(id, vol);
      }
      if (reps > (bestReps.get(id) || 0)) {
        if (t >= since) res.push({ id: `${st.id}-reps`, name, metric: "+reps", dateISO: s.dateISO });
        bestReps.set(id, reps);
      }
    }
  }
  return res.sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO)).slice(0, 5);
}

export default function HistoryTab({ sessions, routines, perExerciseHistory, weeklyVolume, unit, deleteSession, setTab, exercisesById, goalProgress, adherence, streak, missed }) {
  const [exId, setExId] = useState("");
  const [range, setRange] = useState("30");
  const [routineFilter, setRoutineFilter] = useState("all");
  const allExercises = routines.flatMap((r) => r.exercises);
  useEffect(() => { if (!exId && allExercises[0]) setExId(allExercises[0].id); }, [allExercises, exId]);

  const days = parseInt(range, 10);
  const filteredSessions = useMemo(() => {
    const since = Date.now() - days * 24 * 3600 * 1000;
    return sessions.filter(
      (s) =>
        new Date(s.dateISO).getTime() >= since &&
        s.type === "strength" &&
        (routineFilter === "all" || s.routineKey === routineFilter)
    );
  }, [sessions, days, routineFilter]);

  const totalSesiones = filteredSessions.length;
  const volumen4Semanas = useMemo(() => {
    const since = Date.now() - 28 * 24 * 3600 * 1000;
    return sessions
      .filter(
        (s) =>
          s.type === "strength" &&
          new Date(s.dateISO).getTime() >= since &&
          (routineFilter === "all" || s.routineKey === routineFilter)
      )
      .reduce((a, s) => a + (s.totalVolume || 0), 0);
  }, [sessions, routineFilter]);
  const prsUltimas4 = useMemo(() => {
    const best = new Map();
    let prs = 0;
    const since = Date.now() - 28 * 24 * 3600 * 1000;
    for (const s of sessions.filter((x) => x.type === "strength" && (routineFilter === "all" || x.routineKey === routineFilter))) {
      for (const st of s.sets || []) {
        if (st.mode === "time") continue;
        const e1 = e1RM(st.weightKg, st.reps);
        const b = best.get(st.exerciseId) || 0;
        if (e1 > b && new Date(s.dateISO).getTime() >= since) prs++;
        best.set(st.exerciseId, Math.max(b, e1));
      }
    }
    return prs;
  }, [sessions, routineFilter]);

  const chartData = useMemo(() => {
    const since = Date.now() - days * 24 * 3600 * 1000;
    return (perExerciseHistory.get(exId) || []).filter((d) => {
      const t = new Date(d.date).getTime();
      return t >= since && Number.isFinite(d.oneRM);
    });
  }, [perExerciseHistory, exId, days]);

  const weekly8 = useMemo(() => (weeklyVolume || []).slice(-8).filter((w) => Number.isFinite(w.volume)), [weeklyVolume]);

  const freq = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 3600 * 1000);
    return freqDaysByGroup(filteredSessions, repo, { from, to, routineFilter: routineFilter === "all" ? undefined : routineFilter });
  }, [filteredSessions, days, routineFilter]);
  const freqClean = useMemo(() => freq.filter((f) => Number.isFinite(f.days) && f.days > 0), [freq]);
  const hmap = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 3600 * 1000);
    return heatmapWeekGroup(filteredSessions, repo, { from, to, routineFilter: routineFilter === "all" ? undefined : routineFilter });
  }, [filteredSessions, days, routineFilter]);
  const prs = useMemo(() => prsRecientes(filteredSessions, routines, days, routineFilter), [filteredSessions, routines, days, routineFilter]);

  const weeklyMetrics = [
    { key: "streak", label: "Racha", value: `${streak || 0} días`, ok: (streak || 0) >= 2 },
    { key: "adherence", label: "Adherencia", value: `${adherence || 0}%`, ok: (adherence || 0) >= 80 },
    {
      key: "goal",
      label: "Meta semanal",
      value: `${Math.round((goalProgress?.sessions?.progress || 0) * 100)}% sesiones`,
      ok: Boolean(goalProgress?.sessions?.ok),
    },
    { key: "missed", label: "Sesiones pendientes", value: String(missed || 0), ok: (missed || 0) === 0 },
  ];

  const topE1RM = useMemo(() => {
    const best = new Map();
    for (const s of filteredSessions) {
      for (const st of s.sets || []) {
        if (!validSet(st)) continue;
        const e1 = Math.round(st.weightKg * (1 + st.reps / 30));
        const prev = best.get(st.exerciseId) || 0;
        if (e1 > prev) best.set(st.exerciseId, e1);
      }
    }
    return [...best.entries()]
      .map(([id, oneRM]) => ({ id, oneRM, name: exercisesById[id]?.name || "Ejercicio" }))
      .filter((r) => Number.isFinite(r.oneRM) && r.oneRM > 0)
      .sort((a, b) => b.oneRM - a.oneRM)
      .slice(0, 5);
  }, [filteredSessions, exercisesById]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Resumen</h2>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <select value={range} onChange={(e) => setRange(e.target.value)} className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <option value="30">30 días</option>
            <option value="90">90 días</option>
            <option value="180">180 días</option>
          </select>
          <select value={routineFilter} onChange={(e) => setRoutineFilter(e.target.value)} className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <option value="all">Todas las rutinas</option>
            {routines.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <Card className="p-3 text-center"><div className="text-xs text-zinc-500">Sesiones ({range}d)</div><div className="text-lg font-semibold">{totalSesiones}</div></Card>
          <Card className="p-3 text-center"><div className="text-xs text-zinc-500">Volumen (4 sem)</div><div className="text-lg font-semibold">{Math.round(volumen4Semanas)} kg·rep</div></Card>
          <Card className="p-3 text-center"><div className="text-xs text-zinc-500">PRs (4 sem)</div><div className="text-lg font-semibold">{prsUltimas4}</div></Card>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {weeklyMetrics.map((metric) => (
            <Card key={metric.key} className={`p-3 border ${metric.ok ? "border-emerald-300" : "border-amber-300"}`}>
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>{metric.label}</span>
                <span className={metric.ok ? "text-emerald-600" : "text-amber-600"}>{metric.ok ? "ok" : "alerta"}</span>
              </div>
              <div className="text-lg font-semibold">{metric.value}</div>
            </Card>
          ))}
        </div>
        {weekly8.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-sm text-zinc-500">Sin datos aún</div>
        ) : (
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekly8}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" hide />
                <Tooltip formatter={(v) => `${Math.round(v)} kg·rep`} labelFormatter={(l) => `Semana ${l}`} />
                <Bar dataKey="volume" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-2">Frecuencia por grupo (días)</h2>
        {freqClean.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-sm text-zinc-500">Sin datos en este rango</div>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={freqClean} dataKey="days" nameKey="group" labelLine={false} label={({ percent }) => `${Math.round(percent * 100)}%`}>
                  {freqClean.map((d) => (
                    <Cell key={d.group} fill={GROUP_COLORS[d.group]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, name, props) => `${props?.payload?.group} — ${v} días`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-2">Volumen semanal por grupo</h2>
        {hmap.weeks.length === 0 || hmap.groups.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-sm text-zinc-500">Sin datos en este rango</div>
        ) : (
          <HeatmapWeekGroup data={hmap} />
        )}
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-2">PRs recientes</h2>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y">
          {prs.map((pr) => (
            <div key={pr.id} className="flex justify-between px-3 py-2 text-sm">
              <span className="truncate">{pr.name}</span>
              <span className="text-xs text-zinc-500">{pr.metric} · {new Date(pr.dateISO).toLocaleDateString()}</span>
            </div>
          ))}
          {prs.length === 0 && <div className="px-3 py-2 text-sm text-zinc-500">Sin PRs.</div>}
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">1RM estimada por ejercicio</h2>
          <select value={exId} onChange={(e) => setExId(e.target.value)} className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            {allExercises.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
        {chartData.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-sm text-zinc-500">Sin datos en este rango</div>
        ) : (
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis allowDecimals={false} />
                <Tooltip formatter={(v) => `${toDisplayWeight(Math.round(v), unit)} ${unit}`} />
                <Line type="monotone" dataKey="oneRM" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="mt-3">
          <h3 className="text-sm font-medium mb-1">Top 5 e1RM ({range}d)</h3>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y">
            {topE1RM.map((row) => (
              <div key={row.id} className="flex justify-between px-3 py-2 text-sm">
                <span className="truncate">{row.name}</span>
                <span className="tabular-nums">{toDisplayWeight(row.oneRM, unit)} {unit}</span>
              </div>
            ))}
            {topE1RM.length === 0 && <div className="px-3 py-2 text-sm text-zinc-500">Sin datos todavía.</div>}
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-2">Sesiones</h2>
        <div className="space-y-2">
          {sessions.filter((s) => s.type === "strength").length === 0 && (
            <Card className="p-3 text-sm text-zinc-500 flex items-center justify-between">
              <span>Aún no tienes sesiones registradas.</span>
              <Button className="text-sm" onClick={() => setTab("today")}>Iniciar sesión</Button>
            </Card>
          )}
          {sessions.filter((s) => s.type === "strength").map((s) => (
            <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
              <div>
                <div className="font-medium">{new Date(s.dateISO).toLocaleDateString()} · Fuerza</div>
                <div className="text-xs text-zinc-500">
                  Volumen: {Math.round(s.totalVolume || 0)} kg·rep · {fmtTime(s.durationSec || 0)}{s.kcal ? ` · ${s.kcal} kcal` : ""}
                </div>
              </div>
              <IconButton onClick={() => deleteSession(s.id)} title="Eliminar sesión"><Trash2 size={16} /></IconButton>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

