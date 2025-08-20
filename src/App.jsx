import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dumbbell, Timer as TimerIcon, History, Settings as SettingsIcon, Play, Square, Plus, Trash2, Edit3, Download, Upload, ChevronRight, ChevronLeft, BarChart3, Flame, Repeat2, Check, Award, Clock } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, Legend, PieChart, Pie, Cell } from "recharts";
import { migrateToTemplates } from "./lib/migrations.js";
import { getTemplateRoutineName, suggestAlternativesByExerciseId, primaryGroup, loadRepo, findAlternatives } from "./lib/repoAdapter.js";
import { resolveExercise } from "./lib/exerciseResolver.js";
import { buildDefaultUserRoutinesIndex } from "./lib/defaultUserRoutines.js";
import { roundToNearest, getInitialWeightForExercise, getLastUsedSetForExercise } from "./lib/utils.js";

// =====================================
// NicoFit — single-file React app (v1.6)
// - Fix: SyntaxError around previous edits by fully rewriting valid React code
// - Fix: Export fallback if createObjectURL/download is restricted (sandbox-safe)
// - New: Sticky glass header with routine name, global timer (30/60/90/custom) and Start/Finish
// - Keeps: per-set checkboxes, RPE→RIR, drop set, cardio kcal, analytics (weekly volume & e1RM)
// - Dev: self-tests via console.assert
// =====================================

// ---------- Helpers ----------
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
// clamp eliminado si no se usa
const fmtTime = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
};
const toISODate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
const todayISO = () => toISODate().slice(0, 10);
const epley1RM = (w, reps) => (w > 0 && reps > 0 ? Math.round(w * (1 + reps / 30)) : 0);
const kgOrLb = (val, unit) => (unit === "lb" ? Math.round(val * 2.20462 * 10) / 10 : Math.round(val));
const fromDisplayToKg = (val, unit) => (unit === "lb" ? Math.round((val / 2.20462) * 10) / 10 : val);
const rpeToRir = (rpe) => {
  const x = Math.round(parseFloat(rpe || 0));
  if (x >= 10) return 0;
  if (x >= 9) return 1;
  if (x >= 8) return 2;
  return 3;
};
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Auto-progresión helpers
const LOAD_STEP_KG = 2.5;
const parseRange = (ex) => {
  if (ex.mode === 'time') return [ex.targetTimeSec || 0, ex.targetTimeSec || 0];
  const str = ex.targetRepsRange || `${ex.targetReps || 0}`;
  const nums = String(str).match(/\d+/g)?.map(n => parseInt(n,10)) || [];
  if (nums.length === 0) return [ex.targetReps || 0, ex.targetReps || 0];
  if (nums.length === 1) return [nums[0], nums[0]];
  return [nums[0], nums[1]];
};
const calcNext = ({ last, ex, profile }) => {
  if (!last || ex.mode === 'time') return {};
  const [minReps, maxReps] = parseRange(ex);
  const minW = profile?.minWeightKg || 0;
  let weightKg = last.weightKg;
  let reps = last.reps;
  const rir = last.rir ?? rpeToRir(last.rpe || 8);
  if (rir >= 3) {
    weightKg = Math.max(minW, last.weightKg + LOAD_STEP_KG);
  } else if (rir === 2) {
    if (reps < maxReps) reps = reps + 1;
  } else if (rir <= 0 || reps < minReps) {
    if (last.weightKg - LOAD_STEP_KG >= minW) {
      weightKg = Math.max(minW, last.weightKg - LOAD_STEP_KG);
    } else {
      reps = Math.max(1, reps - 1);
    }
  }
  return { weightKg, reps };
};

// Mapeo de grupos musculares desde el nombre del ejercicio
const MUSCLE_FROM_NAME = (name='')=>{
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

// Mapeo simple de implemento desde el nombre
const IMPLEMENT_FROM_NAME = (name='')=>{
  const n = String(name).toLowerCase();
  if (/(mancuerna|dumbbell)/.test(n)) return 'mancuerna';
  if (/(barra|barbell)/.test(n)) return 'barra';
  if (/(polea|cable)/.test(n)) return 'polea';
  if (/(máquina|maquina|machine)/.test(n)) return 'maquina';
  return 'otros';
};

const GROUP_COLORS = { pecho:'#EF4444', espalda:'#3B82F6', pierna:'#10B981', hombro:'#F59E0B', brazo:'#8B5CF6', core:'#06B6D4', otros:'#9CA3AF' };

// ---------- Default dataset ----------
const DEFAULT_DATA = {
  version: 5,
  settings: {
    unit: "kg", // "kg" | "lb"
    defaultRestSec: 90,
    sound: true,
    vibration: true,
    theme: "system", // system | light | dark
  },
  sessions: [], // strength + cardio
  profileByExerciseId: {},
  userRoutinesIndex: {},
  customExercisesById: {},
  customRoutineNames: {},
};

// ---------- Storage ----------
const LS_KEY = "nicofit_data_v5";
const loadFromLS = () => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_DATA;
  } catch (e) {
    console.warn("Load failed, using defaults", e);
    return DEFAULT_DATA;
  }
};
const save = (data) => localStorage.setItem(LS_KEY, JSON.stringify(data));

// ---------- Beep ----------
const useBeep = () => {
  const ctxRef = useRef(null);
  useEffect(() => () => { if (ctxRef.current) ctxRef.current.close?.(); }, []);
  return () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = ctxRef.current || new Ctx();
      ctxRef.current = ctx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.26);
    } catch {
      // noop: beep no soportado
    }
  };
};

// ---------- UI primitives ----------
const Card = ({ className = "", children }) => (
  <div className={`rounded-3xl shadow-lg bg-white/70 dark:bg-zinc-900/60 backdrop-blur border border-zinc-200/60 dark:border-zinc-800 ${className}`}>{children}</div>
);
const Button = ({ className = "", children, onClick, type = "button", disabled }) => (
  <button type={type} disabled={disabled} onClick={onClick} className={`px-4 py-2 rounded-2xl shadow-sm transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 ${className}`}>{children}</button>
);
const IconButton = ({ children, onClick, className = "", title }) => (
  <button aria-label={title} onClick={onClick} title={title} className={`p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition ${className}`}>{children}</button>
);
const Input = (props) => <input {...props} className={`w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:ring-2 ring-zinc-300 dark:ring-zinc-600 ${props.className || ""}`} />;
const Label = ({ children }) => <label className="text-sm text-zinc-600 dark:text-zinc-400">{children}</label>;

// ---------- Tabs ----------
const TABS = [
  { id: "today", label: "Hoy", icon: <Dumbbell size={18} /> },
  { id: "routines", label: "Rutinas", icon: <Repeat2 size={18} /> },
  { id: "history", label: "Historial", icon: <History size={18} /> },
  { id: "settings", label: "Ajustes", icon: <SettingsIcon size={18} /> },
];

// ---------- Main App ----------
export default function App() {
  const [data, setData] = useState(() => {
    const initial = loadFromLS();
    const migrated = migrateToTemplates(initial);
    const merged = { ...DEFAULT_DATA, ...migrated };
    if (merged.userRoutinesIndex?.extra1?.length === 0) {
      delete merged.userRoutinesIndex.extra1;
      if (merged.customRoutineNames) delete merged.customRoutineNames.extra1;
    }
    if (merged.userRoutinesIndex?.extra2?.length === 0) {
      delete merged.userRoutinesIndex.extra2;
      if (merged.customRoutineNames) delete merged.customRoutineNames.extra2;
    }
    if (!merged.userRoutinesIndex || Object.keys(merged.userRoutinesIndex).length === 0) {
      merged.userRoutinesIndex = buildDefaultUserRoutinesIndex();
      merged.customExercisesById = merged.customExercisesById || {};
      merged.version = Math.max(5, merged.version || 5);
    }
    save(merged);
    return merged;
  });
  const [tab, setTab] = useState("today");
  const [activeSession, setActiveSession] = useState(null); // {id,type,dateISO,routineId,sets:[],startedAt,kcal?}
  const [restSec, setRestSec] = useState(0);
  const restDeadlineRef = useRef(null);
  const rafRef = useRef(null);
  const [prFlash, setPrFlash] = useState("");
  const [confirmFlash, setConfirmFlash] = useState(null); // { message, onConfirm }
  const [dateStr] = useState(() => new Date().toLocaleDateString());
  const lastActionRef = useRef({ exId: null, added: 0, prevCompleted: false });
  const restoredRef = useRef(false);
  const beep = useBeep();
  const repo = useMemo(() => loadRepo(), []);

  useEffect(() => save(data), [data]);
  // Autoguardado de sesión activa (restaurar solo una vez al montar)
  useEffect(()=>{
    if (restoredRef.current) return;
    const raw = localStorage.getItem('nicofit_active');
    if (raw) {
  try { setActiveSession(JSON.parse(raw)); } catch { /* noop */ }
    }
    restoredRef.current = true;
  },[]);
  useEffect(()=>{
    if (activeSession) localStorage.setItem('nicofit_active', JSON.stringify(activeSession));
    else localStorage.removeItem('nicofit_active');
  },[activeSession]);
  useEffect(()=>{
    const handler = (e)=>{ if(activeSession && (activeSession.sets||[]).length>0){ e.preventDefault(); e.returnValue=''; } };
    window.addEventListener('beforeunload', handler);
    return ()=> window.removeEventListener('beforeunload', handler);
  },[activeSession]);
  // Eliminado setInterval global y rAF continuo

  useEffect(() => {
    const root = document.documentElement;
    const setDark = (v) => root.classList.toggle("dark", v);
    if (data.settings.theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      setDark(mq.matches);
      const h = (e) => setDark(e.matches);
      mq.addEventListener?.("change", h);
      return () => mq.removeEventListener?.("change", h);
    } else {
      setDark(data.settings.theme === "dark");
    }
  }, [data.settings.theme]);

  useEffect(() => {
    const applyTheme = () => {
      const root = document.documentElement;
      const isDark = data.settings.theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : data.settings.theme === 'dark';
      root.classList.toggle('dark', isDark);
    };
    document.addEventListener('visibilitychange', applyTheme);
    return () => document.removeEventListener('visibilitychange', applyTheme);
  }, [data.settings.theme]);

  const routines = useMemo(() => {
    const idx = data.userRoutinesIndex || {};
    return Object.keys(idx)
      .filter((key) => (idx[key] || []).length > 0)
      .map(key => ({
        id: key,
        name: data.customRoutineNames?.[key] || getTemplateRoutineName(key),
        exercises: (idx[key] || []).map(id => resolveExercise(id, data.customExercisesById)).filter(Boolean),
      }));
  }, [data.userRoutinesIndex, data.customExercisesById, data.customRoutineNames]);
  const sessions = data.sessions;

  const loop = () => {
    if (!restDeadlineRef.current) { rafRef.current = null; return; }
    const msLeft = restDeadlineRef.current - performance.now();
    const secLeft = Math.max(0, Math.ceil(msLeft / 1000));
    setRestSec(secLeft);
    if (secLeft === 0) {
      if (data.settings.sound) beep();
      if (data.settings.vibration && navigator.vibrate) navigator.vibrate(80);
      try {
        if (typeof Notification !== 'undefined' && Notification.permission !== 'denied') {
          const ensure = async () => {
            if (Notification.permission === 'default') await Notification.requestPermission();
            if (Notification.permission === 'granted') {
              navigator.serviceWorker?.ready.then(reg => {
                reg.showNotification('¡A la barra!', {
                  body: 'Descanso terminado',
                  icon: '/pwa-192x192.png',
                  badge: '/pwa-192x192.png',
                  tag: 'rest-timer',
                });
              });
            }
          }; ensure();
        }
      } catch { /* noop */ }
      restDeadlineRef.current = null;
    }
    rafRef.current = requestAnimationFrame(loop);
  };
  const startRest = (seconds) => {
    const s = Math.max(0, Number(seconds || 0));
    if (s <= 0) { restDeadlineRef.current = null; setRestSec(0); cancelAnimationFrame(rafRef.current); rafRef.current = null; return; }
    restDeadlineRef.current = performance.now() + s * 1000;
    if (!rafRef.current) rafRef.current = requestAnimationFrame(loop);
  };
  const stopRest = () => { restDeadlineRef.current = null; setRestSec(0); cancelAnimationFrame(rafRef.current); rafRef.current = null; };

  const startStrength = (routineId) => {
    if (!routineId) return;
    setActiveSession({ id: uid(), type: "strength", dateISO: toISODate(), routineId, sets: [], startedAt: Date.now() });
  };

  const finishStrength = async () => {
    if (!activeSession) return;
    const autoDur = Math.max(1, Math.floor((Date.now() - activeSession.startedAt) / 1000));
    let inputDur = prompt("Tiempo total de la rutina (minutos). Deja vacío para usar automático", String(Math.round(autoDur / 60)));
    let durationSec = autoDur;
    if (inputDur && !Number.isNaN(parseFloat(inputDur))) durationSec = Math.max(60, Math.round(parseFloat(inputDur) * 60));
    let kcalStr = prompt("Kcal quemadas (opcional)", "");
    const kcal = kcalStr && !Number.isNaN(parseFloat(kcalStr)) ? Math.round(parseFloat(kcalStr)) : undefined;
    const totalVol = activeSession.sets.reduce((acc, s) => acc + (s.mode === "time" ? 0 : s.weightKg * s.reps), 0);
    setData((d) => ({ ...d, sessions: [{ ...activeSession, durationSec, totalVolume: totalVol, kcal }, ...d.sessions] }));
    setActiveSession(null);
  };

  const flashPR = (msg) => {
    setPrFlash(msg);
    if (data.settings.sound) beep();
    if (navigator.vibrate) navigator.vibrate(50);
    setTimeout(() => setPrFlash(""), 1000);
  };

  const undoLast = () => {
    setActiveSession(s => s ? ({ ...s, sets: s.sets.slice(0, - (lastActionRef.current?.added || 0)) }) : s);
    lastActionRef.current.undo?.();
    lastActionRef.current = { exId: null, added: 0, prevCompleted: false, undo: null };
    setPrFlash("");
  };

  const deleteSession = (id) => setData((d) => ({ ...d, sessions: d.sessions.filter((s) => s.id !== id) }));

  const addRoutine = () => {
    if (routines.length >= 7) return alert("Límite: 7 rutinas");
    const name = prompt("Nombre de la rutina");
    if (!name) return;
    const key = "custom/" + uid();
    setData(d => ({
      ...d,
      userRoutinesIndex: { ...(d.userRoutinesIndex || {}), [key]: [] },
      customRoutineNames: { ...(d.customRoutineNames || {}), [key]: name }
    }));
  };
  const deleteRoutine = (id) => {
    if (!confirm("¿Eliminar rutina?")) return;
    setData(d => {
      const idx = { ...(d.userRoutinesIndex || {}) };
      delete idx[id];
      const names = { ...(d.customRoutineNames || {}) };
      delete names[id];
      return { ...d, userRoutinesIndex: idx, customRoutineNames: names };
    });
  };
  const renameRoutine = (id) => {
    const name = prompt("Nuevo nombre");
    if (!name) return;
    setData(d => ({
      ...d,
      customRoutineNames: { ...(d.customRoutineNames || {}), [id]: name }
    }));
  };

  const addExercise = (routineId) => {
    const arr = data.userRoutinesIndex?.[routineId] || [];
    if (arr.length >= 12) return alert("Límite: 12 ejercicios por rutina");
    const groups = Array.from(new Set(Object.values(repo.byId || {}).map(e => e.muscles?.[0]).filter(Boolean)));
    const list = groups.map((g, i) => `${i + 1}. ${g}`).join('\n');
    const pickGroup = prompt(`Área muscular:\n${list}\nNúmero? (deja vacío para personalizado)`);
    const group = groups[parseInt(pickGroup || '', 10) - 1];
    if (!group) {
      const name = prompt("Nombre del ejercicio");
      if (!name) return;
      const mode = (prompt("Modo (reps/time)", "reps") || "reps").toLowerCase() === "time" ? "time" : "reps";
      const category = (prompt("Categoría (compuesto/aislado/core)", "compuesto") || "compuesto").toLowerCase();
      const targetSets = parseInt(prompt("Series objetivo") || "3", 10);
      let targetTimeSec = 45;
      let targetRepsRange = "8–12";
      if (mode === "time") {
        targetTimeSec = parseInt(prompt("Segundos por serie") || "45", 10);
        targetRepsRange = prompt("Rango tiempo a mostrar", `${targetTimeSec}s`) || `${targetTimeSec}s`;
      } else {
        targetRepsRange = prompt("Rango reps a mostrar", "8–12") || "8–12";
      }
      const restSec = parseInt(prompt("Descanso por ejercicio (seg, vacío=global)") || "0", 10) || undefined;
      const notes = prompt("Notas (opcional)") || "";
      const id = `custom/${uid()}`;
      const ex = {
        id,
        name,
        mode,
        category,
        muscles: [MUSCLE_FROM_NAME(name)],
        fixed: { targetSets, targetRepsRange, targetTimeSec: mode === 'time' ? targetTimeSec : undefined, restSec },
        notes,
      };
      setData(d => ({
        ...d,
        customExercisesById: { ...(d.customExercisesById || {}), [id]: ex },
        userRoutinesIndex: { ...(d.userRoutinesIndex || {}), [routineId]: [...(d.userRoutinesIndex?.[routineId] || []), id] }
      }));
      return;
    }
    const candidates = findAlternatives(repo, { muscles: [group] });
    const list2 = candidates.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
    const pickEx = prompt(`Ejercicio:\n${list2}\nNúmero?`);
    const chosen = candidates[parseInt(pickEx || '', 10) - 1];
    if (!chosen) return;
    setData(d => ({
      ...d,
      userRoutinesIndex: { ...(d.userRoutinesIndex || {}), [routineId]: [...(d.userRoutinesIndex?.[routineId] || []), chosen.id] }
    }));
  };
  const deleteExercise = (routineId, exId) => {
    if (!confirm("¿Eliminar ejercicio?")) return;
    setData(d => ({
      ...d,
      userRoutinesIndex: { ...(d.userRoutinesIndex || {}), [routineId]: (d.userRoutinesIndex?.[routineId] || []).filter(id => id !== exId) }
    }));
  };

  // ---------- Analytics ----------
  const perExerciseHistory = useMemo(() => {
    const map = new Map();
    for (const s of sessions.filter((x) => x.type === "strength")) {
      for (const set of s.sets) {
        const key = set.exerciseId;
        const ex = routines.flatMap((r) => r.exercises).find((e) => e.id === key);
        const exName = ex ? ex.name : (set.exerciseName || null);
        if (!exName) continue;
        const date = s.dateISO.slice(0, 10);
        const entry = { date, exerciseId: key, exercise: exName, volume: set.mode === "time" ? 0 : set.reps * set.weightKg, oneRM: set.mode === "time" ? 0 : epley1RM(set.weightKg, set.reps) };
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(entry);
      }
    }
    for (const [k, arr] of map.entries()) {
      const byDay = {};
      for (const it of arr) {
        if (!byDay[it.date]) byDay[it.date] = { date: it.date, exerciseId: it.exerciseId, exercise: it.exercise, volume: 0, oneRM: 0 };
        byDay[it.date].volume += it.volume;
        byDay[it.date].oneRM = Math.max(byDay[it.date].oneRM, it.oneRM);
      }
      map.set(k, Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)));
    }
    return map;
  }, [sessions, routines]);

  const weeklyVolume = useMemo(() => computeWeeklyVolume(sessions), [sessions]);

  const unit = data.settings.unit;

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 text-zinc-900 dark:text-zinc-100">
      <div className="max-w-md mx-auto pb-32 px-4 pt-6">
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-2xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 grid place-items-center"><Flame size={18} /></div>
      <div>
              <h1 className="text-xl font-semibold leading-none">NicoFit</h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Entrena. Registra. Progresa.</p>
            </div>
          </div>
          <div className="text-xs text-zinc-500">{dateStr}</div>
        </header>

        {tab === "today" && (
          <TodayTab
            data={data}
            setData={setData}
            routines={routines}
            activeSession={activeSession}
            startStrength={startStrength}
            finishStrength={finishStrength}
            setActiveSession={setActiveSession}
            flashPR={flashPR}
            restSec={restSec}
            startRest={startRest}
            unit={unit}
            setTab={setTab}
            weeklyVolume={weeklyVolume}
            lastActionRef={lastActionRef}
            setPrFlash={setPrFlash}
            repo={repo}
          />
        )}

        {tab === "routines" && (
          <RoutinesTab
            routines={routines}
            addRoutine={addRoutine}
            deleteRoutine={deleteRoutine}
            renameRoutine={renameRoutine}
            addExercise={addExercise}
            deleteExercise={deleteExercise}
            setData={setData}
          />
        )}

        {tab === "history" && (
          <HistoryTab sessions={sessions} routines={routines} perExerciseHistory={perExerciseHistory} weeklyVolume={weeklyVolume} unit={unit} deleteSession={deleteSession} setTab={setTab} />
        )}

        {tab === "settings" && (
          <SettingsTab data={data} setData={setData} />
        )}
      </div>

      <Nav tab={tab} setTab={setTab} />

      {restSec > 0 && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50">
          <Card className="px-4 py-2 flex items-center gap-2">
            <TimerIcon size={16} />
            <span className="tabular-nums font-semibold">{fmtTime(restSec)}</span>
            <IconButton onClick={() => startRest(30)} title="30s"><span className="text-xs font-medium">30s</span></IconButton>
            <IconButton onClick={() => startRest(60)} title="60s"><span className="text-xs font-medium">60s</span></IconButton>
            <IconButton onClick={() => startRest(90)} title="90s"><span className="text-xs font-medium">90s</span></IconButton>
            <IconButton onClick={() => startRest(restSec + 15)} title="+15s"><Plus size={16} /></IconButton>
            <IconButton onClick={stopRest} title="Parar"><Square size={16} /></IconButton>
          </Card>
        </div>
      )}

      {prFlash && (
        <div className="fixed bottom-40 left-1/2 -translate-x-1/2">
          <Card className="px-4 py-2 flex items-center gap-2">
            <Award size={16} />
            <span className="text-sm font-medium">{prFlash} 🎉</span>
            {lastActionRef.current?.added > 0 && (
              <Button className="ml-2 text-xs" onClick={undoLast}>Deshacer</Button>
            )}
          </Card>
        </div>
      )}

      {confirmFlash && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50">
          <Card className="px-4 py-3 flex items-center gap-3">
            <span className="text-sm">{confirmFlash.message}</span>
            <div className="flex gap-2">
              <Button className="text-sm bg-emerald-600" onClick={()=>{ try{confirmFlash.onConfirm?.();}finally{setConfirmFlash(null);} }}>Confirmar</Button>
              <Button className="text-sm" onClick={()=> setConfirmFlash(null)}>Cancelar</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Nav({ tab, setTab }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur">
      <div className="max-w-md mx-auto grid grid-cols-4">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex flex-col items-center gap-1 py-3 ${tab === t.id ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500"}`}>
            {t.icon}
            <span className="text-[11px]">{t.label}</span>
        </button>
        ))}
      </div>
    </nav>
  );
}

function tempoSugerido(category, mode) {
  if (mode === "time") return "isométrico";
  if (category === "compuesto") return "3-1-1";
  if (category === "aislado") return "2-1-2";
  if (category === "core") return "controlado";
  return "controlado";
}

function TodayTab({ data, setData, routines, activeSession, setActiveSession, startStrength, finishStrength, flashPR, restSec, startRest, unit, setTab, weeklyVolume, lastActionRef, setPrFlash, repo }) {
  const [routineId, setRoutineId] = useState(routines[0]?.id || "");
  useEffect(() => { if (!routineId && routines[0]) setRoutineId(routines[0].id); }, [routines, routineId]);
  const routine = routines.find((r) => r.id === (activeSession?.routineId || routineId));

  const [sessionExercises, setSessionExercises] = useState([]);
  const [perExerciseState, setPerExerciseState] = useState({});
  const [sessionOverrides, setSessionOverrides] = useState({});
  const [openTimerMenu, setOpenTimerMenu] = useState(false);
  const [quickAdd, setQuickAdd] = useState({ name: "", sets: "1", reps: "", weight: "" });

  // shape: { [exId]: { sets: [{checked, reps, weight, rpe}], drop?: {reps, weight}, completed: bool } }

  useEffect(() => {
    if (activeSession && routine) {
      setSessionExercises(routine.exercises.map(e => ({ ...e })));
      setPerExerciseState({});
      setSessionOverrides({});
    } else {
      setSessionExercises([]);
      setPerExerciseState({});
      setSessionOverrides({});
    }
  }, [activeSession, routine]);

  useEffect(() => {
    if (sessionExercises.length === 0) return;
    sessionExercises.forEach(ex => {
      const effectiveId = sessionOverrides[ex.id] || ex.id;
      if (!data.profileByExerciseId?.[effectiveId]?.last) {
        const last = getLastUsedSetForExercise(effectiveId, data.sessions);
        if (last) {
          setData(d => ({
            ...d,
            profileByExerciseId: { ...(d.profileByExerciseId || {}), [effectiveId]: { ...(d.profileByExerciseId?.[effectiveId] || {}), last } }
          }));
        }
      }
    });
    setPerExerciseState((prev) => {
      const copy = { ...prev };
      for (const ex of sessionExercises) {
        if (!copy[ex.id]) {
          const effectiveId = sessionOverrides[ex.id] || ex.id;
          const resolved = resolveExercise(effectiveId, data.customExercisesById);
          if (!resolved) continue;
          const prof = data.profileByExerciseId?.[effectiveId];
          const baseWeight = kgOrLb(getInitialWeightForExercise(effectiveId, data, repo), unit);
          const baseReps = resolved.mode === "reps" ? (prof?.next?.reps ?? prof?.last?.reps ?? parseRange(resolved)[0]) : (prof?.next?.reps ?? prof?.last?.reps ?? (resolved.targetTimeSec || 45));
          copy[ex.id] = {
            sets: Array.from({ length: resolved.targetSets || 3 }).map(() => ({ checked: false, reps: baseReps, weight: baseWeight, rpe: 8 })),
            drop: resolved.notes?.toLowerCase().includes("drop") ? { reps: resolved.mode === "reps" ? Math.ceil((resolved.targetReps || 10) * 0.6) : 30, weight: baseWeight ? Math.round(baseWeight * 0.8) : 0 } : null,
            completed: false,
          };
        }
      }
      return copy;
    });
  }, [sessionExercises, unit, data.profileByExerciseId, sessionOverrides, data.sessions, repo, data.customExercisesById, setData]);

  const hasActive = !!activeSession;
  const startSession = () => startStrength(routineId);

  
  const quickRest = (sec) => startRest(sec);
  const customRest = () => {
    const pick = prompt("Segundos de descanso", String(restSec || data.settings.defaultRestSec));
    if (!pick) return;
    const val = parseInt(pick, 10);
    if (!Number.isNaN(val)) startRest(val);
  };

  const viewAlternative = (origEx) => {
    const effectiveId = sessionOverrides[origEx.id] || origEx.id;
    const candidates = suggestAlternativesByExerciseId(effectiveId);
    if (candidates.length === 0) return alert('Sin alternativas disponibles');
    const list = candidates.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
    const pick = prompt(`Alternativas:\n${list}\nNúmero?`);
    const idx = parseInt(pick || '', 10) - 1;
    const alt = candidates[idx];
    if (!alt) return;
    setSessionOverrides(prev => ({ ...prev, [origEx.id]: alt.id }));
    if (!data.profileByExerciseId?.[alt.id]?.last) {
      const last = getLastUsedSetForExercise(alt.id, data.sessions);
      if (last) {
        setData(d => ({
          ...d,
          profileByExerciseId: { ...(d.profileByExerciseId || {}), [alt.id]: { ...(d.profileByExerciseId?.[alt.id] || {}), last } }
        }));
      }
    }
    const resolved = resolveExercise(alt.id, data.customExercisesById);
    if (resolved) {
      const prof = data.profileByExerciseId?.[alt.id];
      const baseWeight = kgOrLb(getInitialWeightForExercise(alt.id, data, repo), unit);
      const baseReps = resolved.mode === 'reps' ? (prof?.next?.reps ?? prof?.last?.reps ?? parseRange(resolved)[0]) : (prof?.next?.reps ?? prof?.last?.reps ?? (resolved.targetTimeSec || 45));
      setPerExerciseState(p => ({
        ...p,
        [origEx.id]: {
          sets: Array.from({ length: resolved.targetSets || 3 }).map(() => ({ checked: false, reps: baseReps, weight: baseWeight, rpe: 8 })),
          drop: resolved.notes?.toLowerCase().includes('drop') ? { reps: resolved.mode === 'reps' ? Math.ceil((resolved.targetReps || 10) * 0.6) : 30, weight: baseWeight ? Math.round(baseWeight * 0.8) : 0 } : null,
          completed: false,
        },
      }));
      setActiveSession(s => s ? ({ ...s, sets: s.sets.filter(set => set.exerciseId !== effectiveId) }) : s);
      lastActionRef.current = { exId: null, added: 0, prevCompleted: false, undo: null };
      setPrFlash('Ejercicio reemplazado');
      setTimeout(() => setPrFlash(''), 1000);
    }
  };

  const registerExercise = (origEx) => {
    if (!activeSession) return alert("Inicia la sesión primero");
    const effectiveId = sessionOverrides[origEx.id] || origEx.id;
    const ex = resolveExercise(effectiveId, data.customExercisesById);
    const st = perExerciseState[origEx.id];
    if (!st) return;
    if (st.completed && !confirm("Ejercicio ya registrado. ¿Registrar nuevamente?")) return;
    if (st.drop && st.sets.some((s) => !s.checked)) return alert("Completa todas las series base antes del drop-set");
    // push sets
    const newSets = [];
    st.sets.forEach((s) => {
      if (s.checked) {
        const repsOrSec = parseInt(s.reps || 0, 10);
        const wDisp = roundToNearest(parseFloat(s.weight || 0), 0.25);
        const wkg = fromDisplayToKg(wDisp, unit);
        const rpe = parseFloat(s.rpe || 8);
        const rir = rpeToRir(rpe);
        newSets.push({ id: uid(), exerciseId: effectiveId, mode: ex.mode, reps: repsOrSec, weightKg: wkg, rpe, rir, tempo: tempoSugerido(ex.category, ex.mode), at: Date.now() });
      }
    });
    if (st.drop && st.sets.filter((x) => x.checked).length === st.sets.length) {
      // only if last series completed
      const repsOrSec = parseInt(st.drop.reps || 0, 10);
      const wDisp = roundToNearest(parseFloat(st.drop.weight || 0), 0.25);
      const wkg = fromDisplayToKg(wDisp, unit);
      newSets.push({ id: uid(), exerciseId: effectiveId, mode: ex.mode, reps: repsOrSec, weightKg: wkg, rpe: 10, rir: 0, tempo: tempoSugerido(ex.category, ex.mode), at: Date.now(), drop: true });
    }
    // Drop avanzado configurable (si no hay drop manual configurado en estado)
    if (!st.drop && ex.dropCfg && st.sets.filter((x)=>x.checked).length === st.sets.length) {
      const lastChecked = [...st.sets].reverse().find(s=>s.checked);
      const lastWDisp = roundToNearest(parseFloat(lastChecked?.weight||0), 0.25);
      const lastW = fromDisplayToKg(lastWDisp, unit);
      const percent = Math.max(1, Math.min(100, ex.dropCfg.percent || 80));
      const repsOffset = Number(ex.dropCfg.repsOffset ?? 0);
      const baseReps = ex.mode==='reps' ? parseInt(lastChecked?.reps || ex.targetReps || 10, 10) : (ex.targetTimeSec||30);
      const reps = Math.max(1, baseReps + (isNaN(repsOffset) ? 0 : repsOffset));
      const wkg = Math.max(0, Math.round((lastW * percent/100) * 10)/10);
      newSets.push({ id: uid(), exerciseId: effectiveId, mode: ex.mode, reps, weightKg: wkg, rpe: 10, rir: 0, tempo: tempoSugerido(ex.category, ex.mode), at: Date.now(), drop: true });
    }
    if (newSets.length === 0) return alert("Marca al menos una serie");

    // PR detection vs previous
    const bestE1 = bestE1RMForExercise(activeSession, data.sessions, effectiveId);
    let raised = false;
    for (const n of newSets) {
      if (n.mode !== "time") {
        const e1 = epley1RM(n.weightKg, n.reps);
        if (e1 > bestE1) { raised = true; break; }
      }
    }

    setActiveSession((s) => ({ ...s, sets: [...s.sets, ...newSets] }));
    const lastValid = [...newSets].reverse().find(s => !s.drop);
    if (lastValid) {
      const prevProf = data.profileByExerciseId?.[effectiveId] || {};
      const last = { weightKg: lastValid.weightKg, reps: lastValid.reps, rir: lastValid.rir, dateISO: todayISO(), setup: prevProf.last?.setup };
      const next = calcNext({ last, ex, profile: prevProf });
      setData(d => ({ ...d, profileByExerciseId: { ...d.profileByExerciseId, [effectiveId]: { ...prevProf, last, next } } }));
    }
    const wasCompleted = st.completed;
    lastActionRef.current = {
      exId: origEx.id,
      added: newSets.length,
      prevCompleted: wasCompleted,
      undo: () => setPerExerciseState(p => ({ ...p, [origEx.id]: { ...p[origEx.id], completed: wasCompleted } }))
    };
    setPerExerciseState((p) => ({ ...p, [origEx.id]: { ...p[origEx.id], completed: true } }));
    setPrFlash('Ejercicio registrado');
    setTimeout(() => { setPrFlash(''); lastActionRef.current = { exId: null, added: 0, prevCompleted: false, undo: null }; }, 1000);

    // no auto-start de descanso aquí

    if (raised) setTimeout(() => flashPR("PR 1RM estimada"), 1000);

    // Superserie/Triserie: aviso y descanso compartido implícito
    if (ex.groupId) {
      const mates = sessionExercises.filter(e=> e.groupId===ex.groupId && e.id!==ex.id);
      setTimeout(() => {
        setPrFlash(`Superserie: ahora ${mates[0]?.name || 'siguiente del grupo'}`);
        setTimeout(() => setPrFlash(''), 1000);
      }, 1000);
    }
  };

  const addAdhocExercise = () => {
    if (!activeSession) return alert("Inicia la sesión primero");
    const name = (quickAdd.name || "").trim();
    if (!name) return alert("Nombre requerido");
    const setsN = Math.max(1, parseInt(quickAdd.sets || "1", 10));
    const repsN = Math.max(1, parseInt(quickAdd.reps || "10", 10));
    const weightDisp = roundToNearest(Math.max(0, parseFloat(quickAdd.weight || "0")), 0.25);
    const wkg = fromDisplayToKg(weightDisp, unit);

    const exId = "adhoc-" + uid();
    const newSets = Array.from({ length: setsN }).map(() => ({
      id: uid(),
      exerciseId: exId,
      exerciseName: name,
      mode: "reps",
      reps: repsN,
      weightKg: wkg,
      rpe: 8,
      rir: rpeToRir(8),
      tempo: "controlado",
      at: Date.now(),
      adhoc: true,
    }));

    setActiveSession((s) => ({ ...s, sets: [...s.sets, ...newSets] }));
    lastActionRef.current = { exId, added: newSets.length, prevCompleted: false, undo: null };
    setQuickAdd({ name: "", sets: "1", reps: "", weight: "" });
    flashPR("Ejercicio extra agregado");
  };

  return (
    <div className="space-y-4">
      {/* Sticky glass header with global timer + start/finish */}
      <div className="sticky top-0 z-30 -mx-4 px-4 pt-2 pb-2 bg-white/70 dark:bg-zinc-950/50 backdrop-blur border-b border-zinc-200/60 dark:border-zinc-800 overflow-visible">
        <div className="max-w-md mx-auto flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] text-zinc-500">Rutina</div>
            <div className="truncate font-medium">{routine ? routine.name : "Selecciona rutina"}</div>
          </div>
          <div className="flex items-center gap-2">
            {/* Timer compact */}
            <div className="relative">
              <Button onClick={() => setOpenTimerMenu((v) => !v)} className="text-xs px-3 py-1">
                <span className="inline-block w-4 mr-1"><Clock size={14} /></span>
                <span className="inline-block w-12 tabular-nums text-right">{fmtTime(restSec)}</span>
              </Button>
              {openTimerMenu && (
                <div className="absolute right-0 mt-2 p-2 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-lg z-50 min-w-[220px]" onBlur={()=> setOpenTimerMenu(false)} tabIndex={0}>
                  <div className="grid grid-cols-4 gap-2">
                    <Button className="text-xs" onClick={() => { quickRest(30); setOpenTimerMenu(false); }}>30s</Button>
                    <Button className="text-xs" onClick={() => { quickRest(60); setOpenTimerMenu(false); }}>60s</Button>
                    <Button className="text-xs" onClick={() => { quickRest(90); setOpenTimerMenu(false); }}>90s</Button>
                    <Button className="text-xs" onClick={() => { customRest(); setOpenTimerMenu(false); }}>Otro</Button>
                  </div>
                </div>
              )}
            </div>
            {!hasActive ? (
              <Button onClick={startSession} className="text-xs px-3 py-1" aria-label="Iniciar sesión de fuerza"><Play size={14} className="inline mr-1" /> Iniciar</Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button onClick={()=> { if (confirm('¿Cancelar sesión sin guardar?')) setActiveSession(null); }} className="text-xs px-3 py-1 bg-zinc-700/20 dark:bg-zinc-200/10">Cancelar</Button>
                <Button onClick={finishStrength} className="text-xs px-3 py-1 bg-emerald-600 hover:opacity-90" aria-label="Finalizar sesión de fuerza"><Check size={14} className="inline mr-1" /> Finalizar</Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <Card className="p-4 mt-1">
          <div className="mb-2">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Dumbbell size={18} /> Entrenamiento de fuerza</h2>
          </div>

        {!hasActive && (
          <div className="grid grid-cols-1 gap-2">
            <div>
              <Label>Rutina</Label>
              <div className="flex items-center gap-2 mt-1">
                <select value={routineId} onChange={(e) => setRoutineId(e.target.value)} className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  {routines.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
                </select>
                <IconButton onClick={() => setTab("routines")} title="Gestionar rutinas"><Edit3 size={16} /></IconButton>
              </div>
              <p className="text-xs text-zinc-500 mt-1">Hasta 7 rutinas · 8–12 ejercicios cada una</p>
            </div>
          </div>
        )}

        {hasActive && routine && (
          <div className="mt-3 space-y-3">
            {sessionExercises.map((origEx, idx) => {
              const effectiveId = sessionOverrides[origEx.id] || origEx.id;
              const ex = resolveExercise(effectiveId, data.customExercisesById);
              const st = perExerciseState[origEx.id] || { sets: [] };
              const prof = data.profileByExerciseId?.[effectiveId];
              let suggestion = "";
              if (prof?.next) {
                suggestion = ex.mode === 'reps'
                  ? `${kgOrLb(prof.next.weightKg || 0, unit)} ${unit} × ${prof.next.reps}`
                  : `${prof.next.reps}s`;
              } else if (prof?.last) {
                suggestion = ex.mode === 'reps'
                  ? `${kgOrLb(prof.last.weightKg || 0, unit)} ${unit} × ${prof.last.reps}`
                  : `${prof.last.reps}s`;
              }
              const setupParts = [];
              if (ex.pulleyHeightMark > 0) setupParts.push(`Altura ${ex.pulleyHeightMark}`);
              if (ex.benchAngleDeg > 0) setupParts.push(`${ex.benchAngleDeg}°`);
              if (ex.seatHeightMark > 0) setupParts.push(`Asiento ${ex.seatHeightMark}`);
              const setupText = setupParts.length ? ` · ${setupParts.join(' · ')}` : "";
              return (
                <div key={origEx.id} className={`rounded-2xl border ${st.completed ? "border-emerald-400" : "border-zinc-200 dark:border-zinc-800"} p-3`}>
                  <div className="mb-1">
                    <div className="text-base font-semibold leading-tight">{idx + 1}. {ex.name}</div>
                    <div className="text-xs text-zinc-500">
                      {ex.targetSets}×{ex.mode === "reps" ? (ex.targetRepsRange) : (ex.targetRepsRange || `${ex.targetTimeSec}s`)}
                      {suggestion ? ` · Sugerencia ${suggestion}` : ""}
                      {ex.restSec ? ` · ${ex.restSec}s` : ""}
                      {` · Tempo: ${tempoSugerido(ex.category, ex.mode)}`}
                      {setupText}
                      {ex.notes ? ` · ${ex.notes}` : ""}
                    </div>
                    </div>

                    {/* Filas por serie con checkbox */}
                  {!st.completed && (
                      <div className="mt-3 space-y-2">
                        {st.sets.map((row, i) => (
                          <div key={i} className="grid grid-cols-12 items-end gap-2">
                            <div className="col-span-1 flex items-center justify-center">
                              <input type="checkbox" checked={!!row.checked}
                                onChange={(e)=> setPerExerciseState(p=>({...p,[origEx.id]:{...p[origEx.id],sets:p[origEx.id].sets.map((s,j)=> j===i?{...s,checked:e.target.checked}:s)}}))}
                              />
                            </div>

                            <div className="col-span-3">
                              <Label>{ex.mode === "reps" ? "Reps" : "Seg"}</Label>
                              <Input type="number" inputMode="numeric" value={row.reps} className="text-base"
                                onChange={(e)=> setPerExerciseState(p=>({...p,[origEx.id]:{...p[origEx.id],sets:p[origEx.id].sets.map((s,j)=> j===i?{...s,reps:e.target.value}:s)}}))}
                              />
                            </div>

                            <div className="col-span-3">
                              <Label>Peso ({unit})</Label>
                              <Input type="number" step="0.25" inputMode="decimal" value={row.weight} className="text-base"
                                onChange={(e)=> setPerExerciseState(p=>({...p,[origEx.id]:{...p[origEx.id],sets:p[origEx.id].sets.map((s,j)=> j===i?{...s,weight:e.target.value}:s)}}))}
                              />
                            </div>

                            <div className="col-span-5">
                              <Label>RPE</Label>
                              <select
                                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-base"
                                value={row.rpe}
                                onChange={(e)=> setPerExerciseState(p=>({...p,[origEx.id]:{...p[origEx.id],sets:p[origEx.id].sets.map((s,j)=> j===i?{...s,rpe:parseFloat(e.target.value)}:s)}}))}
                              >
                                <option value={7}>7 o+ (RIR 3+)</option>
                                <option value={8}>RPE 8 (RIR 2)</option>
                                <option value={9}>RPE 9 (RIR 1)</option>
                                <option value={10}>RPE 10 (0)</option>
                              </select>
                            </div>
                          </div>
                        ))}
                      </div>
                  )}

                  {/* Drop set (si aplica) */}
                  {st.drop && !st.completed && (
                    <div className="mt-2 grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-12 text-xs text-zinc-500">Drop set (última serie):</div>
                      <div className="col-span-3">
                        <Label>{ex.mode === "reps" ? "Reps" : "Seg"}</Label>
                        <Input type="number" value={st.drop.reps} onChange={(e) => setPerExerciseState((p) => ({ ...p, [origEx.id]: { ...p[origEx.id], drop: { ...p[origEx.id].drop, reps: e.target.value } } }))} />
                      </div>
                      <div className="col-span-3">
                        <Label>Peso ({unit})</Label>
                        <Input type="number" step="0.25" inputMode="decimal" value={st.drop.weight} onChange={(e) => setPerExerciseState((p) => ({ ...p, [origEx.id]: { ...p[origEx.id], drop: { ...p[origEx.id].drop, weight: e.target.value } } }))} />
                      </div>
                    </div>
                  )}

                  {!st.completed && (
                  <div className="mt-3">
                    <div className="mb-2 text-xs text-zinc-500">Marca las series hechas y ajusta reps/peso si cambia</div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button className="w-full text-sm" onClick={() => viewAlternative(origEx)}>Ver alternativa</Button>
                      <Button className="w-full text-sm" onClick={() => registerExercise(origEx)}>Registrar ejercicio</Button>
                    </div>
                  </div>
                  )}
                </div>
              );
            })}

            <p className="text-[11px] text-zinc-500">Consejo: marca series y usa el reloj de arriba para descanso 30/60/90s 😉</p>

            <div className="mt-4 p-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/40">
              <div className="font-medium mb-2">Ejercicio extra (solo hoy)</div>
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-6">
                  <Label>Nombre</Label>
                  <Input value={quickAdd.name} onChange={(e)=>setQuickAdd(q=>({...q, name:e.target.value}))} placeholder="p. ej., Curl banca Scott" />
                </div>
                <div className="col-span-2">
                  <Label>Series</Label>
                  <Input type="number" inputMode="numeric" value={quickAdd.sets} onChange={(e)=>setQuickAdd(q=>({...q, sets:e.target.value}))} />
                </div>
                <div className="col-span-2">
                  <Label>Reps</Label>
                  <Input type="number" inputMode="numeric" value={quickAdd.reps} onChange={(e)=>setQuickAdd(q=>({...q, reps:e.target.value}))} />
                </div>
                <div className="col-span-2">
                  <Label>Peso ({unit})</Label>
                  <Input type="number" step="0.25" inputMode="decimal" value={quickAdd.weight} onChange={(e)=>setQuickAdd(q=>({...q, weight:e.target.value}))} />
                </div>
              </div>
              <div className="mt-2 flex justify-end">
                <Button className="text-sm" onClick={addAdhocExercise}><Plus size={14} className="inline mr-1" /> Agregar a la sesión</Button>
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">No modifica tus rutinas. Solo se registra en esta sesión.</p>
            </div>
          </div>
        )}
      </Card>

      {/* Cardio eliminado */}

      {/* Analytics snapshot */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2"><BarChart3 size={18} /> Analítica rápida</h2>
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyVolume || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" hide />
              <YAxis hide />
              <Tooltip formatter={(v) => `${Math.round(v)} kg·rep`} />
              <Bar dataKey="volume" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-zinc-500">En Historial verás 1RM estimada por ejercicio.</p>
      </Card>
    </div>
  );
}

function bestE1RMForExercise(activeSession, sessions, exerciseId) {
  let best = 0;
  for (const s of sessions.filter((x) => x.type === "strength")) {
    for (const st of s.sets || []) {
      if (st.exerciseId === exerciseId && st.mode !== "time") best = Math.max(best, epley1RM(st.weightKg, st.reps));
    }
  }
  if (activeSession) {
    for (const st of activeSession.sets || []) {
      if (st.exerciseId === exerciseId && st.mode !== "time") best = Math.max(best, epley1RM(st.weightKg, st.reps));
    }
  }
  return best;
}

// CardioForm eliminado

function RoutinesTab({ routines, addRoutine, deleteRoutine, renameRoutine, addExercise, deleteExercise, setData }) {
  const [openId, setOpenId] = useState("");
  const [editingExId, setEditingExId] = useState(null);
  const [draft, setDraft] = useState(null);

  const list = routines.filter(r => r.exercises.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tus rutinas</h2>
        <Button onClick={addRoutine} className="text-sm"><Plus size={16} className="inline mr-1" /> Nueva</Button>
      </div>
      {list.length === 0 && (
        <Card className="p-4 text-sm text-zinc-500">
          <div className="flex items-center justify-between">
            <span>Aún no tienes rutinas.</span>
            <Button className="text-sm" onClick={addRoutine}>Crear rutina</Button>
          </div>
        </Card>
      )}
      {list.map((r) => (
        <Card key={r.id} className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-zinc-500">{r.exercises.length} ejercicios</div>
            </div>
            <div className="flex items-center gap-2">
              <IconButton onClick={() => renameRoutine(r.id)} title="Renombrar"><Edit3 size={16} /></IconButton>
              <IconButton onClick={() => deleteRoutine(r.id)} title="Eliminar"><Trash2 size={16} /></IconButton>
              <IconButton onClick={() => setOpenId(prev => (prev === r.id ? "" : r.id))} title="Ver">{openId === r.id ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}</IconButton>
            </div>
          </div>

          {openId === r.id && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-zinc-500">Ejercicios</div>
                <Button onClick={() => addExercise(r.id)} className="text-xs"><Plus size={14} className="inline mr-1" /> Agregar</Button>
              </div>
              {r.exercises.length === 0 && <div className="text-sm text-zinc-500">Sin ejercicios aún.</div>}
              <div className="space-y-2">
                {r.exercises.map((ex, i) => (
                  <div key={ex.id} className="p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50"
                       draggable onDragStart={(e)=> e.dataTransfer.setData('text/plain', ex.id)}
                       onDragOver={(e)=> e.preventDefault()}
                       onDrop={(e)=>{ e.preventDefault(); const dragged = e.dataTransfer.getData('text/plain');
                         if(!dragged || dragged===ex.id) return;
                         setData(d=>({
                           ...d,
                           userRoutinesIndex:{
                             ...(d.userRoutinesIndex||{}),
                             [r.id]:(()=>{ const arr=[...(d.userRoutinesIndex?.[r.id]||[])]; const from=arr.indexOf(dragged); const to=arr.indexOf(ex.id); if(from===-1||to===-1) return arr; const [item]=arr.splice(from,1); arr.splice(to,0,item); return arr; })()
                           }
                         }));
                       }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{i + 1}. {ex.name}</div>
                        <div className="text-xs text-zinc-500">{ex.mode === "reps" ? `${ex.targetSets}×${ex.targetRepsRange}` : `${ex.targetSets}×${ex.targetTimeSec || ex.targetRepsRange}`} {ex.restSec ? `· ${ex.restSec}s` : ""} {ex.notes ? `· ${ex.notes}` : ""}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <IconButton onClick={() => { setEditingExId(ex.id); setDraft({ ...ex }); }} title="Editar"><Edit3 size={16} /></IconButton>
                        <IconButton onClick={() => deleteExercise(r.id, ex.id)} title="Eliminar"><Trash2 size={16} /></IconButton>
                      </div>
                    </div>

                    {editingExId === ex.id && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <Input value={draft?.name || ""} onChange={e=>setDraft(d=>({...d, name:e.target.value}))} />
                        <select value={draft?.mode || "reps"} onChange={e=>setDraft(d=>({...d, mode:e.target.value}))} className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                          <option value="reps">reps</option>
                          <option value="time">time</option>
                        </select>
                        <select value={draft?.category || "compuesto"} onChange={e=>setDraft(d=>({...d, category:e.target.value}))} className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                          <option value="compuesto">compuesto</option>
                          <option value="aislado">aislado</option>
                          <option value="core">core</option>
                        </select>
                        <Input type="number" value={draft?.targetSets||0} onChange={e=>setDraft(d=>({...d, targetSets:parseInt(e.target.value||0,10)}))} />
                        {draft?.mode === 'reps' ? (
                          <>
                            <Input placeholder="Rango reps" value={draft?.targetRepsRange||''} onChange={e=>setDraft(d=>({...d, targetRepsRange:e.target.value}))} />
                          </>
                        ) : (
                          <>
                            <Input type="number" placeholder="Segundos" value={draft?.targetTimeSec||0} onChange={e=>setDraft(d=>({...d, targetTimeSec:parseInt(e.target.value||0,10)}))} />
                            <Input placeholder="Rango" value={draft?.targetRepsRange||''} onChange={e=>setDraft(d=>({...d, targetRepsRange:e.target.value}))} />
                          </>
                        )}
                        <Input type="number" placeholder="Descanso (seg)" value={draft?.restSec||0} onChange={e=>setDraft(d=>({...d, restSec:parseInt(e.target.value||0,10)}))} />
                        <Input className="col-span-2" placeholder="Notas" value={draft?.notes||''} onChange={e=>setDraft(d=>({...d, notes:e.target.value}))} />
                        <div className="col-span-2 flex gap-2 justify-end">
                          <Button className="text-sm" onClick={() => { setEditingExId(null); setDraft(null); }}>Cancelar</Button>
                          <Button className="text-sm bg-emerald-600" onClick={()=>{
                            if(ex.id.startsWith('custom/')){
                              setData(d=>({
                                ...d,
                                customExercisesById:{
                                  ...(d.customExercisesById||{}),
                                  [ex.id]:{
                                    ...(d.customExercisesById?.[ex.id]||{}),
                                    name:draft.name,
                                    mode:draft.mode,
                                    category:draft.category,
                                    muscles:[MUSCLE_FROM_NAME(draft.name)],
                                    fixed:{ targetSets:draft.targetSets, targetRepsRange:draft.targetRepsRange, targetTimeSec:draft.targetTimeSec, restSec:draft.restSec },
                                    notes:draft.notes
                                  }
                                }
                              }));
                            } else {
                              const newId = `custom/${uid()}`;
                              const newEx = { id:newId, name:draft.name, mode:draft.mode, category:draft.category, muscles:[MUSCLE_FROM_NAME(draft.name)], fixed:{ targetSets:draft.targetSets, targetRepsRange:draft.targetRepsRange, targetTimeSec:draft.targetTimeSec, restSec:draft.restSec }, notes:draft.notes };
                              setData(d=>({
                                ...d,
                                customExercisesById:{ ...(d.customExercisesById||{}), [newId]: newEx },
                                userRoutinesIndex:{ ...(d.userRoutinesIndex||{}), [r.id]:(d.userRoutinesIndex?.[r.id]||[]).map(id=> id===ex.id ? newId : id) }
                              }));
                            }
                            setEditingExId(null);
                            setDraft(null);
                          }}>Guardar</Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function HistoryTab({ sessions, routines, perExerciseHistory, weeklyVolume, unit, deleteSession, setTab }) {
  const [exId, setExId] = useState("");
  const [range, setRange] = useState('30'); // días: '30' | '90' | '180'
  const [routineFilter, setRoutineFilter] = useState('all'); // 'all' | routineId
  const allExercises = routines.flatMap((r) => r.exercises);
  useEffect(() => { if (!exId && allExercises[0]) setExId(allExercises[0].id); }, [allExercises, exId]);

  const days = parseInt(range, 10);
  const filteredSessions = useMemo(()=>{
    const since = Date.now() - days*24*3600*1000;
    return sessions.filter(s=> new Date(s.dateISO).getTime() >= since && s.type==='strength' && (routineFilter==='all' || s.routineId===routineFilter));
  }, [sessions, days, routineFilter]);
  const totalSesiones = filteredSessions.length;
  const volumen4Semanas = useMemo(()=> {
    const since = Date.now() - 28*24*3600*1000;
    return sessions.filter(s=> s.type==='strength' && new Date(s.dateISO).getTime()>=since && (routineFilter==='all' || s.routineId===routineFilter))
      .reduce((a,s)=> a + (s.totalVolume||0), 0);
  }, [sessions, routineFilter]);
  const prsUltimas4 = useMemo(()=> {
    const best = new Map();
    let prs=0;
    const since = Date.now() - 28*24*3600*1000;
    for (const s of sessions.filter(x=>x.type==='strength' && (routineFilter==='all' || x.routineId===routineFilter))) {
      for (const st of s.sets||[]) {
        if (st.mode==='time') continue;
        const e1 = epley1RM(st.weightKg, st.reps);
        const b = best.get(st.exerciseId)||0;
        if (e1 > b && new Date(s.dateISO).getTime()>=since) prs++;
        best.set(st.exerciseId, Math.max(b, e1));
      }
    }
    return prs;
  }, [sessions, routineFilter]);
  const topE1RM = useMemo(()=> {
    const since = Date.now() - 30*24*3600*1000;
    const best = new Map();
    for (const s of sessions.filter(x=>x.type==='strength' && new Date(x.dateISO).getTime()>=since)) {
      for (const st of s.sets||[]) {
        if (st.mode==='time') continue;
        const e1 = epley1RM(st.weightKg, st.reps);
        best.set(st.exerciseId, Math.max(best.get(st.exerciseId)||0, e1));
      }
    }
    return [...best.entries()]
      .map(([id, oneRM])=>({ id, oneRM, name: (routines.flatMap(r=>r.exercises).find(e=>e.id===id)||{}).name||'Ejercicio' }))
      .sort((a,b)=>b.oneRM-a.oneRM)
      .slice(0,5);
  }, [sessions, routines]);

  const chartData = (perExerciseHistory.get(exId) || []);
  const weekly8 = (weeklyVolume || []).slice(-(8));
  const distrib = useMemo(()=> distributionPorGrupo(sessions, routines, days, routineFilter), [sessions, routines, days, routineFilter]);
  const weeklyStack = useMemo(()=> volumenSemanalApilado(sessions, routines, Math.min(8, Math.ceil(days/7)), routineFilter), [sessions, routines, days, routineFilter]);
  const prs = useMemo(()=> prsRecientes(sessions, routines, days, routineFilter), [sessions, routines, days, routineFilter]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Resumen</h2>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <select value={range} onChange={(e)=>setRange(e.target.value)} className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <option value="30">30 días</option>
            <option value="90">90 días</option>
            <option value="180">180 días</option>
          </select>
          <select value={routineFilter} onChange={(e)=>setRoutineFilter(e.target.value)} className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <option value="all">Todas las rutinas</option>
            {routines.map(r=> (<option key={r.id} value={r.id}>{r.name}</option>))}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <Card className="p-3 text-center"><div className="text-xs text-zinc-500">Sesiones ({range}d)</div><div className="text-lg font-semibold">{totalSesiones}</div></Card>
          <Card className="p-3 text-center"><div className="text-xs text-zinc-500">Volumen (4 sem)</div><div className="text-lg font-semibold">{Math.round(volumen4Semanas)} kg·rep</div></Card>
          <Card className="p-3 text-center"><div className="text-xs text-zinc-500">PRs (4 sem)</div><div className="text-lg font-semibold">{prsUltimas4}</div></Card>
        </div>
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
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-2">Distribución por grupo</h2>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={distrib} dataKey="volume" nameKey="group" labelLine={false} label={({percent}) => `${Math.round(percent*100)}%`}>
                {distrib.map((d) => (
                  <Cell key={d.group} fill={GROUP_COLORS[d.group]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => `${Math.round(v)} kg·rep`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-2">Volumen semanal por grupo</h2>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyStack}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" hide />
              <Tooltip formatter={(v) => `${Math.round(v)} kg·rep`} />
              <Legend />
              <Bar dataKey="pecho" fill={GROUP_COLORS.pecho} stackId="a" />
              <Bar dataKey="espalda" fill={GROUP_COLORS.espalda} stackId="a" />
              <Bar dataKey="pierna" fill={GROUP_COLORS.pierna} stackId="a" />
              <Bar dataKey="hombro" fill={GROUP_COLORS.hombro} stackId="a" />
              <Bar dataKey="brazo" fill={GROUP_COLORS.brazo} stackId="a" />
              <Bar dataKey="core" fill={GROUP_COLORS.core} stackId="a" />
              <Bar dataKey="otros" fill={GROUP_COLORS.otros} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
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
            {allExercises.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
          </select>
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis allowDecimals={false} />
              <Tooltip formatter={(v) => `${kgOrLb(Math.round(v), unit)} ${unit}`} />
              <Line type="monotone" dataKey="oneRM" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3">
          <h3 className="text-sm font-medium mb-1">Top 5 e1RM (30 días)</h3>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y">
            {topE1RM.map((row)=>(
              <div key={row.id} className="flex justify-between px-3 py-2 text-sm">
                <span className="truncate">{row.name}</span>
                <span className="tabular-nums">{kgOrLb(row.oneRM, unit)} {unit}</span>
              </div>
            ))}
            {topE1RM.length===0 && <div className="px-3 py-2 text-sm text-zinc-500">Sin datos todavía.</div>}
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-2">Sesiones</h2>
        <div className="space-y-2">
          {sessions.filter(s=>s.type==='strength').length === 0 && (
            <Card className="p-3 text-sm text-zinc-500 flex items-center justify-between">
              <span>Aún no tienes sesiones registradas.</span>
              <Button className="text-sm" onClick={()=> setTab('today')}>Iniciar sesión</Button>
            </Card>
          )}
          {sessions.filter(s => s.type === 'strength').map((s) => (
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

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-2">Top 5 e1RM (30 días)</h2>
        {(() => {
          const topE1 = (()=>{
            const since = Date.now()-30*24*3600*1000;
            const best = new Map();
            for (const s of sessions.filter(x=>x.type==='strength' && new Date(x.dateISO).getTime()>=since)) {
              for (const st of s.sets||[]) {
                if (st.mode==='time') continue;
                best.set(st.exerciseId, Math.max(best.get(st.exerciseId)||0, epley1RM(st.weightKg, st.reps)));
              }
            }
            return [...best.entries()].map(([id,val])=>({ id, name:(routines.flatMap(r=>r.exercises).find(e=>e.id===id)||{}).name||'Ejercicio', val }))
              .sort((a,b)=> b.val-a.val).slice(0,5);
          })();
          return (
            <>
              {topE1.map(r=> <div key={r.id} className="flex justify-between py-1 text-sm"><span className="truncate">{r.name}</span><span className="tabular-nums">{kgOrLb(r.val, unit)} {unit}</span></div>)}
              {topE1.length===0 && <div className="text-sm text-zinc-500">Sin datos aún.</div>}
            </>
          )
        })()}
      </Card>
    </div>
  );
}

function SettingsTab({ data, setData }) {
  const [fileErr, setFileErr] = useState("");
  const [calc, setCalc] = useState({ weight: "", reps: "", percent: "85" });
  const [showPolicy, setShowPolicy] = useState(false);

  const onExport = () => {
    const json = JSON.stringify(data, null, 2);
    // Try download with Blob first
    try {
      const blob = new Blob([json], { type: "application/json" });
      const URL_ = window.URL || URL;
      const url = URL_?.createObjectURL?.(blob);
      if (url) {
        const a = document.createElement("a");
        a.href = url; // may fail in sandbox, hence fallback below
        a.download = `nicofit_backup_${todayISO()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL_?.revokeObjectURL?.(url);
        return;
      }
    } catch { /* noop */ }

    // Fallback 1: copy to clipboard
    try {
      navigator.clipboard?.writeText(json);
      alert("No se pudo descargar archivo. Copié el JSON al portapapeles.");
      return;
    } catch { /* noop */ }

    // Fallback 2: open in new tab for manual save
    try {
      const w = window.open();
      if (w) {
        w.document.write(`<pre style="white-space:pre-wrap;word-break:break-word;">${escapeHtml(json)}</pre>`);
        w.document.close();
        return;
      }
    } catch { /* noop */ }

    alert("Export no disponible en este entorno. Copia manual desde la consola.");
  };

  const onImport = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (!obj.settings || !obj.routines || !obj.sessions) throw new Error("Archivo inválido");
        setData(obj);
        setFileErr("");
        alert("Datos importados ✔");
      } catch {
        setFileErr("No se pudo importar (JSON inválido)");
      }
    };
    reader.readAsText(f);
  };

  const oneRm = (() => { const w = parseFloat(calc.weight || 0); const r = parseInt(calc.reps || 0, 10); return epley1RM(w, r); })();
  const targetLoad = (() => { const p = parseFloat(calc.percent || 0) / 100; return Math.round(oneRm * p); })();

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-2">Preferencias</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Unidades</Label>
            <select value={data.settings.unit} onChange={(e) => setData((d) => ({ ...d, settings: { ...d.settings, unit: e.target.value } }))} className="mt-1 w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </select>
          </div>
          <div>
            <Label>Descanso (seg)</Label>
            <Input type="number" value={data.settings.defaultRestSec} onChange={(e) => setData((d) => ({ ...d, settings: { ...d.settings, defaultRestSec: parseInt(e.target.value || 0, 10) } }))} />
          </div>
          <div>
            <Label>Sonido</Label>
            <select value={String(data.settings.sound)} onChange={(e) => setData((d) => ({ ...d, settings: { ...d.settings, sound: e.target.value === "true" } }))} className="mt-1 w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <option value="true">On</option>
              <option value="false">Off</option>
            </select>
          </div>
          <div>
            <Label>Vibración</Label>
            <select value={String(data.settings.vibration)} onChange={(e) => setData((d) => ({ ...d, settings: { ...d.settings, vibration: e.target.value === "true" } }))} className="mt-1 w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <option value="true">On</option>
              <option value="false">Off</option>
            </select>
          </div>
          <div>
            <Label>Tema</Label>
            <select value={data.settings.theme} onChange={(e) => setData((d) => ({ ...d, settings: { ...d.settings, theme: e.target.value } }))} className="mt-1 w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <option value="system">Sistema</option>
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
            </select>
          </div>
        </div>
        <div className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">Versión: <span className="font-semibold">v{data.version || 1}</span></div>
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-2">Calculadora 1RM</h2>
        <div className="grid grid-cols-3 gap-2 items-end">
          <div>
            <Label>Peso (kg)</Label>
            <Input type="number" step="0.25" inputMode="decimal" value={calc.weight} onChange={(e) => setCalc((c) => ({ ...c, weight: e.target.value }))} />
          </div>
          <div>
            <Label>Reps</Label>
            <Input type="number" value={calc.reps} onChange={(e) => setCalc((c) => ({ ...c, reps: e.target.value }))} />
          </div>
          <div>
            <Label>% objetivo</Label>
            <Input type="number" value={calc.percent} onChange={(e) => setCalc((c) => ({ ...c, percent: e.target.value }))} />
          </div>
        </div>
        <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">1RM estimada: <span className="font-semibold">{oneRm || 0} kg</span> · Carga al {calc.percent}%: <span className="font-semibold">{Number.isFinite(targetLoad) ? targetLoad : 0} kg</span></div>
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-2">Datos</h2>
        <div className="flex items-center gap-2">
          <Button onClick={onExport} className="text-sm"><Download size={16} className="inline mr-1" /> Exportar</Button>
          <label className="px-4 py-2 rounded-2xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 cursor-pointer text-sm">
            <Upload size={16} className="inline mr-1" /> Importar
            <input type="file" accept="application/json" onChange={onImport} className="hidden" />
          </label>
          <Button className="text-sm" onClick={()=> setShowPolicy(true)}>Política de datos</Button>
        </div>
        {fileErr && <div className="text-sm text-rose-500 mt-2">{fileErr}</div>}
        <p className="text-xs text-zinc-500 mt-2">Si la descarga está bloqueada por el entorno, copio el JSON al portapapeles o lo abro en una pestaña nueva.</p>
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-1">Tips</h2>
        <ul className="text-sm text-zinc-600 dark:text-zinc-400 list-disc ml-5 space-y-1">
          <li>Agrega NicoFit a tu pantalla de inicio en iPhone para abrirlo como app.</li>
          <li>Define descansos por ejercicio desde la rutina si quieres más control.</li>
          <li>El peso se autocompleta con el sugerido; ajústalo en cada serie si hace falta.</li>
        </ul>
      </Card>

      {showPolicy && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
          <Card className="max-w-sm w-[90%] p-4">
            <h3 className="text-lg font-semibold mb-2">Política de datos</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Los datos se guardan localmente en tu dispositivo (LocalStorage). Puedes exportarlos/importarlos.
              Si activas PWA/notificaciones, se instalan archivos en caché para funcionar offline.
              No se envían datos a servidores externos.
            </p>
            <div className="mt-3 flex justify-end">
              <Button className="text-sm" onClick={()=> setShowPolicy(false)}>Cerrar</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ---------- Utils ----------
// paceToStr eliminado
function weekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}
function computeWeeklyVolume(sessions) {
  const res = {};
  for (const s of (sessions || [])) {
    if (s.type !== "strength") continue;
    const d = new Date(s.dateISO);
    const wk = `${d.getUTCFullYear()}-W${weekNumber(d)}`;
    res[wk] = (res[wk] || 0) + (s.totalVolume || 0);
  }
  return Object.entries(res).map(([week, volume]) => ({ week, volume: Math.round(volume) })).sort((a, b) => a.week.localeCompare(b.week));
}

// Distribución de volumen por grupo muscular en ventana de "days" días
function distributionPorGrupo(sessions, routines, days = 30, routineId = 'all') {
  const exGroup = new Map();
  for (const r of routines) {
    for (const ex of r.exercises) exGroup.set(ex.id, primaryGroup(ex) || 'otros');
  }
  const since = Date.now() - days * 24 * 3600 * 1000;
  const res = { pecho: 0, espalda: 0, pierna: 0, hombro: 0, brazo: 0, core: 0, otros: 0 };
  for (const s of sessions) {
    if (s.type !== 'strength') continue;
    if (routineId !== 'all' && s.routineId !== routineId) continue;
    if (new Date(s.dateISO).getTime() < since) continue;
    for (const st of s.sets || []) {
      if (st.mode === 'time') continue;
      const g = exGroup.get(st.exerciseId) || 'otros';
      res[g] += (st.weightKg || 0) * (st.reps || 0);
    }
  }
  return Object.entries(res).map(([group, volume]) => ({ group, volume }));
}

// Volumen semanal apilado por grupo muscular
function volumenSemanalApilado(sessions, routines, weeks = 8, routineId = 'all') {
  const exGroup = new Map();
  for (const r of routines) {
    for (const ex of r.exercises) exGroup.set(ex.id, primaryGroup(ex) || 'otros');
  }
  const since = Date.now() - weeks * 7 * 24 * 3600 * 1000;
  const out = {};
  for (const s of sessions) {
    if (s.type !== 'strength') continue;
    if (routineId !== 'all' && s.routineId !== routineId) continue;
    const d = new Date(s.dateISO);
    if (d.getTime() < since) continue;
    const wk = `${d.getUTCFullYear()}-W${weekNumber(d)}`;
    if (!out[wk]) out[wk] = { week: wk, pecho:0, espalda:0, pierna:0, hombro:0, brazo:0, core:0, otros:0 };
    for (const st of s.sets || []) {
      if (st.mode === 'time') continue;
      const g = exGroup.get(st.exerciseId) || 'otros';
      out[wk][g] += (st.weightKg || 0) * (st.reps || 0);
    }
  }
  return Object.values(out).sort((a,b)=> a.week.localeCompare(b.week)).slice(-weeks);
}

// Lista de PRs recientes (e1RM, volumen, reps) en ventana de "days" días
function prsRecientes(sessions, routines, days = 30, routineId = 'all') {
  const exName = new Map();
  for (const r of routines) {
    for (const ex of r.exercises) exName.set(ex.id, ex.name);
  }
  const sorted = [...sessions]
    .filter(s=> s.type==='strength' && (routineId==='all' || s.routineId===routineId))
    .sort((a,b)=> new Date(a.dateISO) - new Date(b.dateISO));
  const bestE1 = new Map();
  const bestVol = new Map();
  const bestReps = new Map();
  const res = [];
  const since = Date.now() - days * 24 * 3600 * 1000;
  for (const s of sorted) {
    const t = new Date(s.dateISO).getTime();
    for (const st of s.sets || []) {
      if (st.mode === 'time') continue;
      const id = st.exerciseId;
      const name = exName.get(id) || 'Ejercicio';
      const vol = (st.weightKg || 0) * (st.reps || 0);
      const e1 = epley1RM(st.weightKg, st.reps);
      const reps = st.reps || 0;
      if (e1 > (bestE1.get(id) || 0)) {
        if (t >= since) res.push({ id: `${st.id}-e1`, name, metric: 'e1RM', dateISO: s.dateISO });
        bestE1.set(id, e1);
      }
      if (vol > (bestVol.get(id) || 0)) {
        if (t >= since) res.push({ id: `${st.id}-vol`, name, metric: 'volumen', dateISO: s.dateISO });
        bestVol.set(id, vol);
      }
      if (reps > (bestReps.get(id) || 0)) {
        if (t >= since) res.push({ id: `${st.id}-reps`, name, metric: '+reps', dateISO: s.dateISO });
        bestReps.set(id, reps);
      }
    }
  }
  return res.sort((a,b)=> new Date(b.dateISO) - new Date(a.dateISO)).slice(0,5);
}

// ---------- Dev self-tests (console) ----------
(function runDevTests(){
  try {
    console.assert(epley1RM(100, 1) === 100 + Math.round(100 * (1/30)), "epley1RM trivial");
    console.assert(rpeToRir(10) === 0 && rpeToRir(9) === 1 && rpeToRir(8) === 2 && rpeToRir(7) === 3, "rpe→rir mapping");
    console.assert(weekNumber(new Date("2024-01-01")) >= 1, "week number");
    const wkEmpty = computeWeeklyVolume([]);
    console.assert(Array.isArray(wkEmpty) && wkEmpty.length === 0, "weeklyVolume empty");
    const fakeSessions = [
      { id: "a", type: "strength", dateISO: "2024-01-03T10:00:00.000Z", totalVolume: 1000 },
      { id: "b", type: "strength", dateISO: "2024-01-04T10:00:00.000Z", totalVolume: 500 },
      { id: "c", type: "cardio", dateISO: "2024-01-05T10:00:00.000Z", durationSec: 1800 },
    ];
    const wk = computeWeeklyVolume(fakeSessions);
    console.assert(wk.length === 1 && wk[0].volume === 1500, "weeklyVolume aggregation");
  } catch (e) {
    console.warn("Dev tests warning:", e);
  }
})();
