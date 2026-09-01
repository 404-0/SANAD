import { useCallback, useMemo, useState } from 'react';
import {
  startSession,
  advance,
  confirmTransition,
  cancelTransition,
  goBack,
  restartFlow,
  revisitAssumption,
  currentFlow,
  currentNode,
  currentFrame,
  currentVars,
  activeEscalations,
  STATUS,
} from '../engine/session.js';

/**
 * Thin React wrapper over the pure engine. All decisions live in session.js;
 * this hook only holds the immutable state object and exposes the verbs the UI
 * needs.
 */
export function useEmergencySession(registry) {
  const [session, setSession] = useState(null);

  const start = useCallback((flowId) => setSession(startSession(registry, flowId)), [registry]);
  /** Rehydrate a session saved before a reload / lock screen. */
  const resume = useCallback((saved) => setSession(saved), []);
  const exit = useCallback(() => setSession(null), []);
  const choose = useCallback(
    (ref) => setSession((current) => (current ? advance(registry, current, ref) : current)),
    [registry],
  );
  const confirm = useCallback(
    () => setSession((current) => (current ? confirmTransition(registry, current) : current)),
    [registry],
  );
  const cancel = useCallback(() => setSession((current) => (current ? cancelTransition(current) : current)), []);
  const back = useCallback(() => setSession((current) => (current ? goBack(current) : current)), []);
  const undoAssumption = useCallback(
    (assumption) =>
      setSession((current) => (current ? revisitAssumption(registry, current, assumption) : current)),
    [registry],
  );
  const restart = useCallback(
    () => setSession((current) => (current ? restartFlow(registry, current) : current)),
    [registry],
  );

  const view = useMemo(() => {
    if (!session) return null;
    return {
      session,
      status: session.status,
      flow: currentFlow(registry, session),
      node: currentNode(registry, session),
      frame: currentFrame(session),
      vars: currentVars(session),
      escalations: activeEscalations(registry, session),
      canGoBack: session.history.length > 0,
      // Only surface an assumption while the user is inside the flow it applied to.
      assumption:
        (session.assumptions || []).find(
          (item) => item.flowId === currentFrame(session)?.flowId,
        ) || null,
      pending: session.pending,
      problem: session.problem,
      stepCount: session.trail.length,
    };
  }, [registry, session]);

  return { view, start, resume, exit, choose, confirm, cancel, back, restart, undoAssumption, STATUS };
}
