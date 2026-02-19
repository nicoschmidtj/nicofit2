import { useRef, useState } from "react";
import { toISODate } from "../lib/metrics.ts";
import { buildFinishedSession } from "../features/workout/mainFlow.js";

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export function useActiveSession({ setData }) {
  const [activeSession, setActiveSession] = useState(null);
  const [prFlash, setPrFlash] = useState("");
  const lastActionRef = useRef({ exId: null, added: 0, prevCompleted: false, undo: null });

  const startStrength = (routineKey) => {
    if (!routineKey) return;
    setActiveSession({ id: uid(), type: "strength", dateISO: toISODate(), routineKey, sets: [], startedAt: Date.now() });
  };

  const finishStrength = () => {
    if (!activeSession) return;
    const autoDur = Math.max(1, Math.floor((Date.now() - activeSession.startedAt) / 1000));
    let inputDur = prompt("Tiempo total de la rutina (minutos). Deja vacío para usar automático", String(Math.round(autoDur / 60)));
    let durationSec = autoDur;
    if (inputDur && !Number.isNaN(parseFloat(inputDur))) durationSec = Math.max(60, Math.round(parseFloat(inputDur) * 60));
    let kcalStr = prompt("Kcal quemadas (opcional)", "");
    const kcal = kcalStr && !Number.isNaN(parseFloat(kcalStr)) ? Math.round(parseFloat(kcalStr)) : undefined;
    const finishedSession = buildFinishedSession(activeSession, durationSec, kcal);
    setData((d) => ({ ...d, sessions: [finishedSession, ...d.sessions] }));
    setActiveSession(null);
  };

  const undoLast = () => {
    setActiveSession((s) => (s ? ({ ...s, sets: s.sets.slice(0, -(lastActionRef.current?.added || 0)) }) : s));
    lastActionRef.current.undo?.();
    lastActionRef.current = { exId: null, added: 0, prevCompleted: false, undo: null };
    setPrFlash("");
  };

  return {
    activeSession,
    setActiveSession,
    startStrength,
    finishStrength,
    lastActionRef,
    prFlash,
    setPrFlash,
    undoLast,
  };
}
