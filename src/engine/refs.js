/**
 * Reference resolution.
 *
 * Every forward pointer in a flow JSON (`next`, an entry in `answers`,
 * a `watch_for[].goto`) is a plain string. There are exactly three shapes:
 *
 *   "some_node_id"                -> jump to a node inside the current flow
 *   "TRANSITION:CARDIAC_ARREST"   -> cross-flow transition, key looked up in flow.transitions
 *   "END"                         -> the flow is finished
 *
 * Nothing else in the engine is allowed to parse these strings by hand.
 */

export const REF_NODE = 'node';
export const REF_TRANSITION = 'transition';
export const REF_END = 'end';
export const REF_INVALID = 'invalid';

const TRANSITION_PREFIX = 'TRANSITION:';

export function parseRef(ref) {
  if (typeof ref !== 'string' || ref.trim() === '') {
    return { kind: REF_INVALID, raw: ref };
  }
  const value = ref.trim();
  if (value === 'END') return { kind: REF_END, raw: value };
  if (value.startsWith(TRANSITION_PREFIX)) {
    const key = value.slice(TRANSITION_PREFIX.length).trim();
    if (!key) return { kind: REF_INVALID, raw: value };
    return { kind: REF_TRANSITION, key, raw: value };
  }
  return { kind: REF_NODE, id: value, raw: value };
}

export function isTransitionRef(ref) {
  return parseRef(ref).kind === REF_TRANSITION;
}
