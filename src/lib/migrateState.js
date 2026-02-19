import { migrateToTemplates } from './migrations.js';

export function migrate(prevState = {}) {
  let state = { ...prevState };
  const warnings = [];
  let v = state.version || 0;

  switch (v) {
    case 4:
      state = migrateToTemplates(state);
      warnings.push('migrated 4→5');
      v = 5;
    case 5:
      break;
    default:
      break;
  }

  return { state, warnings };
}
