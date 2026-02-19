import { useState } from 'react';
import { createStrengthSession, finalizeStrengthSession } from '../services/workoutService.js';

export function useActiveSession({ onFinish }) {
  const [activeSession, setActiveSession] = useState(null);

  const startStrength = (routineKey) => {
    if (!routineKey) return;
    setActiveSession(createStrengthSession(routineKey));
  };

  const finishStrength = async () => {
    if (!activeSession) return;
    const autoDur = Math.max(1, Math.floor((Date.now() - activeSession.startedAt) / 1000));
    const inputDur = prompt('Tiempo total de la rutina (minutos). Deja vacío para usar automático', String(Math.round(autoDur / 60)));
    let durationSec = autoDur;
    if (inputDur && !Number.isNaN(parseFloat(inputDur))) durationSec = Math.max(60, Math.round(parseFloat(inputDur) * 60));
    const kcalStr = prompt('Kcal quemadas (opcional)', '');
    const kcal = kcalStr && !Number.isNaN(parseFloat(kcalStr)) ? Math.round(parseFloat(kcalStr)) : undefined;
    onFinish?.(finalizeStrengthSession({ session: activeSession, durationSec, kcal }));
    setActiveSession(null);
  };

  return { activeSession, setActiveSession, startStrength, finishStrength };
}
