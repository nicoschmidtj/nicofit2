import { migrateToTemplates } from './migrations.js';

/**
 * Migrate persisted state to the latest version.
 * @param {any} prevState
 * @returns {{ state: any, warnings: string[] }}
 */
export function migrate(prevState: any = {}) {
  let state = { ...prevState };
  const warnings: string[] = [];
  let v = state.version || 0;

  switch (v) {
    case 4:
      state = migrateToTemplates(state);
      warnings.push('migrated 4→5');
      v = 5;
      // fallthrough to check next migrations
    case 5:
      // placeholder for future migration to v6
      break;
    default:
      break;
  }

  return { state, warnings };
}

export default migrate;

