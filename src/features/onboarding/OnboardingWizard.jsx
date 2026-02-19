import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Button } from '../../ui.jsx';

const STEPS = [
  { id: 'goal', title: 'Objetivo principal', options: [
    { value: 'fitness_general', label: 'Fitness general' },
    { value: 'muscle_gain', label: 'Ganar músculo' },
    { value: 'fat_loss', label: 'Perder grasa' },
  ] },
  { id: 'experience', title: 'Experiencia', options: [
    { value: 'beginner', label: 'Principiante' },
    { value: 'intermediate', label: 'Intermedio' },
    { value: 'advanced', label: 'Avanzado' },
  ] },
  { id: 'daysPerWeek', title: 'Días por semana', options: [
    { value: '2', label: '2 días' },
    { value: '3', label: '3 días' },
    { value: '4', label: '4 días' },
    { value: '5', label: '5 días' },
  ] },
  { id: 'equipment', title: 'Equipamiento', options: [
    { value: 'bodyweight', label: 'Peso corporal' },
    { value: 'dumbbells', label: 'Mancuernas + banco' },
    { value: 'full_gym', label: 'Gimnasio completo' },
  ] },
  { id: 'limitations', title: 'Limitaciones', options: [
    { value: 'none', label: 'Sin limitaciones' },
    { value: 'knee_sensitive', label: 'Rodilla sensible' },
    { value: 'lower_back_sensitive', label: 'Espalda baja sensible' },
  ] },
];

const INITIAL_ANSWERS = {
  goal: 'fitness_general',
  experience: 'beginner',
  daysPerWeek: '3',
  equipment: 'full_gym',
  limitations: 'none',
};

export default function OnboardingWizard({ onComplete, onAbandon }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(INITIAL_ANSWERS);
  const completedRef = useRef(false);
  const latestRef = useRef({ step: 0, answers: INITIAL_ANSWERS });

  useEffect(() => {
    latestRef.current = { step, answers };
  }, [step, answers]);

  useEffect(() => () => {
    if (completedRef.current) return;
    const latest = latestRef.current;
    onAbandon?.({ step: STEPS[latest.step]?.id || 'unknown', answers: latest.answers });
  }, [onAbandon]);

  const current = STEPS[step];
  const progress = useMemo(() => `${step + 1}/${STEPS.length}`, [step]);

  const next = () => {
    if (step === STEPS.length - 1) {
      completedRef.current = true;
      onComplete?.(answers);
      return;
    }
    setStep((s) => s + 1);
  };

  return (
    <Card className="p-5 space-y-4">
      <div>
        <p className="text-xs text-zinc-500">Onboarding {progress}</p>
        <h2 className="text-lg font-semibold">{current.title}</h2>
      </div>
      <div className="space-y-2">
        {current.options.map((opt) => (
          <label key={opt.value} className="flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 cursor-pointer">
            <input type="radio" name={current.id} checked={answers[current.id] === opt.value} onChange={() => setAnswers((p) => ({ ...p, [current.id]: opt.value }))} />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
      <div className="flex justify-between">
        <Button className="text-sm" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>Atrás</Button>
        <Button className="text-sm" onClick={next}>{step === STEPS.length - 1 ? 'Finalizar' : 'Siguiente'}</Button>
      </div>
    </Card>
  );
}
