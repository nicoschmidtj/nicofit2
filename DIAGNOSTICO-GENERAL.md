## Resumen
Diagnóstico exploratorio de NicoFit centrado en la pestaña *Historial* y sus métricas.

## Historial — Qué calcula HOY (con rutas y fórmulas)
- **Selección y filtros**: estado local `range` (30/90/180 días) y `routineFilter` se aplican al filtrar sesiones por fecha y rutina【F:src/App.jsx†L1150-L1160】.
- **Volumen semanal**: suma `session.totalVolume` por semana ISO, retornando pares `{week, volume}`【F:src/App.jsx†L1549-L1558】.
- **Distribución por grupo (torta)**: mapea ejercicio→grupo vía `primaryGroup` y acumula `kg·reps` por grupo【F:src/App.jsx†L1561-L1578】.
- **Volumen semanal por grupo**: misma base anterior pero agrupada por semana y apilada por grupo【F:src/App.jsx†L1582-L1603】.
- **1RM estimada por ejercicio**: `perExerciseHistory` arma un array por ejercicio con `oneRM = epley(weightKg,reps)` y fecha【F:src/App.jsx†L430-L454】【F:src/App.jsx†L1290-L1305】.
- **PRs recientes**: detecta nuevos máximos de e1RM, volumen y repeticiones en la ventana seleccionada【F:src/App.jsx†L1605-L1642】.
- **Mapeos ejercicio→grupo**: función `primaryGroup` en `src/lib/repo.js` que toma el primer músculo del repositorio【F:src/lib/repo.js†L33-L40】; fallback heurístico `MUSCLE_FROM_NAME` para nuevos ejercicios【F:src/App.jsx†L74-L83】.

## Problemas detectados
- `volume: set.reps * set.weightKg` puede producir `NaN` cuando faltan campos; luego se acumula sin validación【F:src/App.jsx†L439-L448】.
- `topE1RM` no respeta `routineFilter` ni `range`, depende solo de `sessions` y `routines`→datos desfasados al cambiar filtros【F:src/App.jsx†L1182-L1196】.
- Las gráficas no manejan *empty states*: siempre renderizan `<ResponsiveContainer>` aunque `data.length===0`【F:src/App.jsx†L1226-L1272】【F:src/App.jsx†L1296-L1305】.
- `useEffect` inicializa `exId` dependiendo de `exId` mismo; se ejecuta dos veces tras montarse【F:src/App.jsx†L1153-L1154】.
- Cálculo de `perExerciseHistory` busca cada ejercicio con `flatMap().find()` en cada set ⇒ costo O(n²) y uso de memoria creciente【F:src/App.jsx†L430-L441】.

## Causas del “bloque negro”
1. Arrays vacíos o con valores `0/NaN` generan SVG sin elementos; el `<Card>` oscuro se percibe como bloque negro.
2. En la torta, valores todo 0 colapsan en un path único con `fill` por defecto (negro) cuando no hay `<Cell>` válido.
3. Altura fija `h-40/h-48` depende de que el contenedor padre tenga tamaño; si se renderiza antes de layout (e.g., pestaña inactiva), `ResponsiveContainer` calcula `0×0` y Recharts dibuja rectángulo negro al actualizar.

## Recomendaciones (NO aplicar)
- **Torta por frecuencia de días**: contar días con sets por grupo; array `{group, days}` ordenado descendente. Permitir filtro de rutina/rango y colores `GROUP_COLORS`.
- **Volumen semanal por grupo – alternativas**:
  - **B**: línea apilada por grupo (area chart) para ver tendencias acumuladas.
  - **C**: heatmap semana×grupo con escala logarítmica para detectar desequilibrios.
- **Empty states y validación**:
  - Si `data.length===0` mostrar mensaje “Sin datos” en vez de gráfico.
  - Sanear entradas (`Number.isFinite`) antes de agregarlas; descartar sets sin `weightKg` o `reps`.

## Lista de chequeo para QA manual (iPhone PWA y desktop)
1. Instalar PWA, abrir offline y verificar carga (`vite-plugin-pwa`, `registerSW`)【F:src/main.jsx†L1-L8】【F:vite.config.js†L8-L32】.
2. En Historial, probar filtros 30/90/180 días y por rutina; validar que las tarjetas de resumen cambian.
3. Registrar sesión con sets vacíos y con ejercicios sin grupo para comprobar manejo de “otros”.
4. Cambiar unidad kg↔lb y confirmar conversión correcta en la lista *Top 5 e1RM*.
5. Navegación con teclado: foco en selectores y botones de los gráficos.
6. Medir memoria en devtools tras cargar >200 sesiones; observar re-render de `perExerciseHistory`.
7. Verificar que los textos con números usen fuente tabular y `aria-label` cuando corresponda (p.ej., PRs recientes).
8. En modo oscuro, confirmar que las gráficas no muestren “bloques negros” al cambiar de pestaña.
