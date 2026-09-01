import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const FLOW_DIR = join(here, '..', 'src', 'data', 'flows');

/** Same JSON the browser loads, read from disk so the engine can be tested headlessly. */
export function loadRawFlowEntries() {
  return readdirSync(FLOW_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((fileName) => ({
      fileName,
      data: JSON.parse(readFileSync(join(FLOW_DIR, fileName), 'utf8')),
    }));
}
