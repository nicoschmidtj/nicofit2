import React, { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { Dumbbell, Timer as TimerIcon, History, Settings as SettingsIcon, Play, Square, Plus, Trash2, Edit3, ChevronRight, ChevronLeft, BarChart3, Flame, Repeat2, Check, Award, Clock } from "lucide-react";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { getTemplateRoutineName, suggestAlternativesByExerciseId, loadRepo, findAlternatives } from "./lib/repoAdapter.js";
import { resolveExercise } from "./lib/exerciseResolver.js";
import { buildDefaultUserRoutinesIndex } from "./lib/defaultUserRoutines.js";
import { roundToNearest, getInitialWeightForExercise, getLastUsedSetForExercise } from "./lib/utils.js";
import { Card, Button, IconButton, Input, Label } from "./ui.jsx";
import { buildPerExerciseHistory } from "./lib/analytics.js";
import { appStorage } from "./lib/storage/index.js";
import { fmtTime, epley1RM, kgOrLb } from "./lib/metrics.ts";
import WorkoutTabContainer from "./features/workout/WorkoutTabContainer.jsx";
import RoutinesTabContainer from "./features/routines/RoutinesTabContainer.jsx";
import { calcNext, validateSetRegistration } from "./features/workout/services/workoutService.js";
import { useWorkoutTimer } from "./features/workout/hooks/useWorkoutTimer.js";
import { useActiveSession } from "./features/workout/hooks/useActiveSession.js";

const repo = loadRepo();
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
const toISODate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
const todayISO = () => toISODate().slice(0, 10);
const fromDisplayToKg = (val, unit) => (unit === "lb" ? Math.round((val / 2.20462) * 10) / 10 : val);
const rpeToRir = (rpe) => {
  const x = Math.round(parseFloat(rpe || 0));
  if (x >= 10) return 0;
  if (x >= 9) return 1;
  if (x >= 8) return 2;
  return 3;
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

// ---------- Tabs ----------
const TABS = [
  { id: "today", label: "Hoy", icon: <Dumbbell size={18} /> },
  { id: "routines", label: "Rutinas", icon: <Repeat2 size={18} /> },
  { id: "history", label: "Historial", icon: <History size={18} /> },
  { id: "settings", label: "Ajustes", icon: <SettingsIcon size={18} /> },
];

const HistoryTab = React.lazy(() => import("./features/history/HistoryTabContainer.jsx"));
const SettingsTab = React.lazy(() => import("./features/settings/SettingsTabContainer.jsx"));

// ---------- Main App ----------
export default function App() {
  const storageSnapshotRef = useRef({ state: DEFAULT_DATA, metadata: {} });
  const [data, setData] = useState(() => {
    const loaded = appStorage.loadState();
    const initial = loaded.state || DEFAULT_DATA;
    const merged = { ...DEFAULT_DATA, ...initial };
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
    storageSnapshotRef.current = { state: merged, metadata: loaded.metadata || {} };
    return merged;
  });
  const [syncStatus, setSyncStatus] = useState({ phase: "idle", lastSyncedAt: null, error: null });
  const [tab, setTab] = useState("today");
  const [prFlash, setPrFlash] = useState("");
  const [confirmFlash, setConfirmFlash] = useState(null); // { message, onConfirm }
  const [dateStr] = useState(() => new Date().toLocaleDateString());
  const lastActionRef = useRef({ exId: null, added: 0, prevCompleted: false });
  const beep = useBeep();

  useEffect(() => appStorage.subscribeSyncStatus(setSyncStatus), []);
  useEffect(() => {
    const prev = storageSnapshotRef.current;
    appStorage.saveState({
      state: data,
      previousState: prev.state,
      metadata: prev.metadata,
    }).then((nextSnapshot) => {
      storageSnapshotRef.current = nextSnapshot;
      if (JSON.stringify(nextSnapshot.state) !== JSON.stringify(data)) {
        setData(nextSnapshot.state);
      }
    });
  }, [data]);
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

  const { activeSession, setActiveSession, startStrength, finishStrength } = useActiveSession({
    onFinish: (session) => setData((d) => ({ ...d, sessions: [session, ...d.sessions] })),
  });

  const { restSec, startRest, stopRest } = useWorkoutTimer({
    soundEnabled: data.settings.sound,
    vibrationEnabled: data.settings.vibration,
    onDone: ({ soundEnabled, vibrationEnabled }) => {
      if (soundEnabled) beep();
      if (vibrationEnabled && navigator.vibrate) navigator.vibrate(80);
      try {
        if (typeof Notification !== 'undefined' && Notification.permission !== 'denied') {
          const ensure = async () => {
            if (Notification.permission === 'default') await Notification.requestPermission();
            if (Notification.permission === 'granted') {
              navigator.serviceWorker?.ready.then((reg) => {
                reg.showNotification('¡A la barra!', {
                  body: 'Descanso terminado',
                  icon: '/pwa-192x192.png',
                  badge: '/pwa-192x192.png',
                  tag: 'rest-timer',
                });
              });
            }
          };
          ensure();
        }
      } catch {
        // noop
      }
    },
  });

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
  const exercisesById = useMemo(() => {
    const out = { ...(repo?.byId || {}) };
    for (const r of routines) {
      for (const ex of r.exercises) out[ex.id] = { ...(out[ex.id] || {}), ...ex };
    }
    return out;
  }, [routines]);

  const perExerciseHistory = useMemo(() => buildPerExerciseHistory(sessions, exercisesById), [sessions, exercisesById]);

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

        <div className="mb-3 text-xs">
          {syncStatus.phase === "syncing" && <span className="text-amber-600">Sincronizando…</span>}
          {syncStatus.phase === "conflict" && <span className="text-orange-600">Conflicto resuelto automáticamente</span>}
          {syncStatus.phase === "error" && <span className="text-rose-600">Error de sync: {syncStatus.error}</span>}
          {syncStatus.phase === "idle" && syncStatus.lastSyncedAt && (
            <span className="text-zinc-500">Última sync: {new Date(syncStatus.lastSyncedAt).toLocaleString()}</span>
          )}
        </div>

        {tab === "today" && (
          <WorkoutTabContainer
            TodayTabComponent={TodayTab}
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
          />
        )}

        {tab === "routines" && (
          <RoutinesTabContainer
            RoutinesTabComponent={RoutinesTab}
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
          <Suspense fallback={<div className="p-4 text-sm">Cargando…</div>}>
            <HistoryTab sessions={sessions} routines={routines} perExerciseHistory={perExerciseHistory} weeklyVolume={weeklyVolume} unit={unit} deleteSession={deleteSession} setTab={setTab} exercisesById={exercisesById} />
          </Suspense>
        )}

        {tab === "settings" && (
          <Suspense fallback={<div className="p-4 text-sm">Cargando…</div>}>
            <SettingsTab data={data} setData={setData} syncStatus={syncStatus} />
          </Suspense>
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
    <nav
      className="fixed bottom-0 left-0 right-0 border-t border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur"
      role="tablist"
    >
      <div className="max-w-md mx-auto grid grid-cols-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-col items-center gap-1 py-3 ${tab === t.id ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500"}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-label={t.label}
          >
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

function TodayTab({ data, setData, routines, activeSession, setActiveSession, startStrength, finishStrength, flashPR, restSec, startRest, unit, setTab, weeklyVolume, lastActionRef, setPrFlash }) {
  const [selectedRoutineKey, setSelectedRoutineKey] = useState(routines[0]?.id || "");
  useEffect(() => { if (!selectedRoutineKey && routines[0]) setSelectedRoutineKey(routines[0].id); }, [routines, selectedRoutineKey]);
  const routineKey = activeSession?.routineKey || selectedRoutineKey;
  const routine = routines.find((r) => r.id === routineKey);
  const { customExercisesById, profileByExerciseId, sessions } = data;

  const [perExerciseState, setPerExerciseState] = useState({});
  const [sessionOverridesBySlot, setSessionOverridesBySlot] = useState({});
  const [openTimerMenu, setOpenTimerMenu] = useState(false);
  const [quickAdd, setQuickAdd] = useState({ name: "", sets: "1", reps: "", weight: "" });

  const exIds = useMemo(() => data.userRoutinesIndex?.[routineKey] || [], [data.userRoutinesIndex, routineKey]);

  useEffect(() => {
    setPerExerciseState({});
    setSessionOverridesBySlot({});
  }, [routineKey, activeSession?.id]);

  useEffect(() => {
    exIds.forEach((origId, idx) => {
      const slotKey = `${routineKey}:${idx}`;
      const effectiveId = sessionOverridesBySlot[slotKey] || origId;
      const resolved = resolveExercise(effectiveId, customExercisesById);
      if (!resolved) return;
      setPerExerciseState(prev => {
        if (prev[slotKey]) return prev;
        const baseWKg = getInitialWeightForExercise(effectiveId, routineKey, { profileByExerciseId, sessions });
        const baseW = unit === 'lb' ? Math.round(baseWKg * 2.20462 * 4) / 4 : baseWKg;
        const targetSets = resolved?.fixed?.targetSets || 3;
        const repOrSec = resolved?.mode === 'reps' ? (resolved?.fixed?.targetReps || 10) : (resolved?.fixed?.targetTimeSec || 45);
        return {
          ...prev,
          [slotKey]: {
            sets: Array.from({ length: targetSets }).map(() => ({ checked: false, reps: repOrSec, weight: baseW, rpe: 8 })),
            registeredMask: Array.from({ length: targetSets }).map(() => false),
            drop: null,
            dropRegistered: false,
            completed: false,
            effectiveExId: effectiveId,
          }
        };
      });
    });
  }, [exIds, sessionOverridesBySlot, routineKey, unit, activeSession?.id, customExercisesById, profileByExerciseId, sessions]);

  const hasActive = !!activeSession;
  const startSession = () => startStrength(selectedRoutineKey);

  
  const quickRest = (sec) => startRest(sec);
  const customRest = () => {
    const pick = prompt("Segundos de descanso", String(restSec || data.settings.defaultRestSec));
    if (!pick) return;
    const val = parseInt(pick, 10);
    if (!Number.isNaN(val)) startRest(val);
  };

  const viewAlternative = (slotKey, currentExId) => {
    const candidates = suggestAlternativesByExerciseId(currentExId);
    if (candidates.length === 0) return alert('Sin alternativas disponibles');
    const list = candidates.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
    const pick = prompt(`Alternativas:\n${list}\nNúmero?`);
    const pickIdx = parseInt(pick || '', 10) - 1;
    const alt = candidates[pickIdx];
    if (!alt) return;
    setSessionOverridesBySlot(p => ({ ...p, [slotKey]: alt.id }));
    setPerExerciseState(prev => { const n = { ...prev }; delete n[slotKey]; return n; });
    if (!data.profileByExerciseId?.[alt.id]?.last) {
      const last = getLastUsedSetForExercise(alt.id, data.sessions);
      if (last) {
        setData(d => ({
          ...d,
          profileByExerciseId: { ...(d.profileByExerciseId || {}), [alt.id]: { ...(d.profileByExerciseId?.[alt.id] || {}), last } }
        }));
      }
    }
    lastActionRef.current = { exId: null, added: 0, prevCompleted: false, undo: null };
    setPrFlash('Ejercicio reemplazado');
    setTimeout(() => setPrFlash(''), 1000);
  };

  const registerExercise = (slotKey, idx) => {
    const st = perExerciseState[slotKey];
    const validationError = validateSetRegistration({ state: st, activeSession });
    if (validationError) return alert(validationError);
    const exIdUsed = st?.effectiveExId || (sessionOverridesBySlot[slotKey] || exIds[idx]);
    const ex = resolveExercise(exIdUsed, data.customExercisesById);
    const setsToPersist = [];
    const newMask = [...(st?.registeredMask || [])];
    st.sets.forEach((s, i) => {
      if (s.checked && !newMask[i]) {
        const repsOrSec = parseInt(s.reps || 0, 10);
        const wDisp = roundToNearest(parseFloat(s.weight || 0), 0.25);
        const wkg = fromDisplayToKg(wDisp, unit);
        const rpe = parseFloat(s.rpe || 8);
        const rir = rpeToRir(rpe);
        setsToPersist.push({ id: uid(), exerciseId: exIdUsed, mode: ex.mode, reps: repsOrSec, weightKg: wkg, rpe, rir, tempo: tempoSugerido(ex.category, ex.mode), at: Date.now() });
        newMask[i] = true;
      }
    });
    let dropRegistered = st.dropRegistered || false;
    if (st.drop && st.sets.filter(x => x.checked).length === st.sets.length && !dropRegistered) {
      const repsOrSec = parseInt(st.drop.reps || 0, 10);
      const wDisp = roundToNearest(parseFloat(st.drop.weight || 0), 0.25);
      const wkg = fromDisplayToKg(wDisp, unit);
      setsToPersist.push({ id: uid(), exerciseId: exIdUsed, mode: ex.mode, reps: repsOrSec, weightKg: wkg, rpe: 10, rir: 0, tempo: tempoSugerido(ex.category, ex.mode), at: Date.now(), drop: true });
      dropRegistered = true;
    }
    if (!st.drop && ex.dropCfg && st.sets.filter(x => x.checked).length === st.sets.length && !dropRegistered) {
      const lastChecked = [...st.sets].reverse().find(s => s.checked);
      const lastWDisp = roundToNearest(parseFloat(lastChecked?.weight || 0), 0.25);
      const lastW = fromDisplayToKg(lastWDisp, unit);
      const percent = Math.max(1, Math.min(100, ex.dropCfg.percent || 80));
      const repsOffset = Number(ex.dropCfg.repsOffset ?? 0);
      const baseReps = ex.mode === 'reps' ? parseInt(lastChecked?.reps || ex.targetReps || 10, 10) : (ex.targetTimeSec || 30);
      const reps = Math.max(1, baseReps + (isNaN(repsOffset) ? 0 : repsOffset));
      const wkg = Math.max(0, Math.round((lastW * percent / 100) * 10) / 10);
      setsToPersist.push({ id: uid(), exerciseId: exIdUsed, mode: ex.mode, reps, weightKg: wkg, rpe: 10, rir: 0, tempo: tempoSugerido(ex.category, ex.mode), at: Date.now(), drop: true });
      dropRegistered = true;
    }
    if (setsToPersist.length === 0) { alert('Marca al menos una serie nueva'); return; }

    const bestE1 = bestE1RMForExercise(activeSession, data.sessions, exIdUsed);
    let raised = false;
    for (const n of setsToPersist) {
      if (n.mode !== 'time') {
        const e1 = epley1RM(n.weightKg, n.reps);
        if (e1 > bestE1) { raised = true; break; }
      }
    }

    setActiveSession(s => ({ ...s, sets: [...(s?.sets || []), ...setsToPersist] }));
    const lastValid = [...setsToPersist].reverse().find(s => !s.drop);
    if (lastValid) {
      const prevProf = data.profileByExerciseId?.[exIdUsed] || {};
      const last = { weightKg: lastValid.weightKg, reps: lastValid.reps, rir: lastValid.rir, dateISO: todayISO(), setup: prevProf.last?.setup };
      const next = calcNext({ last, ex, profile: prevProf });
      setData(d => ({ ...d, profileByExerciseId: { ...d.profileByExerciseId, [exIdUsed]: { ...prevProf, last, next } } }));
    }
    const prevMask = st.registeredMask;
    const prevDrop = st.dropRegistered;
    lastActionRef.current = {
      exId: slotKey,
      added: setsToPersist.length,
      prevCompleted: st.completed,
      undo: () => setPerExerciseState(p => ({ ...p, [slotKey]: { ...p[slotKey], registeredMask: prevMask, dropRegistered: prevDrop, completed: st.completed } }))
    };
    setPerExerciseState(p => ({ ...p, [slotKey]: { ...p[slotKey], registeredMask: newMask, dropRegistered, completed: true } }));
    setPrFlash('Ejercicio registrado');
    setTimeout(() => { setPrFlash(''); lastActionRef.current = { exId: null, added: 0, prevCompleted: false, undo: null }; }, 1000);

    if (raised) setTimeout(() => flashPR('PR 1RM estimada'), 1000);

    if (ex.groupId) {
      const mates = exIds
        .map((oid, j) => ({ ex: resolveExercise(sessionOverridesBySlot[`${routineKey}:${j}`] || oid, data.customExercisesById), idx: j }))
        .filter(o => o.ex && o.ex.groupId === ex.groupId && o.idx !== idx);
      setTimeout(() => {
        setPrFlash(`Superserie: ahora ${mates[0]?.ex.name || 'siguiente del grupo'}`);
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
                <select value={selectedRoutineKey} onChange={(e) => setSelectedRoutineKey(e.target.value)} className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
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
            {exIds.map((origId, idx) => {
              const slotKey = `${routineKey}:${idx}`;
              const effectiveId = sessionOverridesBySlot[slotKey] || origId;
              const ex = resolveExercise(effectiveId, data.customExercisesById);
              const st = perExerciseState[slotKey] || { sets: [] };
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
                <div key={`${slotKey}:${effectiveId}`} className={`rounded-2xl border ${st.completed ? "border-emerald-400" : "border-zinc-200 dark:border-zinc-800"} p-3`}>
                  <div className="mb-1">
                    <div className="text-base font-semibold leading-tight">{idx + 1}. {ex.name}</div>
                    <div className="text-xs text-zinc-500">
                      {(ex.fixed?.targetSets || ex.targetSets)}×{ex.mode === "reps" ? (ex.fixed?.targetRepsRange || ex.targetRepsRange) : (ex.fixed?.targetRepsRange || `${ex.fixed?.targetTimeSec || ex.targetTimeSec}s`)}
                      {suggestion ? ` · Sugerencia ${suggestion}` : ""}
                      {ex.restSec ? ` · ${ex.restSec}s` : ""}
                      {` · Tempo: ${tempoSugerido(ex.category, ex.mode)}`}
                      {setupText}
                      {ex.notes ? ` · ${ex.notes}` : ""}
                    </div>
                    </div>

                  {/* Filas por serie con checkbox */}
                  <div className="mt-3 space-y-2">
                    {st.sets.map((row, i) => (
                      <div key={i} className="grid grid-cols-12 items-end gap-2">
                        <div className="col-span-1 flex items-center justify-center">
                          <input type="checkbox" checked={!!row.checked}
                            onChange={(e)=> setPerExerciseState(p=>({...p,[slotKey]:{...p[slotKey],sets:p[slotKey].sets.map((s,j)=> j===i?{...s,checked:e.target.checked}:s)}}))}
                          />
                        </div>

                        <div className="col-span-3">
                          <Label>{ex.mode === "reps" ? "Reps" : "Seg"}</Label>
                          <Input type="number" inputMode="numeric" value={row.reps} className="text-base"
                            onChange={(e)=> setPerExerciseState(p=>({...p,[slotKey]:{...p[slotKey],sets:p[slotKey].sets.map((s,j)=> j===i?{...s,reps:e.target.value}:s)}}))}
                          />
                        </div>

                        <div className="col-span-3">
                          <Label>Peso ({unit})</Label>
                          <Input type="number" step="0.25" inputMode="decimal" value={row.weight} className="text-base"
                            onChange={(e)=> setPerExerciseState(p=>({...p,[slotKey]:{...p[slotKey],sets:p[slotKey].sets.map((s,j)=> j===i?{...s,weight:e.target.value}:s)}}))}
                          />
                        </div>

                        <div className="col-span-5">
                          <Label>RPE</Label>
                          <select
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-base"
                            value={row.rpe}
                            onChange={(e)=> setPerExerciseState(p=>({...p,[slotKey]:{...p[slotKey],sets:p[slotKey].sets.map((s,j)=> j===i?{...s,rpe:parseFloat(e.target.value)}:s)}}))}
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

                  {/* Drop set (si aplica) */}
                  {st.drop && !st.dropRegistered && (
                    <div className="mt-2 grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-12 text-xs text-zinc-500">Drop set (última serie):</div>
                      <div className="col-span-3">
                        <Label>{ex.mode === "reps" ? "Reps" : "Seg"}</Label>
                          <Input type="number" value={st.drop.reps} onChange={(e) => setPerExerciseState((p) => ({ ...p, [slotKey]: { ...p[slotKey], drop: { ...p[slotKey].drop, reps: e.target.value } } }))} />
                      </div>
                      <div className="col-span-3">
                        <Label>Peso ({unit})</Label>
                          <Input type="number" step="0.25" inputMode="decimal" value={st.drop.weight} onChange={(e) => setPerExerciseState((p) => ({ ...p, [slotKey]: { ...p[slotKey], drop: { ...p[slotKey].drop, weight: e.target.value } } }))} />
                      </div>
                    </div>
                  )}

                  <div className="mt-3">
                    <div className="mb-2 text-xs text-zinc-500">Marca las series hechas y ajusta reps/peso si cambia</div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button className="w-full text-sm" onClick={() => viewAlternative(slotKey, effectiveId)}>Ver alternativa</Button>
                      <Button className="w-full text-sm" onClick={() => registerExercise(slotKey, idx)}>Registrar ejercicio</Button>
                    </div>
                  </div>
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
