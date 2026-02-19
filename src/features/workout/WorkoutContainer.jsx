import WorkoutView from "./WorkoutView.jsx";

export default function WorkoutContainer({ tab, renderToday, renderRoutines }) {
  return <WorkoutView tab={tab} today={renderToday()} routines={renderRoutines()} />;
}
