/**
 * Browser-side flow loading. The JSON files in src/data/flows are the single
 * source of truth — adding a file here is the ONLY step needed to add an
 * emergency to the app.
 */
const modules = import.meta.glob('./flows/*.json', { eager: true });

export const rawFlowEntries = Object.entries(modules)
  .map(([path, mod]) => ({
    fileName: path.split('/').pop(),
    data: mod.default ?? mod,
  }))
  .sort((a, b) => a.fileName.localeCompare(b.fileName));
