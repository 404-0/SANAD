import { readSetting, writeSetting } from './storage.js';

/**
 * Crash / lock-screen recovery.
 *
 * A phone that locks, a browser that reloads, a mis-tapped back gesture — any
 * of those used to throw away everything the person had already told SANAD
 * mid-emergency. The engine state is plain serializable data, so it is written
 * on every step and offered back on the next launch.
 *
 * It is never auto-resumed: a stale session silently reopening on step 9 of a
 * CPR flow would be worse than starting clean. The user is asked.
 */
const KEY = 'session';
const VERSION = 1;
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // two hours
const MAX_HISTORY = 10;

export function saveSession(session) {
  if (!session) return;
  try {
    writeSetting(KEY, {
      version: VERSION,
      savedAt: Date.now(),
      session: {
        ...session,
        // History is only needed for the Back button; keep it short so the
        // record stays small enough to write on every single step.
        history: (session.history || []).slice(-MAX_HISTORY),
      },
    });
  } catch {
    /* storage full or disabled — resume is a nicety, never load-bearing */
  }
}

export function clearSession() {
  writeSetting(KEY, null);
}

/**
 * Returns a resumable session, or null. Anything stale, from an older schema,
 * or pointing at a flow/node this build no longer has is discarded rather than
 * restored into a broken screen.
 */
export function loadSession(registry) {
  const record = readSetting(KEY, null);
  if (!record || record.version !== VERSION) return null;
  if (!record.savedAt || Date.now() - record.savedAt > MAX_AGE_MS) return null;

  const session = record.session;
  const frame = session?.frames?.[session.frames.length - 1];
  if (!frame) return null;

  const flow = registry.get(frame.flowId);
  if (!flow) return null;
  if (frame.nodeId && !flow.nodes.has(frame.nodeId)) return null;

  return {
    session,
    flow,
    node: flow.nodes.get(frame.nodeId) || null,
    savedAt: record.savedAt,
    minutesAgo: Math.max(0, Math.round((Date.now() - record.savedAt) / 60000)),
  };
}
