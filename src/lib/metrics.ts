export const fmtTime = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
};

export const epley1RM = (w: number, reps: number): number =>
  w > 0 && reps > 0 ? Math.round(w * (1 + reps / 30)) : 0;

export const kgOrLb = (val: number, unit: "kg" | "lb"): number =>
  unit === "lb" ? Math.round(val * 2.20462 * 10) / 10 : Math.round(val);
