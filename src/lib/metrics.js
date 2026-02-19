export const fmtTime = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
};

export const toISODate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
export const todayISO = () => toISODate().slice(0, 10);

export const e1RM = (w, reps) => (w > 0 && reps > 0 ? Math.round(w * (1 + reps / 30)) : 0);

export const toDisplayWeight = (val, unit) => (
  unit === "lb" ? Math.round(val * 2.20462 * 10) / 10 : Math.round(val)
);

export const fromDisplayToKg = (val, unit) => (
  unit === "lb" ? Math.round((val / 2.20462) * 10) / 10 : val
);
