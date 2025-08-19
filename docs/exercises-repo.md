# exercisesRepo.json

Este archivo define el repositorio de ejercicios.

## Estructura

- `version`: número de versión del esquema.
- `unit`: unidad base utilizada para los pesos.
- `byId`: objeto que mapea `id` de ejercicio a su definición.
- `historyById`: registros históricos por ejercicio (puede estar vacío).
- `routinesIndex`: índice de rutinas, cada clave contiene un array de ids de ejercicios.

Cada ejercicio en `byId` puede incluir campos como:

- `id`, `name`, `muscles`, `category`, `mode`, `implement`.
- `execution`: detalles de ejecución (unilateral, agarre, etc.).
- `fixed`: configuración objetivo de series, repeticiones, tempo y descanso.
- `initialRecord`: registro inicial del ejercicio.
- `progression`: información para progresiones de carga.

Este formato permite cargar el repositorio y consultar ejercicios o rutinas mediante utilidades en `src/lib/repo.js`.
