/**
 * Where the Phase 4 classifier lives.
 *
 * Set VITE_CLASSIFIER_URL to point at a deployed endpoint. With nothing set,
 * the app tries the bundled dev server (`npm run api`) and silently falls back
 * to the offline matcher if it is not running — which is exactly the Phase 6
 * behaviour we want anyway.
 */
export const CLASSIFIER_ENDPOINT =
  import.meta.env?.VITE_CLASSIFIER_URL ?? 'http://localhost:8787/classify';
