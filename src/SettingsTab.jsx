import React, { useState } from "react";
import { Download, Upload } from "lucide-react";
import { migrate } from "./lib/migrateState.js";
import { dataSchema } from "./lib/schema.ts";
import { Card, Button, Input, Label } from "./ui.jsx";

const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const epley1RM = (w, reps) => (w > 0 && reps > 0 ? Math.round(w * (1 + reps / 30)) : 0);

export default function SettingsTab({ data, setData, syncStatus }) {
  const [fileErr, setFileErr] = useState("");
  const [calc, setCalc] = useState({ weight: "", reps: "", percent: "85" });
  const [showPolicy, setShowPolicy] = useState(false);

  const onExport = () => {
    const json = JSON.stringify(data, null, 2);
    try {
      const blob = new Blob([json], { type: "application/json" });
      const URL_ = window.URL || URL;
      const url = URL_?.createObjectURL?.(blob);
      if (url) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `nicofit_backup_${todayISO()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL_?.revokeObjectURL?.(url);
        return;
      }
    } catch {}
    try {
      navigator.clipboard?.writeText(json);
      alert("No se pudo descargar archivo. Copié el JSON al portapapeles.");
      return;
    } catch {}
    try {
      const w = window.open();
      if (w) {
        w.document.write(`<pre style="white-space:pre-wrap;word-break:break-word;">${escapeHtml(json)}</pre>`);
        w.document.close();
        return;
      }
    } catch {}
    alert("Export no disponible en este entorno. Copia manual desde la consola.");
  };

  const sanitizeImported = (data) => {
    const keys = new Set(['name', 'notes', 'exerciseName', 'setup']);
    const walk = (val) => {
      if (Array.isArray(val)) val.forEach(walk);
      else if (val && typeof val === 'object') {
        Object.keys(val).forEach(k => {
          const v = val[k];
          if (typeof v === 'string' && keys.has(k)) val[k] = escapeHtml(v);
          else walk(v);
        });
      }
    };
    const clone = structuredClone(data);
    walk(clone);
    return clone;
  };

  const onImport = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        const parsed = dataSchema.safeParse(obj);
        if (!parsed.success) throw new Error('invalid');
        const { state } = migrate(parsed.data);
        const sanitized = sanitizeImported(state);
        setData(sanitized);
        setFileErr('');
        alert('Datos importados ✔');
      } catch (err) {
        console.warn(err);
        setFileErr('No se pudo importar (JSON inválido)');
      }
    };
    reader.readAsText(f);
  };

  const oneRm = (() => { const w = parseFloat(calc.weight || 0); const r = parseInt(calc.reps || 0, 10); return epley1RM(w, r); })();
  const targetLoad = (() => { const p = parseFloat(calc.percent || 0) / 100; return Math.round(oneRm * p); })();

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-2">Preferencias</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Unidades</Label>
            <select value={data.settings.unit} onChange={(e) => setData((d) => ({ ...d, settings: { ...d.settings, unit: e.target.value } }))} className="mt-1 w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </select>
          </div>
          <div>
            <Label>Descanso (seg)</Label>
            <Input type="number" value={data.settings.defaultRestSec} onChange={(e) => setData((d) => ({ ...d, settings: { ...d.settings, defaultRestSec: parseInt(e.target.value || 0, 10) } }))} />
          </div>
          <div>
            <Label>Sonido</Label>
            <select value={String(data.settings.sound)} onChange={(e) => setData((d) => ({ ...d, settings: { ...d.settings, sound: e.target.value === 'true' } }))} className="mt-1 w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <option value="true">On</option>
              <option value="false">Off</option>
            </select>
          </div>
          <div>
            <Label>Vibración</Label>
            <select value={String(data.settings.vibration)} onChange={(e) => setData((d) => ({ ...d, settings: { ...d.settings, vibration: e.target.value === 'true' } }))} className="mt-1 w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <option value="true">On</option>
              <option value="false">Off</option>
            </select>
          </div>
          <div>
            <Label>Tema</Label>
            <select value={data.settings.theme} onChange={(e) => setData((d) => ({ ...d, settings: { ...d.settings, theme: e.target.value } }))} className="mt-1 w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <option value="system">Sistema</option>
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
            </select>
          </div>
        </div>
        <div className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">Versión: <span className="font-semibold">v{data.version || 1}</span></div>
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-2">Metas semanales</h2>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label>Sesiones</Label>
            <Input type="number" min="0" value={data.settings?.weeklyGoals?.sessions ?? 0} onChange={(e) => setData((d) => ({ ...d, settings: { ...d.settings, weeklyGoals: { ...(d.settings?.weeklyGoals || {}), sessions: Math.max(0, parseInt(e.target.value || 0, 10)) } } }))} />
          </div>
          <div>
            <Label>Volumen (kg·rep)</Label>
            <Input type="number" min="0" step="100" value={data.settings?.weeklyGoals?.volume ?? 0} onChange={(e) => setData((d) => ({ ...d, settings: { ...d.settings, weeklyGoals: { ...(d.settings?.weeklyGoals || {}), volume: Math.max(0, parseInt(e.target.value || 0, 10)) } } }))} />
          </div>
          <div>
            <Label>Cardio (min)</Label>
            <Input type="number" min="0" value={data.settings?.weeklyGoals?.cardio ?? 0} onChange={(e) => setData((d) => ({ ...d, settings: { ...d.settings, weeklyGoals: { ...(d.settings?.weeklyGoals || {}), cardio: Math.max(0, parseInt(e.target.value || 0, 10)) } } }))} />
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-2">Calculadora 1RM</h2>
        <div className="grid grid-cols-3 gap-2 items-end">
          <div>
            <Label>Peso (kg)</Label>
            <Input type="number" step="0.25" inputMode="decimal" value={calc.weight} onChange={(e) => setCalc((c) => ({ ...c, weight: e.target.value }))} />
          </div>
          <div>
            <Label>Reps</Label>
            <Input type="number" value={calc.reps} onChange={(e) => setCalc((c) => ({ ...c, reps: e.target.value }))} />
          </div>
          <div>
            <Label>% objetivo</Label>
            <Input type="number" value={calc.percent} onChange={(e) => setCalc((c) => ({ ...c, percent: e.target.value }))} />
          </div>
        </div>
        <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">1RM estimada: <span className="font-semibold">{oneRm || 0} kg</span> · Carga al {calc.percent}%: <span className="font-semibold">{Number.isFinite(targetLoad) ? targetLoad : 0} kg</span></div>
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-2">Datos y backup</h2>
        <div className="flex items-center gap-2">
          <Button onClick={onExport} className="text-sm"><Download size={16} className="inline mr-1" /> Exportar backup</Button>
          <label className="px-4 py-2 rounded-2xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 cursor-pointer text-sm">
            <Upload size={16} className="inline mr-1" /> Importar backup
            <input type="file" accept="application/json" onChange={onImport} className="hidden" />
          </label>
          <Button className="text-sm" onClick={() => setShowPolicy(true)}>Política de datos</Button>
        </div>
        {fileErr && <div className="text-sm text-rose-500 mt-2">{fileErr}</div>}
        <p className="text-xs text-zinc-500 mt-2">La sincronización en la nube es primaria. Exportar/Importar queda como respaldo manual.</p>
        <p className="text-xs text-zinc-500 mt-1">Última sincronización: {syncStatus?.lastSyncedAt ? new Date(syncStatus.lastSyncedAt).toLocaleString() : "Sin sincronizar"} · Estado: {syncStatus?.phase || "idle"}</p>
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-1">Tips</h2>
        <ul className="text-sm text-zinc-600 dark:text-zinc-400 list-disc ml-5 space-y-1">
          <li>Agrega NicoFit a tu pantalla de inicio en iPhone para abrirlo como app.</li>
          <li>Define descansos por ejercicio desde la rutina si quieres más control.</li>
          <li>El peso se autocompleta con el sugerido; ajústalo en cada serie si hace falta.</li>
        </ul>
      </Card>

      {showPolicy && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
          <Card className="max-w-sm w-[90%] p-4">
            <h3 className="text-lg font-semibold mb-2">Política de datos</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Los datos se guardan localmente como caché offline y también se sincronizan por usuario con backend.
              Puedes exportarlos/importarlos como backup secundario.
              Si activas PWA/notificaciones, se instalan archivos en caché para funcionar offline.
            </p>
            <div className="mt-3 flex justify-end">
              <Button className="text-sm" onClick={() => setShowPolicy(false)}>Cerrar</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

