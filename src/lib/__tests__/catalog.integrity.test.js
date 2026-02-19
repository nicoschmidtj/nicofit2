import repo from '../../data/exercisesRepo.json' with { type: 'json' };

function collectCatalogMetadataWarnings(catalogById = {}) {
  const warnings = [];
  for (const [id, ex] of Object.entries(catalogById)) {
    if (!ex?.muscleGroup && !ex?.muscles?.[0]) {
      warnings.push(`[catalog] ${id}: missing muscle metadata`);
    }
    if (!ex?.implement) {
      warnings.push(`[catalog] ${id}: missing implement metadata`);
    }
  }
  return warnings;
}

const warnings = collectCatalogMetadataWarnings(repo.byId || {});
console.assert(warnings.length === 0, `catalog metadata should be complete; warnings=${warnings.join('; ')}`);

const controlledWarnings = collectCatalogMetadataWarnings({
  'sample-missing': { id: 'sample-missing', name: 'Sample Missing' },
});
console.assert(controlledWarnings.length === 2, 'missing metadata should produce controlled warnings');
for (const message of controlledWarnings) {
  console.warn(message);
}

console.log('catalog integrity tests passed');
