import React, { useMemo, useState } from 'react';
import { Card, Button } from '../../ui.jsx';

const STEPS = ['Objetivo', 'Experiencia', 'Días/semana', 'Equipamiento', 'Limitaciones'];

export default function OnboardingWizard({ onFinish }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({
    objective: 'hipertrofia',
    experience: 'principiante',
    daysPerWeek: 3,
    equipment: ['todos'],
    limitations: '',
  });

  const canContinue = useMemo(() => {
    if (step === 3) return answers.equipment.length > 0;
    return true;
  }, [step, answers.equipment.length]);

  const toggleEquipment = (value) => {
    setAnswers((prev) => {
      const set = new Set(prev.equipment);
      if (set.has(value)) {
        set.delete(value);
      } else {
        set.add(value);
      }
      if (set.size === 0) set.add('todos');
      if (value === 'todos' && set.has('todos')) return { ...prev, equipment: ['todos'] };
      if (set.has('todos') && value !== 'todos') set.delete('todos');
      return { ...prev, equipment: Array.from(set) };
    });
  };

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Configura tu plan inicial</h2>
        <p className="text-xs text-zinc-500">Paso {step + 1} de {STEPS.length}: {STEPS[step]}</p>
      </div>

      {step === 0 && (
        <select
          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
          value={answers.objective}
          onChange={(e) => setAnswers((prev) => ({ ...prev, objective: e.target.value }))}
        >
          <option value="fuerza">Ganar fuerza</option>
          <option value="hipertrofia">Hipertrofia</option>
          <option value="recomposicion">Recomposición</option>
        </select>
      )}

      {step === 1 && (
        <select
          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
          value={answers.experience}
          onChange={(e) => setAnswers((prev) => ({ ...prev, experience: e.target.value }))}
        >
          <option value="principiante">Principiante</option>
          <option value="intermedio">Intermedio</option>
          <option value="avanzado">Avanzado</option>
        </select>
      )}

      {step === 2 && (
        <input
          type="number"
          min={2}
          max={6}
          value={answers.daysPerWeek}
          onChange={(e) => setAnswers((prev) => ({ ...prev, daysPerWeek: Number(e.target.value) || 3 }))}
          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
        />
      )}

      {step === 3 && (
        <div className="grid grid-cols-2 gap-2 text-sm">
          {['todos', 'barra', 'mancuerna', 'maquina', 'polea'].map((equip) => (
            <button
              key={equip}
              type="button"
              onClick={() => toggleEquipment(equip)}
              className={`px-3 py-2 rounded-xl border ${answers.equipment.includes(equip) ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'border-zinc-200 dark:border-zinc-800'}`}
            >
              {equip}
            </button>
          ))}
        </div>
      )}

      {step === 4 && (
        <textarea
          value={answers.limitations}
          onChange={(e) => setAnswers((prev) => ({ ...prev, limitations: e.target.value }))}
          rows={3}
          placeholder="Ejemplo: molestia de hombro derecho"
          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
        />
      )}

      <div className="flex justify-between gap-2">
        <Button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Atrás</Button>
        {step < STEPS.length - 1 ? (
          <Button className="bg-emerald-600" onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>Siguiente</Button>
        ) : (
          <Button className="bg-emerald-600" onClick={() => onFinish(answers)}>Crear plan</Button>
        )}
      </div>
    </Card>
  );
}
