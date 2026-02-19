export default function WorkoutView({ tab, today, routines }) {
  if (tab === "today") return today;
  if (tab === "routines") return routines;
  return null;
}
