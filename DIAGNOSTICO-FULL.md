# Diagnóstico Técnico-Funcional Completo de NicoFit

## 1) Resumen Ejecutivo
- Se detectó un error de lint bloqueante por una importación no utilizada en `App.jsx`, impidiendo pasar `npm run lint`.
- La función de importación de respaldos JSON carece de validaciones de esquema, lo que permite datos corruptos o maliciosos en `localStorage`.
- Varias dependencias de hooks (`useMemo`/`useEffect`) están incompletas, provocando estado obsoleto en cálculos y sets.
- La navegación por pestañas no implementa roles ARIA ni estados seleccionados, afectando la accesibilidad.
- El bundle principal supera los 500 kB sin división de código, impactando la carga inicial y el rendimiento.
- Tailwind se carga desde CDN en tiempo de ejecución, lo que compromete el funcionamiento offline del PWA.
- Importaciones JSON inconsistentes (`with { type: 'json' }`) generan advertencias en el build.
- Los algoritmos analíticos (frecuencia y heatmap) iteran con complejidad O(n²), degradando el rendimiento con historiales grandes.
- El versionado de `localStorage` v5 no contempla futuras migraciones ni validación exhaustiva.
- Riesgos inmediatos: **fallo de lint** (rompe CI) y **importación JSON sin validar** (corrupción de datos/XSS).

## 2) Metodología
- Revisión estática de código fuente (`src/*`, `lib/*`, `data/*`, `public/*`, `vite.config.js`).
- Ejecución local opcional: no se corrieron tests end-to-end, solo build/preview.
- Comandos ejecutados:
  - `npm ci`
  - `npm run lint`
  - `npm run build`
  - `npm run preview`
- Commit analizado: `7aefc7df47d8ae734c70de25b11dd736b87d0412` (2025‑??‑??). *Fecha según entorno del análisis.*

## 3) Matriz de Severidad × Categoría
| ID | Título | Severidad | Categoría |
|----|--------|-----------|-----------|
| ISS-01 | Importación no usada provoca fallo de lint | ALTA | CALIDAD DE CÓDIGO |
| ISS-02 | Dependencias ausentes en hooks causan estado obsoleto | MEDIA | CALIDAD DE CÓDIGO |
| ISS-03 | Importación JSON sin validación de esquema | ALTA | SEGURIDAD |
| ISS-04 | Pestañas sin roles ARIA ni `aria-selected` | MEDIA | ACCESIBILIDAD |
| ISS-05 | Botones con área táctil <44px | BAJA | UX/UI |
| ISS-06 | Tailwind desde CDN rompe funcionamiento offline | MEDIA | PWA/PLATAFORMA |
| ISS-07 | Atributos de importación JSON inconsistentes en build | BAJA | DEPENDENCIAS |
| ISS-08 | Bundle >500 kB sin code-splitting | MEDIA | RENDIMIENTO |
| ISS-09 | Algoritmos analíticos O(n²) | MEDIA | RENDIMIENTO |
| ISS-10 | Versionado de `localStorage` sin estrategia futura | MEDIA | ESTADO/DATOS |

## 4) Hallazgos Detallados
### ISS-01: Importación no usada provoca fallo de lint
- **Severidad/Categoría:** ALTA / CALIDAD DE CÓDIGO
- **Causa raíz:** `primaryGroup` importado pero nunca utilizado en `src/App.jsx`【F:src/App.jsx†L1-L10】
  ```diff
  - import { getTemplateRoutineName, suggestAlternativesByExerciseId, primaryGroup, loadRepo, findAlternatives } from "./lib/repoAdapter.js";
  + import { getTemplateRoutineName, suggestAlternativesByExerciseId, loadRepo, findAlternatives } from "./lib/repoAdapter.js";
  ```
- **Impacto observable:** `npm run lint` termina con error, bloqueando CI/CD.
- **Reproducción:** ejecutar `npm run lint`.
- **Datos implicados:** ninguno.
- **Parche sugerido:** eliminar la importación o usar la variable.
- **Riesgo colateral:** si se pretendía usar `primaryGroup`, eliminarlo podría ocultar lógica pendiente.
- **Checklist post-fix:**
  - [ ] `npm run lint` sin errores.
  - [ ] Build continua funcionando.

### ISS-02: Dependencias ausentes en hooks causan estado obsoleto
- **Severidad/Categoría:** MEDIA / CALIDAD DE CÓDIGO
- **Causa raíz:**
  - `useMemo` sin incluir `repo?.byId`【F:src/App.jsx†L431-L438】
  - `useEffect` que inicializa ejercicios ignora `data`【F:src/App.jsx†L585-L610】
- **Impacto observable:** cambios en el repositorio o `data` no disparan recomputaciones; pesos iniciales pueden quedar desactualizados.
- **Reproducción:** modificar `data.customExercisesById` en una sesión activa y observar que los sets no se recalculan.
- **Datos implicados:** `profileByExerciseId`, `userRoutinesIndex`.
- **Parche sugerido:**
  ```diff
  - }, [routines]);
  + }, [routines, repo?.byId]);
  ...
  - }, [exIds, sessionOverridesBySlot, routineKey, unit, activeSession?.id]);
  + }, [exIds, sessionOverridesBySlot, routineKey, unit, activeSession?.id, data]);
  ```
- **Riesgo colateral:** agregar dependencias puede disparar renders adicionales; revisar performance.
- **Checklist:**
  - [ ] React warnings ausentes en consola.
  - [ ] Pesos iniciales se actualizan tras cambios en `data`.

### ISS-03: Importación JSON sin validación de esquema
- **Severidad/Categoría:** ALTA / SEGURIDAD
- **Causa raíz:** `onImport` solo verifica campos básicos【F:src/App.jsx†L1422-L1435】
- **Impacto observable:** se pueden cargar datos con campos inesperados o scripts en notas; riesgo de corrupción de `localStorage` (`nicofit_data_v5`).
- **Reproducción:** importar un JSON con campos extra o valores no numéricos.
- **Datos implicados:** toda la estructura persistida en `localStorage`.
- **Parche sugerido:** validar contra un esquema y sanitizar strings.
  ```js
  const schema = z.object({ settings: z.object({...}), routines: z.array(...), sessions: z.array(...) })
  schema.parse(obj)
  ```
- **Riesgo colateral:** rechazo de backups antiguos si el esquema cambia; proveer migraciones.
- **Checklist:**
  - [ ] Importaciones inválidas muestran error claro.
  - [ ] No se guardan datos corruptos en `localStorage`.

### ISS-04: Pestañas sin roles ARIA ni `aria-selected`
- **Severidad/Categoría:** MEDIA / ACCESIBILIDAD
- **Causa raíz:** botones en navegación inferior carecen de roles y atributos de selección【F:src/App.jsx†L544-L551】
- **Impacto observable:** lectores de pantalla no anuncian correctamente la pestaña activa.
- **Reproducción:** navegar con lector de pantalla; el foco no indica estado activo.
- **Parche sugerido:**
  ```diff
  - <button key={t.id} onClick={() => setTab(t.id)} ...>
  + <button key={t.id} role="tab" aria-selected={tab===t.id} onClick={() => setTab(t.id)} ...>
  ```
- **Riesgo colateral:** ninguno.
- **Checklist:**
  - [ ] Navegación verbaliza pestaña activa.
  - [ ] Pruebas con `axe` sin errores en esta sección.

### ISS-05: Botones con área táctil <44px
- **Severidad/Categoría:** BAJA / UX/UI
- **Causa raíz:** componente `Button` usa `py-2` (~32px altura)【F:src/App.jsx†L161-L166】
- **Impacto observable:** pulsaciones erróneas en dispositivos táctiles.
- **Reproducción:** probar en móvil; botones pequeños en navegación.
- **Parche sugerido:** aumentar padding o tamaño mínimo.
  ```diff
  - className={`px-4 py-2 ...`}
  + className={`px-4 py-3 min-h-[44px] ...`}
  ```
- **Riesgo colateral:** ajustes de layout.
- **Checklist:**
  - [ ] Tamaño táctil ≥44px.
  - [ ] No se rompe layout responsivo.

### ISS-06: Tailwind desde CDN rompe funcionamiento offline
- **Severidad/Categoría:** MEDIA / PWA/PLATAFORMA
- **Causa raíz:** `index.html` carga Tailwind vía CDN【F:index.html†L4-L8】
- **Impacto observable:** primera carga sin conexión falla; CSP externa.
- **Reproducción:** activar modo avión antes de la primera visita.
- **Parche sugerido:** integrar Tailwind en build (postcss/vite) y precachear.
- **Riesgo colateral:** aumento de tamaño de build.
- **Checklist:**
  - [ ] App arranca offline tras instalación.
  - [ ] No se realizan requests a CDN en producción.

### ISS-07: Atributos de importación JSON inconsistentes en build
- **Severidad/Categoría:** BAJA / DEPENDENCIAS
- **Causa raíz:** algunos módulos importan `exercisesRepo.json` con `with { type:'json' }` y otros no, generando advertencias de Vite【9bacd3†L1-L3】【4e8b43†L1-L2】
- **Impacto observable:** warnings en `npm run build`; riesgo de incompatibilidad futura.
- **Reproducción:** ejecutar `npm run build`.
- **Parche sugerido:** unificar estilo de importación.
- **Riesgo colateral:** ninguna.
- **Checklist:**
  - [ ] Build sin advertencias de atributos.

### ISS-08: Bundle >500 kB sin code-splitting
- **Severidad/Categoría:** MEDIA / RENDIMIENTO
- **Causa raíz:** `dist/assets/index-BdHJ7Qq9.js` 646 kB【1c2456†L10-L13】
- **Impacto observable:** carga inicial lenta en redes móviles.
- **Reproducción:** inspeccionar `npm run build`.
- **Parche sugerido:** dividir en chunks (`React.lazy`, `manualChunks`).
- **Riesgo colateral:** complejidad en routing.
- **Checklist:**
  - [ ] Bundle principal <250 kB.
  - [ ] Métrica LCP mejora en Lighthouse.

### ISS-09: Algoritmos analíticos O(n²)
- **Severidad/Categoría:** MEDIA / RENDIMIENTO
- **Causa raíz:** `heatmapWeekGroup` y `buildPerExerciseHistory` recorren sesiones y sets con estructuras Map anidadas【F:src/lib/analytics.js†L65-L95】【F:src/lib/analytics.js†L98-L124】
- **Impacto observable:** demoras al renderizar historial con grandes volúmenes.
- **Reproducción:** importar historial con cientos de sesiones y abrir pestaña de historial.
- **Parche sugerido:** memoizar y reducir iteraciones (pre-agregar por semana/grupo).
- **Riesgo colateral:** mayor uso de memoria si se cachea.
- **Checklist:**
  - [ ] Tiempo de render <100 ms con 1 000 sesiones.

### ISS-10: Versionado de `localStorage` sin estrategia futura
- **Severidad/Categoría:** MEDIA / ESTADO/DATOS
- **Causa raíz:** `DEFAULT_DATA.version=5` y `migrateToTemplates` solo actualiza a v5, sin manejo de versiones posteriores【F:src/App.jsx†L100-L115】【F:src/lib/migrations.js†L24-L83】
- **Impacto observable:** futuros cambios de estructura pueden quedar sin migración, causando errores.
- **Reproducción:** simular `version: 4` con campos antiguos y observar falta de migraciones específicas.
- **Parche sugerido:** implementar switch por versión y pruebas de regresión.
- **Riesgo colateral:** complejidad de mantenimiento.
- **Checklist:**
  - [ ] Migraciones cubren versiones antiguas y futuras.
  - [ ] Backups viejos se migran automáticamente.

## 5) Secciones técnicas específicas
### 5.1 Lógica/Estado
- **Inicialización de sesión y `routineKey`:** `startStrength` crea sesión con `routineKey` y timestamp【F:src/App.jsx†L309-L311】.
- **Persistencia de checks (`registeredMask`) y overrides por slot:** estado inicializado por `useEffect`【F:src/App.jsx†L585-L610】 y registrado al confirmar sets【F:src/App.jsx†L650-L715】.
- **RPE↔RIR y cálculo de “next”:** funciones `rpeToRir` y `calcNext` definen progresión【F:src/App.jsx†L35-L72】.
- **Redondeos (0.25), kg↔lb:** `roundToNearest`/`round025` y conversión de unidades【F:src/lib/utils.js†L1-L40】【F:src/App.jsx†L32-L34】.
- **Migraciones/localStorage (versionado v5):** carga mediante `loadFromLS` y fusión con `DEFAULT_DATA`【F:src/App.jsx†L117-L129】【F:src/App.jsx†L179-L199】.

### 5.2 Repositorio de ejercicios/plantillas
- **Consistencia de IDs:** `buildDefaultUserRoutinesIndex` clona `repo.routinesIndex`【F:src/lib/defaultUserRoutines.js†L1-L12】.
- **Campos usados realmente:** `initialRecord.weightKg`, `muscles`, `tempo`, `restSec` aparecen en `exercisesRepo.json`【F:src/data/exercisesRepo.json†L5-L26】.
- **Validaciones de datos:** utilidades dependen de `Number.isFinite` para pesos y reps【F:src/lib/utils.js†L26-L39】.

### 5.3 Historial/Gráficos
- **Cálculos:** `freqDaysByGroup`, `heatmapWeekGroup`, `buildPerExerciseHistory`【F:src/lib/analytics.js†L40-L63】【F:src/lib/analytics.js†L65-L95】【F:src/lib/analytics.js†L98-L124】.
- **Empty states / NaN:** uso de `validSet` evita NaN en cálculos【F:src/lib/analytics.js†L36-L38】.
- **Dependencias y performance:** `useMemo` para `perExerciseHistory` y `weeklyVolume`【F:src/App.jsx†L431-L444】.

### 5.4 UX/UI
- **Coherencia visual:** botones base en Tailwind, pero título de `index.html` queda como "Vite + React".
- **Legibilidad y estados vacíos:** `SettingsTab` incluye textos descriptivos; pero prompts de notas (`prompt`) interrumpen flujo.

### 5.5 Accesibilidad
- **Roles/aria-labels:** `IconButton` provee `aria-label`, pero tab bar carece de `role="tablist"` y `aria-selected`【F:src/App.jsx†L544-L551】.
- **Tamaño táctil:** botones `py-2` ~32px (<44px)【F:src/App.jsx†L161-L166】.
- **Contraste oscuro:** Tailwind default: verificar manualmente; no se detectaron tokens específicos.

### 5.6 PWA/Plataforma
- **Manifest & SW:** configurado en `vite.config.js` con Workbox y fallback a `index.html`【F:vite.config.js†L8-L31】; registro en `main.jsx`【F:src/main.jsx†L1-L6】.
- **Iconos:** `public/` incluye variantes `maskable` y 192/512.
- **Notificaciones iOS / background:** no implementadas; timers dependen de `setTimeout` en `App.jsx`.
- **Glitches iOS Safari:** uso de `vh` no detectado, pero `fixed bottom` navbar puede verse afectado por barras de iOS.

### 5.7 Seguridad
- **Posibles XSS:** notas capturadas por `prompt` y exportadas; se mitiga con `escapeHtml` al exportar【F:src/App.jsx†L1410-L1414】.
- **Validación import/export:** `onImport` carece de sanitización (ver ISS‑03).

### 5.8 Rendimiento
- **Cálculos O(n²):** ver ISS‑09.
- **Tamaño de bundle:** ver ISS‑08; build genera `dist/assets/index-BdHJ7Qq9.js` 646 kB【1c2456†L10-L13】.
- **Listeners:** `useBeep` cierra `AudioContext` en cleanup para evitar fugas【F:src/App.jsx†L131-L155】.

### 5.9 Calidad de código / Lint
- Resultado `npm run lint`【0c1762†L1-L17】 muestra 1 error (no-unused-vars) y 2 warnings (React hooks deps).

### 5.10 Dependencias
- **Versiones principales:** React 19.1.1, Vite 7.1.0, `lucide-react` 0.539.0, `recharts` 3.1.2【F:package.json†L13-L27】.
- **Riesgos:** uso de Tailwind CDN y bundle único sin splitting.

## 6) Verificaciones automatizables / Comandos usados
- `npm ci` — instalación limpia de dependencias【bb133c†L1-L6】
- `npm run lint` — falla por importación no usada【0c1762†L1-L17】
- `npm run build` — build exitoso con advertencias y bundle grande【1c2456†L1-L18】【9bacd3†L1-L3】
- `npm run preview` — servidor estático en `http://localhost:4173`【96a082†L1-L7】

## 7) Prioritized Fix Plan (NO ejecutar)
### Quick Wins (<2 h)
- Corregir importación no usada y dependencias de hooks (ISS‑01, ISS‑02).
- Añadir roles ARIA y `aria-selected` en tabs (ISS‑04).
- Integrar Tailwind en build para soporte offline (ISS‑06).

### Sprint 1 (1–2 días)
- Implementar validación de esquema en import/export y migraciones robustas (ISS‑03, ISS‑10).
- Ajustar tamaños de botones y revisar contraste/labels (ISS‑05).

### Sprint 2 (1–2 días)
- Analizar y aplicar code-splitting; optimizar algoritmos analíticos (ISS‑08, ISS‑09).
- Unificar importaciones JSON y revisar dependencias (ISS‑07, 5.10).

### Dependencias entre tareas
- Validar importaciones (ISS‑03) antes de optimizar migraciones (ISS‑10).
- Code-splitting (ISS‑08) puede depender de limpieza de importaciones JSON (ISS‑07).

