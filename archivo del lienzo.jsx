import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dumbbell, Timer as TimerIcon, History, Settings as SettingsIcon, Play, Square, Plus, Trash2, Edit3, Download, Upload, ChevronRight, ChevronLeft, BarChart3, Flame, Repeat2, Check, Award, Clock } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";

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
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const fmtTime = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
};
const toISODate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
const todayISO = () => toISODate().slice(0, 10);
const paceFrom = (sec, km) => (km > 0 ? sec / km : 0);
const epley1RM = (w, reps) => (w > 0 && reps > 0 ? Math.round(w * (1 + reps / 30)) : 0);
const kgOrLb = (val, unit) => (unit === "lb" ? Math.round(val * 2.20462 * 10) / 10 : Math.round(val));
const fromDisplayToKg = (val, unit) => (unit === "lb" ? Math.round((val / 2.20462) * 10) / 10 : val);
const rpeToRir = (rpe) => {
  const x = parseFloat(rpe || 0);
  if (x >= 10) return 0;
  if (x >= 9.5) return 0;
  if (x >= 9) return 1;
  if (x >= 8.5) return 1;
  if (x >= 8) return 2;
  if (x >= 7) return 3;
  return 4;
};
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Default dataset (pre-cargada con Rutina 1) ----------
const DEFAULT_DATA = {
  version: 4,
  settings: {
    unit: "kg", // "kg" | "lb"
    defaultRestSec: 90,
    sound: true,
    vibration: true,
    theme: "system", // system | light | dark
  },
  routines: [
    {
      id: uid(),
      name: "Rutina 1 — Nico",
      exercises: [
        { id: uid(), name: "Belt squat cuádriceps", category: "compuesto", mode: "reps", targetSets: 2, targetReps: 8, targetRepsRange: "6–8", suggestedWeightKg: 160, restSec: 120, notes: "" },
        { id: uid(), name: "Belt squat glúteos", category: "compuesto", mode: "reps", targetSets: 2, targetReps: 8, targetRepsRange: "6–8", suggestedWeightKg: 160, restSec: 120, notes: "" },
        { id: uid(), name: "Peso muerto sumo", category: "compuesto", mode: "reps", targetSets: 3, targetReps: 8, targetRepsRange: "6–8", suggestedWeightKg: 60, restSec: 150, notes: "" },
        { id: uid(), name: "Press banca barra", category: "compuesto", mode: "reps", targetSets: 3, targetReps: 10, targetRepsRange: "6–10", suggestedWeightKg: 60, restSec: 120, notes: "" },
        { id: uid(), name: "Low seat row (agarre horizontal)", category: "compuesto", mode: "reps", targetSets: 3, targetReps: 12, targetRepsRange: "8–12", suggestedWeightKg: 70, restSec: 90, notes: "" },
        { id: uid(), name: "Vuelo lateral mancuernas (lateral)", category: "aislado", mode: "reps", targetSets: 2, targetReps: 15, targetRepsRange: "12–15", suggestedWeightKg: 8, restSec: 60, notes: "" },
        { id: uid(), name: "Vuelo lateral mancuernas (frontal)", category: "aislado", mode: "reps", targetSets: 1, targetReps: 15, targetRepsRange: "12–15", suggestedWeightKg: 6, restSec: 60, notes: "" },
        { id: uid(), name: "Curl bíceps martillo silla 60° (+ drop)", category: "aislado", mode: "reps", targetSets: 3, targetReps: 15, targetRepsRange: "12–15 (2+1D)", suggestedWeightKg: 10, restSec: 60, notes: "Drop set" },
        { id: uid(), name: "Curl bíceps concentrado silla (+ drop)", category: "aislado", mode: "reps", targetSets: 3, targetReps: 12, targetRepsRange: "10–12 (2+1D)", suggestedWeightKg: 8, restSec: 60, notes: "Drop set" },
        { id: uid(), name: "Patada tríceps polea una mano", category: "aislado", mode: "reps", targetSets: 3, targetReps: 15, targetRepsRange: "12–15", suggestedWeightKg: 10, restSec: 60, notes: "" },
        { id: uid(), name: "Plancha frontal", category: "core", mode: "time", targetSets: 3, targetTimeSec: 45, targetRepsRange: "45s", suggestedWeightKg: 0, restSec: 45, notes: "Corporal" },
        { id: uid(), name: "Rueda Abs", category: "core", mode: "reps", targetSets: 3, targetReps: 15, targetRepsRange: "12–15", suggestedWeightKg: 0, restSec: 45, notes: "Corporal" },
      ],
    },
  ],
  sessions: [], // strength + cardio
};

// ---------- Storage ----------
const LS_KEY = "nicofit_data_v4";
const load = () => {
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
    } catch {}
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
  <button onClick={onClick} title={title} className={`p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition ${className}`}>{children}</button>
);
const Input = (props) => <input {...props} className={`w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:ring-2 ring-zinc-300 dark:ring-zinc-600 ${props.className || ""}`} />;
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
  const [data, setData] = useState(load());
  const [tab, setTab] = useState("today");
  const [activeSession, setActiveSession] = useState(null); // {id,type,dateISO,routineId,sets:[],startedAt,kcal?}
  const [restSec, setRestSec] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [prFlash, setPrFlash] = useState("");
  const beep = useBeep();

  useEffect(() => save(data), [data]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (restSec <= 0) return;
    const t = setInterval(() => {
      setRestSec((s) => {
        if (s <= 1) {
          if (data.settings.sound) beep();
          if (data.settings.vibration && navigator.vibrate) navigator.vibrate(80);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [restSec, data.settings.sound, data.settings.vibration, beep]);

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

  const routines = data.routines;
  const sessions = data.sessions;

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
    setTimeout(() => setPrFlash(""), 1200);
  };

  const deleteSession = (id) => setData((d) => ({ ...d, sessions: d.sessions.filter((s) => s.id !== id) }));

  const addRoutine = () => {
    if (routines.length >= 7) return alert("Límite: 7 rutinas");
    const name = prompt("Nombre de la rutina");
    if (!name) return;
    setData((d) => ({ ...d, routines: [...d.routines, { id: uid(), name, exercises: [] }] }));
  };
  const deleteRoutine = (id) => { if (!confirm("¿Eliminar rutina?")) return; setData((d) => ({ ...d, routines: d.routines.filter((r) => r.id !== id) })); };
  const renameRoutine = (id) => { const name = prompt("Nuevo nombre"); if (!name) return; setData((d) => ({ ...d, routines: d.routines.map((r) => (r.id === id ? { ...r, name } : r)) })); };

  const addExercise = (routineId) => {
    const r = routines.find((x) => x.id === routineId);
    if (!r) return;
    if (r.exercises.length >= 12) return alert("Límite: 12 ejercicios por rutina");
    const name = prompt("Nombre del ejercicio");
    if (!name) return;
    const mode = (prompt("Modo (reps/time)", "reps") || "reps").toLowerCase() === "time" ? "time" : "reps";
    const category = (prompt("Categoría (compuesto/aislado/core)", "compuesto") || "compuesto").toLowerCase();
    const targetSets = parseInt(prompt("Series objetivo") || "3", 10);
    let targetReps = 10; let targetTimeSec = 45;
    if (mode === "reps") targetReps = parseInt(prompt("Reps objetivo por serie") || "10", 10);
    else targetTimeSec = parseInt(prompt("Segundos por serie") || "45", 10);
    const targetRepsRange = prompt("Rango reps/tiempo a mostrar (opcional)", mode === "reps" ? "8–12" : "45s") || (mode === "reps" ? `${targetReps}` : `${targetTimeSec}s`);
    const suggestedWeightKg = parseFloat(prompt("Peso sugerido (kg, 0 si corporal)", "0") || "0");
    const restSec = parseInt(prompt("Descanso por ejercicio (seg, vacío=global)") || "0", 10) || undefined;
    const notes = prompt("Notas (opcional)") || "";
    const ex = { id: uid(), name, category, mode, targetSets, targetReps, targetTimeSec, targetRepsRange, suggestedWeightKg, restSec, notes };
    setData((d) => ({ ...d, routines: d.routines.map((rr) => (rr.id === routineId ? { ...rr, exercises: [...rr.exercises, ex] } : rr)) }));
  };
  const editExercise = (routineId, exId) => {
    const r = routines.find((x) => x.id === routineId);
    const ex = r?.exercises.find((e) => e.id === exId);
    if (!ex) return;
    const name = prompt("Nombre", ex.name) || ex.name;
    const mode = (prompt("Modo (reps/time)", ex.mode) || ex.mode).toLowerCase() === "time" ? "time" : "reps";
    const category = (prompt("Categoría (compuesto/aislado/core)", ex.category) || ex.category).toLowerCase();
    const targetSets = parseInt(prompt("Series objetivo", String(ex.targetSets)) || ex.targetSets, 10);
    let targetReps = ex.targetReps; let targetTimeSec = ex.targetTimeSec;
    if (mode === "reps") targetReps = parseInt(prompt("Reps objetivo", String(ex.targetReps ?? 10)) || ex.targetReps || 10, 10);
    else targetTimeSec = parseInt(prompt("Segundos por serie", String(ex.targetTimeSec ?? 45)) || ex.targetTimeSec || 45, 10);
    const targetRepsRange = prompt("Rango reps/tiempo", ex.targetRepsRange || "") || ex.targetRepsRange;
    const suggestedWeightKg = parseFloat(prompt("Peso sugerido (kg)", String(ex.suggestedWeightKg ?? 0)) || ex.suggestedWeightKg || 0);
    const restSec = parseInt(prompt("Descanso por ejercicio (seg, 0=global)", String(ex.restSec ?? 0)) || "0", 10) || undefined;
    const notes = prompt("Notas", ex.notes) ?? ex.notes;
    const updated = { ...ex, name, category, mode, targetSets, targetReps, targetTimeSec, targetRepsRange, suggestedWeightKg, restSec, notes };
    setData((d) => ({ ...d, routines: d.routines.map((rr) => (rr.id === routineId ? { ...rr, exercises: rr.exercises.map((ee) => (ee.id === exId ? updated : ee)) } : rr)) }));
  };
  const deleteExercise = (routineId, exId) => { if (!confirm("¿Eliminar ejercicio?")) return; setData((d) => ({ ...d, routines: d.routines.map((rr) => (rr.id === routineId ? { ...rr, exercises: rr.exercises.filter((e) => e.id !== exId) } : rr)) })); };

  // ---------- Analytics ----------
  const perExerciseHistory = useMemo(() => {
    const map = new Map();
    for (const s of sessions.filter((x) => x.type === "strength")) {
      for (const set of s.sets) {
        const key = set.exerciseId;
        const ex = routines.flatMap((r) => r.exercises).find((e) => e.id === key);
        if (!ex) continue;
        const date = s.dateISO.slice(0, 10);
        const entry = { date, exerciseId: key, exercise: ex.name, volume: set.mode === "time" ? 0 : set.reps * set.weightKg, oneRM: set.mode === "time" ? 0 : epley1RM(set.weightKg, set.reps) };
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
          <div className="text-xs text-zinc-500">{new Date(now).toLocaleDateString()}</div>
        </header>

        {tab === "today" && (
          <TodayTab
            data={data}
            routines={routines}
            activeSession={activeSession}
            startStrength={startStrength}
            finishStrength={finishStrength}
            setActiveSession={setActiveSession}
            flashPR={flashPR}
            restSec={restSec}
            setRestSec={setRestSec}
            unit={unit}
            setTab={setTab}
            weeklyVolume={weeklyVolume}
          />
        )}

        {tab === "routines" && (
          <RoutinesTab
            routines={routines}
            addRoutine={addRoutine}
            deleteRoutine={deleteRoutine}
            renameRoutine={renameRoutine}
            addExercise={addExercise}
            editExercise={editExercise}
            deleteExercise={deleteExercise}
          />
        )}

        {tab === "history" && (
          <HistoryTab sessions={sessions} routines={routines} perExerciseHistory={perExerciseHistory} weeklyVolume={weeklyVolume} unit={unit} deleteSession={deleteSession} />
        )}

        {tab === "settings" && (
          <SettingsTab data={data} setData={setData} />
        )}
      </div>

      <Nav tab={tab} setTab={setTab} />

      {restSec > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2">
          <Card className="px-4 py-2 flex items-center gap-2">
            <TimerIcon size={16} />
            <span className="tabular-nums font-semibold">{fmtTime(restSec)}</span>
            <IconButton onClick={() => setRestSec(30)} title="30s"><span className="text-xs font-medium">30s</span></IconButton>
            <IconButton onClick={() => setRestSec(60)} title="60s"><span className="text-xs font-medium">60s</span></IconButton>
            <IconButton onClick={() => setRestSec(90)} title="90s"><span className="text-xs font-medium">90s</span></IconButton>
            <IconButton onClick={() => setRestSec((s) => clamp(s + 15, 0, 9999))} title="+15s"><Plus size={16} /></IconButton>
            <IconButton onClick={() => setRestSec(0)} title="Parar"><Square size={16} /></IconButton>
          </Card>
        </div>
      )}

      {prFlash && (
        <div className="fixed bottom-40 left-1/2 -translate-x-1/2">
          <Card className="px-4 py-2 flex items-center gap-2">
            <Award size={16} />
            <span className="text-sm font-medium">{prFlash} 🎉</span>
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

function TodayTab({ data, routines, activeSession, setActiveSession, startStrength, finishStrength, flashPR, restSec, setRestSec, unit, setTab, weeklyVolume }) {
  const [routineId, setRoutineId] = useState(routines[0]?.id || "");
  useEffect(() => { if (!routineId && routines[0]) setRoutineId(routines[0].id); }, [routines, routineId]);
  const routine = routines.find((r) => r.id === (activeSession?.routineId || routineId));

  const [perExerciseState, setPerExerciseState] = useState({});
  const [openTimerMenu, setOpenTimerMenu] = useState(false);

  // shape: { [exId]: { sets: [{checked, reps, weight, rpe}], drop?: {reps, weight}, completed: bool } }

  useEffect(() => {
    if (!routine) return;
    setPerExerciseState((prev) => {
      const copy = { ...prev };
      for (const ex of routine.exercises) {
        if (!copy[ex.id]) {
          const baseWeight = kgOrLb(ex.suggestedWeightKg || 0, unit);
          copy[ex.id] = {
            sets: Array.from({ length: ex.targetSets || 3 }).map(() => ({ checked: false, reps: ex.mode === "reps" ? ex.targetReps || 10 : ex.targetTimeSec || 45, weight: baseWeight, rpe: 8 })),
            drop: ex.notes?.toLowerCase().includes("drop") ? { reps: ex.mode === "reps" ? Math.ceil((ex.targetReps || 10) * 0.6) : 30, weight: baseWeight ? Math.round(baseWeight * 0.8) : 0 } : null,
            completed: false,
          };
        }
      }
      return copy;
    });
  }, [routine, unit]);

  const hasActive = !!activeSession;
  const startSession = () => startStrength(routineId);

  const handleStartRest = (ex) => {
    const options = [30, 60, 90];
    const pick = prompt(`Descanso (segundos): ${options.join("/")}`, String(ex?.restSec || data.settings.defaultRestSec));
    if (!pick) return;
    const val = parseInt(pick, 10);
    if (!Number.isNaN(val)) setRestSec(val);
  };
  const quickRest = (sec) => setRestSec(sec);
  const customRest = () => {
    const pick = prompt("Segundos de descanso", String(restSec || data.settings.defaultRestSec));
    if (!pick) return;
    const val = parseInt(pick, 10);
    if (!Number.isNaN(val)) setRestSec(val);
  };

  const registerExercise = (ex) => {
    if (!activeSession) return alert("Inicia la sesión primero");
    const st = perExerciseState[ex.id];
    if (!st) return;
    // push sets
    const newSets = [];
    st.sets.forEach((s) => {
      if (s.checked) {
        const repsOrSec = parseInt(s.reps || 0, 10);
        const wkg = fromDisplayToKg(parseFloat(s.weight || 0), unit);
        const rpe = parseFloat(s.rpe || 8);
        const rir = rpeToRir(rpe);
        newSets.push({ id: uid(), exerciseId: ex.id, mode: ex.mode, reps: repsOrSec, weightKg: wkg, rpe, rir, tempo: tempoSugerido(ex.category, ex.mode), at: Date.now() });
      }
    });
    if (st.drop && st.sets.filter((x) => x.checked).length === st.sets.length) {
      // only if last series completed
      const repsOrSec = parseInt(st.drop.reps || 0, 10);
      const wkg = fromDisplayToKg(parseFloat(st.drop.weight || 0), unit);
      newSets.push({ id: uid(), exerciseId: ex.id, mode: ex.mode, reps: repsOrSec, weightKg: wkg, rpe: 10, rir: 0, tempo: tempoSugerido(ex.category, ex.mode), at: Date.now(), drop: true });
    }
    if (newSets.length === 0) return alert("Marca al menos una serie");

    // PR detection vs previous
    const bestE1 = bestE1RMForExercise(activeSession, data.sessions, ex.id);
    let raised = false;
    for (const n of newSets) {
      if (n.mode !== "time") {
        const e1 = epley1RM(n.weightKg, n.reps);
        if (e1 > bestE1) { raised = true; break; }
      }
    }

    setActiveSession((s) => ({ ...s, sets: [...s.sets, ...newSets] }));
    setPerExerciseState((p) => ({ ...p, [ex.id]: { ...p[ex.id], completed: true } }));

    const rest = ex?.restSec ?? data.settings.defaultRestSec;
    setRestSec(rest);

    if (raised) flashPR("PR 1RM estimada");
  };

  return (
    <div className="space-y-4">
      {/* Sticky glass header with global timer + start/finish */}
      <div className="sticky top-0 z-20 -mx-4 px-4 pt-2 pb-2 bg-white/70 dark:bg-zinc-950/50 backdrop-blur border-b border-zinc-200/60 dark:border-zinc-800">
        <div className="max-w-md mx-auto flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] text-zinc-500">Rutina</div>
            <div className="truncate font-medium">{routine ? routine.name : "Selecciona rutina"}</div>
          </div>
          <div className="flex items-center gap-2">
            {/* Timer compact */}
            <div className="relative">
              <Button onClick={() => setOpenTimerMenu((v) => !v)} className="text-xs px-3 py-1"><Clock size={14} className="inline mr-1" /> {fmtTime(restSec)}</Button>
              {openTimerMenu && (
                <div className="absolute right-0 mt-2 p-2 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-lg">
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
              <Button onClick={startSession} className="text-xs px-3 py-1"><Play size={14} className="inline mr-1" /> Iniciar</Button>
            ) : (
              <Button onClick={finishStrength} className="text-xs px-3 py-1 bg-emerald-600 hover:opacity-90"><Check size={14} className="inline mr-1" /> Finalizar</Button>
            )}
          </div>
        </div>
      </div>

      <Card className="p-4 mt-1">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Dumbbell size={18} /> Entrenamiento de fuerza</h2>
          {!hasActive ? (
            <Button onClick={startSession} className="text-sm"><Play size={16} className="inline mr-1" /> Iniciar</Button>
          ) : (
            <Button onClick={finishStrength} className="text-sm bg-emerald-600 hover:opacity-90"><Check size={16} className="inline mr-1" /> Finalizar</Button>
          )}
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
            {routine.exercises.map((ex, idx) => {
              const st = perExerciseState[ex.id] || { sets: [] };
              return (
                <div key={ex.id} className={`rounded-2xl border ${st.completed ? "border-emerald-400" : "border-zinc-200 dark:border-zinc-800"} p-3`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{idx + 1}. {ex.name}</div>
                      <div className="text-xs text-zinc-500">Objetivo: {ex.targetSets}×{ex.mode === "reps" ? (ex.targetRepsRange || ex.targetReps) : (ex.targetRepsRange || `${ex.targetTimeSec}s`)} · Tempo: {tempoSugerido(ex.category, ex.mode)} {ex.notes ? `· ${ex.notes}` : ""}</div>
                    </div>
                    <IconButton onClick={() => handleStartRest(ex)} title="Descanso"><Clock size={16} /></IconButton>
                  </div>

                  {/* Filas por serie con checkbox */}
                  <div className="mt-3 space-y-2">
                    {st.sets.map((row, i) => (
                      <div key={i} className="grid grid-cols-12 items-end gap-2">
                        <div className="col-span-1 flex items-center justify-center">
                          <input type="checkbox" checked={!!row.checked} onChange={(e) => setPerExerciseState((p) => ({ ...p, [ex.id]: { ...p[ex.id], sets: p[ex.id].sets.map((s, j) => j === i ? { ...s, checked: e.target.checked } : s) } }))} />
                        </div>
                        <div className="col-span-3">
                          <Label>{ex.mode === "reps" ? "Reps" : "Seg"}</Label>
                          <Input type="number" inputMode="numeric" value={row.reps} onChange={(e) => setPerExerciseState((p) => ({ ...p, [ex.id]: { ...p[ex.id], sets: p[ex.id].sets.map((s, j) => j === i ? { ...s, reps: e.target.value } : s) } }))} />
                        </div>
                        <div className="col-span-3">
                          <Label>Peso ({unit})</Label>
                          <Input type="number" inputMode="decimal" value={row.weight} onChange={(e) => setPerExerciseState((p) => ({ ...p, [ex.id]: { ...p[ex.id], sets: p[ex.id].sets.map((s, j) => j === i ? { ...s, weight: e.target.value } : s) } }))} />
                        </div>
                        <div className="col-span-5">
                          <Label>RPE (rápido)</Label>
                          <select value={row.rpe} onChange={(e) => setPerExerciseState((p) => ({ ...p, [ex.id]: { ...p[ex.id], sets: p[ex.id].sets.map((s, j) => j === i ? { ...s, rpe: parseFloat(e.target.value) } : s) } }))} className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                            <option value={7}>3+ reps más (RPE 7)</option>
                            <option value={8}>2 reps más (RPE 8)</option>
                            <option value={9}>1 rep más (RPE 9)</option>
                            <option value={10}>Fallo / 0 reps (RPE 10)</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Drop set (si aplica) */}
                  {st.drop && (
                    <div className="mt-2 grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-12 text-xs text-zinc-500">Drop set (última serie):</div>
                      <div className="col-span-3">
                        <Label>{ex.mode === "reps" ? "Reps" : "Seg"}</Label>
                        <Input type="number" value={st.drop.reps} onChange={(e) => setPerExerciseState((p) => ({ ...p, [ex.id]: { ...p[ex.id], drop: { ...p[ex.id].drop, reps: e.target.value } } }))} />
                      </div>
                      <div className="col-span-3">
                        <Label>Peso ({unit})</Label>
                        <Input type="number" value={st.drop.weight} onChange={(e) => setPerExerciseState((p) => ({ ...p, [ex.id]: { ...p[ex.id], drop: { ...p[ex.id].drop, weight: e.target.value } } }))} />
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-xs text-zinc-500">Marca las series hechas y ajusta reps/peso si cambia</div>
                    <Button onClick={() => registerExercise(ex)} className="text-sm">Registrar ejercicio</Button>
                  </div>
                </div>
              );
            })}

            <p className="text-[11px] text-zinc-500">Consejo: marca series y usa el relojito para descanso 30/60/90s 😉</p>
          </div>
        )}
      </Card>

      {/* Cardio */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Flame size={18} /> Cardio (trote)</h2>
        </div>
        <CardioForm data={data} />
      </Card>

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

function CardioForm({ data }) {
  const [cardio, setCardio] = useState({ date: todayISO(), distanceKm: "", durationMin: "", kcal: "", notes: "", modality: "trote" });
  const saveCardio = () => {
    const distance = parseFloat(cardio.distanceKm || 0);
    const durMin = parseFloat(cardio.durationMin || 0);
    const durSec = Math.round(durMin * 60);
    const pace = paceFrom(durSec, distance);
    const kcal = cardio.kcal ? Math.round(parseFloat(cardio.kcal)) : undefined;
    if (!distance || !durSec) return alert("Completa distancia y duración");
    const entry = { id: uid(), type: "cardio", dateISO: toISODate(new Date(cardio.date)), modality: cardio.modality, distanceKm: distance, durationSec: durSec, avgPace: pace, kcal, notes: cardio.notes || "" };
    data.sessions.unshift(entry);
    const copy = { ...data, sessions: [...data.sessions] };
    localStorage.setItem(LS_KEY, JSON.stringify(copy));
    alert("Cardio guardado ✔");
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <Label>Fecha</Label>
        <Input type="date" value={cardio.date} onChange={(e) => setCardio((c) => ({ ...c, date: e.target.value }))} />
      </div>
      <div>
        <Label>Distancia (km)</Label>
        <Input type="number" inputMode="decimal" value={cardio.distanceKm} onChange={(e) => setCardio((c) => ({ ...c, distanceKm: e.target.value }))} />
      </div>
      <div>
        <Label>Duración (min)</Label>
        <Input type="number" inputMode="decimal" value={cardio.durationMin} onChange={(e) => setCardio((c) => ({ ...c, durationMin: e.target.value }))} />
      </div>
      <div>
        <Label>Kcal (opcional)</Label>
        <Input type="number" inputMode="decimal" value={cardio.kcal} onChange={(e) => setCardio((c) => ({ ...c, kcal: e.target.value }))} />
      </div>
      <div className="col-span-2">
        <Label>Notas</Label>
        <Input type="text" value={cardio.notes} onChange={(e) => setCardio((c) => ({ ...c, notes: e.target.value }))} placeholder="RPE, HR, terreno…" />
      </div>
      <div className="col-span-2 flex items-center justify-end">
        <Button onClick={saveCardio} className="text-sm">Guardar</Button>
      </div>
    </div>
  );
}

function RoutinesTab({ routines, addRoutine, deleteRoutine, renameRoutine, addExercise, editExercise, deleteExercise }) {
  const [openId, setOpenId] = useState(routines[0]?.id || "");
  useEffect(() => { if (!openId && routines[0]) setOpenId(routines[0].id); }, [routines, openId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tus rutinas</h2>
        <Button onClick={addRoutine} className="text-sm"><Plus size={16} className="inline mr-1" /> Nueva</Button>
      </div>
      {routines.length === 0 && (<Card className="p-4 text-sm text-zinc-500">Aún no tienes rutinas. Crea una para empezar.</Card>)}
      {routines.map((r) => (
        <Card key={r.id} className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-zinc-500">{r.exercises.length} ejercicios</div>
            </div>
            <div className="flex items-center gap-2">
              <IconButton onClick={() => renameRoutine(r.id)} title="Renombrar"><Edit3 size={16} /></IconButton>
              <IconButton onClick={() => deleteRoutine(r.id)} title="Eliminar"><Trash2 size={16} /></IconButton>
              <IconButton onClick={() => setOpenId((id) => (id === r.id ? "" : r.id))} title="Ver">{openId === r.id ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}</IconButton>
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
                  <div key={ex.id} className="flex items-center justify-between p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                    <div>
                      <div className="font-medium">{i + 1}. {ex.name}</div>
                      <div className="text-xs text-zinc-500">{ex.mode === "reps" ? `${ex.targetSets}×${ex.targetRepsRange || ex.targetReps}` : `${ex.targetSets}×${ex.targetRepsRange || `${ex.targetTimeSec}s`}`} · Sug: {ex.suggestedWeightKg} kg {ex.restSec ? `· ${ex.restSec}s` : ""} {ex.notes ? `· ${ex.notes}` : ""}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <IconButton onClick={() => editExercise(r.id, ex.id)} title="Editar"><Edit3 size={16} /></IconButton>
                      <IconButton onClick={() => deleteExercise(r.id, ex.id)} title="Eliminar"><Trash2 size={16} /></IconButton>
                    </div>
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

function HistoryTab({ sessions, routines, perExerciseHistory, weeklyVolume, unit, deleteSession }) {
  const [exId, setExId] = useState("");
  const allExercises = routines.flatMap((r) => r.exercises);
  useEffect(() => { if (!exId && allExercises[0]) setExId(allExercises[0].id); }, [allExercises, exId]);
  const chartData = perExerciseHistory.get(exId) || [];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Volumen semanal</h2>
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyVolume || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" hide />
              <Tooltip formatter={(v) => `${Math.round(v)} kg·rep`} labelFormatter={(l) => `Semana ${l}`} />
              <Bar dataKey="volume" />
            </BarChart>
          </ResponsiveContainer>
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
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-2">Sesiones</h2>
        <div className="space-y-2">
          {sessions.length === 0 && <div className="text-sm text-zinc-500">Aún no tienes sesiones registradas.</div>}
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
              <div>
                <div className="font-medium">{new Date(s.dateISO).toLocaleDateString()} · {s.type === "strength" ? "Fuerza" : `${s.modality} ${s.distanceKm} km`}</div>
                <div className="text-xs text-zinc-500">{s.type === "strength" ? `Volumen: ${Math.round(s.totalVolume || 0)} kg·rep · ${fmtTime(s.durationSec || 0)}${s.kcal ? ` · ${s.kcal} kcal` : ""}` : `Duración: ${fmtTime(s.durationSec)} · Ritmo: ${paceToStr(s.avgPace)}${s.kcal ? ` · ${s.kcal} kcal` : ""}`}</div>
              </div>
              <IconButton onClick={() => deleteSession(s.id)} title="Eliminar"><Trash2 size={16} /></IconButton>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function SettingsTab({ data, setData }) {
  const [fileErr, setFileErr] = useState("");
  const [calc, setCalc] = useState({ weight: "", reps: "", percent: "85" });

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
    } catch {}

    // Fallback 1: copy to clipboard
    try {
      navigator.clipboard?.writeText(json);
      alert("No se pudo descargar archivo. Copié el JSON al portapapeles.");
      return;
    } catch {}

    // Fallback 2: open in new tab for manual save
    try {
      const w = window.open();
      if (w) {
        w.document.write(`<pre style="white-space:pre-wrap;word-break:break-word;">${escapeHtml(json)}</pre>`);
        w.document.close();
        return;
      }
    } catch {}

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
      } catch (err) {
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
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-2">Calculadora 1RM</h2>
        <div className="grid grid-cols-3 gap-2 items-end">
          <div>
            <Label>Peso (kg)</Label>
            <Input type="number" value={calc.weight} onChange={(e) => setCalc((c) => ({ ...c, weight: e.target.value }))} />
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
    </div>
  );
}

// ---------- Utils ----------
function paceToStr(paceSecPerKm) {
  if (!paceSecPerKm || !isFinite(paceSecPerKm)) return "-";
  const m = Math.floor(paceSecPerKm / 60);
  const s = Math.round(paceSecPerKm % 60).toString().padStart(2, "0");
  return `${m}:${s}/km`;
}
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

// ---------- Dev self-tests (console) ----------
(function runDevTests(){
  try {
    console.assert(epley1RM(100, 1) === 100 + Math.round(100 * (1/30)), "epley1RM trivial");
    console.assert(rpeToRir(10) === 0 && rpeToRir(9) === 1 && rpeToRir(8) === 2, "rpe→rir mapping");
    console.assert(paceToStr(300) === "5:00/km", "pace format");
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
