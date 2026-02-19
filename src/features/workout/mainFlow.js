export function buildFinishedSession(activeSession, durationSec, kcal) {
  const totalVol = (activeSession.sets || []).reduce((acc, setItem) => acc + (setItem.mode === "time" ? 0 : setItem.weightKg * setItem.reps), 0);
  return { ...activeSession, durationSec, totalVolume: totalVol, kcal };
}
