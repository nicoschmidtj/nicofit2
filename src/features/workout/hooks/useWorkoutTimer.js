import { useCallback, useEffect, useRef, useState } from 'react';

export function useWorkoutTimer({ soundEnabled, vibrationEnabled, onDone }) {
  const [restSec, setRestSec] = useState(0);
  const restDeadlineRef = useRef(null);
  const rafRef = useRef(null);

  const stopRest = useCallback(() => {
    restDeadlineRef.current = null;
    setRestSec(0);
    cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const loop = useCallback(() => {
    if (!restDeadlineRef.current) {
      rafRef.current = null;
      return;
    }
    const msLeft = restDeadlineRef.current - performance.now();
    const secLeft = Math.max(0, Math.ceil(msLeft / 1000));
    setRestSec(secLeft);
    if (secLeft === 0) {
      onDone?.({ soundEnabled, vibrationEnabled });
      restDeadlineRef.current = null;
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [onDone, soundEnabled, vibrationEnabled]);

  const startRest = useCallback((seconds) => {
    const s = Math.max(0, Number(seconds || 0));
    if (s <= 0) {
      stopRest();
      return;
    }
    restDeadlineRef.current = performance.now() + s * 1000;
    if (!rafRef.current) rafRef.current = requestAnimationFrame(loop);
  }, [loop, stopRest]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return { restSec, startRest, stopRest };
}
