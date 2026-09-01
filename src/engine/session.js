import { parseRef, REF_NODE, REF_TRANSITION, REF_END, REF_INVALID } from './refs.js';
import { evaluateCondition, isConditionTrue } from './conditions.js';
import { groupForNode, captureFromNode } from './sharedContext.js';

/**
 * The Emergency Engine.
 *
 * Pure, framework-free state machine over normalized flows. Every screen the
 * user sees is a node in some flow; every button is a reference the engine
 * resolves. No emergency is special-cased anywhere in this file.
 *
 * Failure modes are first-class: a missing node, an undeclared transition or a
 * flow that has not been authored yet all produce a `status` the UI can render
 * as a safe screen, never an exception.
 */

export const STATUS = {
  RUNNING: 'running',
  PENDING_TRANSITION: 'pending_transition',
  ENDED: 'ended',
  NODE_MISSING: 'node_missing',
  FLOW_MISSING: 'flow_missing',
  BROKEN_REF: 'broken_ref',
};

const MAX_HISTORY = 60;

const MAX_STACK_DEPTH = 8;
const MAX_SKIP_HOPS = 20;

const cloneVars = (vars) => {
  const out = {};
  for (const [flowId, values] of Object.entries(vars)) out[flowId] = { ...values };
  return out;
};

const snapshot = (state) => ({
  frames: state.frames.map((f) => ({ ...f, carried: [...f.carried] })),
  vars: cloneVars(state.vars),
  shared: { ...(state.shared || {}) },
  assumptions: [...(state.assumptions || [])],
  status: state.status,
  pending: state.pending,
  problem: state.problem,
});

function withHistory(state, next) {
  const history = [...state.history, snapshot(state)];
  return { ...next, history: history.slice(-MAX_HISTORY) };
}

export function currentFrame(state) {
  return state.frames[state.frames.length - 1] || null;
}

export function currentFlow(registry, state) {
  const frame = currentFrame(state);
  return frame ? registry.get(frame.flowId) : null;
}

export function currentNode(registry, state) {
  const frame = currentFrame(state);
  if (!frame) return null;
  const flow = registry.get(frame.flowId);
  return flow ? flow.nodes.get(frame.nodeId) || null : null;
}

export function currentVars(state) {
  const frame = currentFrame(state);
  return frame ? state.vars[frame.flowId] || {} : {};
}

function applyEffects(vars, node) {
  if (!node) return vars;
  let next = vars;
  if (node.sets) {
    next = { ...next };
    for (const [key, value] of Object.entries(node.sets)) {
      next[key] = value === 'NOW' ? new Date().toISOString() : value;
    }
  }
  if (node.increments) {
    next = { ...next };
    for (const [key, amount] of Object.entries(node.increments)) {
      const current = Number(next[key]) || 0;
      next[key] = current + (Number(amount) || 0);
    }
  }
  return next;
}

/**
 * A `skip_if` is only honoured when the stored state value maps unambiguously
 * onto one of the node's own answers. If it does not, we ask the question
 * again rather than guess a branch — one redundant question is always safer
 * than a silently wrong turn.
 */
function resolveSkip(node, vars) {
  if (!node?.skipIf) return null;
  const outcome = evaluateCondition(node.skipIf, vars);
  if (!outcome.ok) {
    return { skipped: false, reason: `unparseable skip_if: ${outcome.reason}` };
  }
  if (outcome.value !== true) return null;

  const subject = node.skipIf.match(/[A-Za-z_][A-Za-z0-9_]*/)?.[0];
  const value = subject ? vars[subject] : undefined;
  const candidates = [];
  if (typeof value === 'string') candidates.push(value);
  if (value === true) candidates.push('yes');
  if (value === false) candidates.push('no');
  const match = node.answers.find((a) => candidates.includes(a.key));
  if (match) return { skipped: true, ref: match.ref, reason: `skip_if matched answer "${match.key}"` };
  if (node.next) return { skipped: true, ref: node.next, reason: 'skip_if followed next' };
  return { skipped: false, reason: 'skip_if true but no unambiguous branch — asking anyway' };
}

function enterNode(registry, state, { flowId, nodeId, carried, via }) {
  const flow = registry.get(flowId);
  if (!flow) {
    return {
      ...state,
      status: STATUS.FLOW_MISSING,
      problem: {
        code: 'flow_missing',
        flowId,
        message: `Flow "${flowId}" is not available in this build.`,
      },
    };
  }

  let currentNodeId = nodeId;
  let vars = state.vars[flowId] ? { ...state.vars[flowId] } : { ...flow.initialVars };
  const trailAdditions = [];
  let notes = [];

  for (let hop = 0; hop < MAX_SKIP_HOPS; hop += 1) {
    const node = flow.nodes.get(currentNodeId);
    if (!node) {
      return {
        ...state,
        vars: { ...state.vars, [flowId]: vars },
        status: STATUS.NODE_MISSING,
        problem: {
          code: 'node_missing',
          flowId,
          nodeId: currentNodeId,
          message: `Node "${currentNodeId}" does not exist in flow "${flowId}".`,
        },
      };
    }

    vars = applyEffects(vars, node);
    trailAdditions.push({ flowId, nodeId: node.id, via: hop === 0 ? via : 'skip_if' });

    // Already know who the casualty is? Do not ask again — but say so.
    const sharedGroup = groupForNode(node);
    const sharedValue = sharedGroup ? state.shared?.[sharedGroup.key] : null;
    const sharedAnswer = sharedValue
      ? node.answers.find((answer) => answer.key === sharedValue)
      : null;
    if (sharedAnswer) {
      const base = {
        ...state,
        vars: { ...state.vars, [flowId]: vars },
        frames: [
          ...state.frames.slice(0, -1),
          { ...state.frames[state.frames.length - 1], flowId, nodeId: node.id, carried },
        ],
        assumptions: [
          ...(state.assumptions || []).filter((item) => item.group !== sharedGroup.key),
          { group: sharedGroup.key, value: sharedValue, flowId, nodeId: node.id },
        ],
        trail: [...state.trail, ...trailAdditions],
        notes: [...state.notes, ...notes],
        status: STATUS.RUNNING,
        problem: null,
      };
      return advance(registry, base, sharedAnswer.ref, { recordHistory: false, via: 'assumed' });
    }

    const skip = resolveSkip(node, vars);
    if (skip?.reason) notes.push({ nodeId: node.id, note: skip.reason });
    if (skip?.skipped) {
      const parsed = parseRef(skip.ref);
      if (parsed.kind === REF_NODE) {
        currentNodeId = parsed.id;
        continue;
      }
      // A skip that leaves the flow is handled as a normal advance below.
      const base = {
        ...state,
        vars: { ...state.vars, [flowId]: vars },
        frames: [
          ...state.frames.slice(0, -1),
          { ...state.frames[state.frames.length - 1], flowId, nodeId: node.id, carried },
        ],
        trail: [...state.trail, ...trailAdditions],
        notes: [...state.notes, ...notes],
        status: STATUS.RUNNING,
        problem: null,
      };
      return advance(registry, base, skip.ref, { recordHistory: false });
    }

    const frames = [...state.frames];
    const frame = frames[frames.length - 1];
    frames[frames.length - 1] = {
      ...frame,
      flowId,
      nodeId: node.id,
      carried: carried ?? frame.carried ?? [],
    };

    return {
      ...state,
      frames,
      vars: { ...state.vars, [flowId]: vars },
      status: STATUS.RUNNING,
      pending: null,
      problem: null,
      trail: [...state.trail, ...trailAdditions],
      notes: [...state.notes, ...notes],
    };
  }

  return {
    ...state,
    status: STATUS.BROKEN_REF,
    problem: {
      code: 'skip_loop',
      flowId,
      message: 'skip_if chain did not settle — stopping to avoid a loop.',
    },
  };
}

/**
 * Where an uncertain start begins. Mirrors classification.uncertain_behavior:
 * flows that say RUN_ENTRY_ACTION_THEN_CLARIFY still fire their entry action
 * first (care is never gated on a question), then divert into the first
 * clarifying node instead of the normal `next`.
 */
function resolveUncertainStart(flow) {
  const uncertain = flow.uncertainEntry;
  if (!uncertain) return null;
  const exists = (id) => Boolean(id) && flow.nodes.has(id);
  const firstClarifying = uncertain.clarifyingNodes.find(exists) || null;

  if (uncertain.runsEntryActionFirst && flow.entryAction && firstClarifying) {
    return { startNodeId: flow.entryAction.id, clarifyAfterEntry: firstClarifying };
  }
  if (exists(uncertain.goto)) return { startNodeId: uncertain.goto, clarifyAfterEntry: null };
  if (firstClarifying) return { startNodeId: firstClarifying, clarifyAfterEntry: null };
  return null;
}

export function startSession(registry, flowId, options = {}) {
  const base = {
    frames: [{ flowId, nodeId: null, carried: [], enteredVia: null, clarifyAfterEntry: null }],
    vars: {},
    shared: options.shared ? { ...options.shared } : {},
    assumptions: [],
    history: [],
    trail: [],
    notes: [],
    pending: null,
    problem: null,
    status: STATUS.RUNNING,
    startedAt: options.startedAt || new Date().toISOString(),
  };
  const flow = registry.get(flowId);
  if (!flow) {
    return {
      ...base,
      status: STATUS.FLOW_MISSING,
      problem: { code: 'flow_missing', flowId, message: `Flow "${flowId}" is not available.` },
    };
  }
  const uncertain = options.uncertain ? resolveUncertainStart(flow) : null;
  const seeded = uncertain
    ? {
        ...base,
        frames: [{ ...base.frames[0], clarifyAfterEntry: uncertain.clarifyAfterEntry }],
      }
    : base;

  return enterNode(registry, seeded, {
    flowId,
    nodeId: uncertain ? uncertain.startNodeId : flow.startNodeId,
    carried: [],
    via: options.uncertain ? 'start:uncertain' : 'start',
  });
}

/** Follow any raw reference string coming from next / answers / watch_for. */
export function advance(registry, state, ref, options = {}) {
  const recordHistory = options.recordHistory !== false;
  let frame = currentFrame(state);
  if (!frame) return state;
  const flow = registry.get(frame.flowId);

  // An uncertain start diverts once, straight after the entry action, into the
  // flow's first clarifying question.
  let effectiveRef = ref;
  const activeNode = flow?.nodes?.get(frame.nodeId);
  if (activeNode?.isEntryAction && frame.clarifyAfterEntry) {
    effectiveRef = frame.clarifyAfterEntry;
    frame = { ...frame, clarifyAfterEntry: null };
    state = { ...state, frames: [...state.frames.slice(0, -1), frame] };
  }

  // Answering one of the shared questions teaches every later flow.
  let sharedUpdate = null;
  if (activeNode) {
    const chosen = activeNode.answers.find((answer) => answer.ref === effectiveRef);
    if (chosen) sharedUpdate = captureFromNode(frame.flowId, activeNode, chosen.key);
  }
  if (sharedUpdate) {
    state = { ...state, shared: { ...(state.shared || {}), [sharedUpdate.key]: sharedUpdate.value } };
  }

  const parsed = parseRef(effectiveRef);

  const commit = (next) => (recordHistory ? withHistory(state, next) : { ...next, history: state.history });

  if (parsed.kind === REF_INVALID) {
    return commit({
      ...state,
      status: STATUS.BROKEN_REF,
      problem: {
        code: 'broken_ref',
        flowId: frame.flowId,
        nodeId: frame.nodeId,
        message: `This step points at an unusable destination (${JSON.stringify(ref)}).`,
      },
    });
  }

  if (parsed.kind === REF_END) {
    return commit({ ...state, status: STATUS.ENDED, pending: null, problem: null });
  }

  if (parsed.kind === REF_TRANSITION) {
    const def = flow?.transitions?.[parsed.key];
    if (!def) {
      return commit({
        ...state,
        status: STATUS.BROKEN_REF,
        problem: {
          code: 'undeclared_transition',
          flowId: frame.flowId,
          nodeId: frame.nodeId,
          message: `TRANSITION:${parsed.key} is not declared in "${frame.flowId}".`,
        },
      });
    }
    return commit({
      ...state,
      status: STATUS.PENDING_TRANSITION,
      pending: {
        kind: 'transition',
        fromFlowId: frame.flowId,
        fromNodeId: frame.nodeId,
        transitionKey: parsed.key,
        def,
        available: registry.has(def.targetFlowId),
      },
      problem: null,
    });
  }

  return commit(
    enterNode(registry, { ...state, pending: null }, {
      flowId: frame.flowId,
      nodeId: parsed.id,
      carried: frame.carried,
      via: options.via || 'advance',
    }),
  );
}

/** Actually cross into the target flow after the interstitial is acknowledged. */
export function confirmTransition(registry, state) {
  const pending = state.pending;
  if (!pending || pending.kind !== 'transition') return state;
  const { def } = pending;

  if (!registry.has(def.targetFlowId)) {
    return {
      ...state,
      status: STATUS.FLOW_MISSING,
      problem: {
        code: 'flow_missing',
        flowId: def.targetFlowId,
        message: `Flow "${def.targetFlowId}" has not been authored yet.`,
      },
    };
  }

  const targetFlow = registry.get(def.targetFlowId);
  const carried = [
    ...(currentFrame(state)?.carried || []),
    ...def.carryOver.map((text) => ({
      text,
      fromFlowId: pending.fromFlowId,
      transitionKey: def.key,
    })),
  ];

  // Returning to a flow already on the stack unwinds to it instead of nesting
  // forever (bleeding -> CPR -> breathing returns -> CPR ...).
  const existingIndex = state.frames.findIndex((f) => f.flowId === def.targetFlowId);
  let frames;
  if (existingIndex >= 0) {
    frames = state.frames.slice(0, existingIndex + 1);
  } else if (state.frames.length >= MAX_STACK_DEPTH) {
    frames = [...state.frames.slice(1)];
    frames.push({ flowId: def.targetFlowId, nodeId: null, carried, enteredVia: def });
  } else {
    frames = [
      ...state.frames,
      { flowId: def.targetFlowId, nodeId: null, carried, enteredVia: def },
    ];
  }
  frames[frames.length - 1] = {
    ...frames[frames.length - 1],
    flowId: def.targetFlowId,
    carried,
    enteredVia: def,
  };

  const next = withHistory(state, { ...state, frames, pending: null });
  return enterNode(registry, next, {
    flowId: def.targetFlowId,
    nodeId: targetFlow.startNodeId,
    carried,
    via: `transition:${def.key}`,
  });
}

/**
 * Undo an assumption: forget the remembered answer and go back to the question
 * it silently answered, so the user can correct it in one tap.
 */
export function revisitAssumption(registry, state, assumption) {
  if (!assumption) return state;
  const cleared = withHistory(state, {
    ...state,
    shared: { ...(state.shared || {}), [assumption.group]: null },
    assumptions: (state.assumptions || []).filter((item) => item.group !== assumption.group),
    frames: state.frames.map((frame, index) =>
      index === state.frames.length - 1 ? { ...frame, flowId: assumption.flowId } : frame,
    ),
  });
  return enterNode(registry, cleared, {
    flowId: assumption.flowId,
    nodeId: assumption.nodeId,
    carried: currentFrame(state)?.carried || [],
    via: 'revisit_assumption',
  });
}

export function cancelTransition(state) {
  if (!state.pending) return state;
  return { ...state, pending: null, status: STATUS.RUNNING };
}

export function goBack(state) {
  if (!state.history.length) return state;
  const previous = state.history[state.history.length - 1];
  return {
    ...state,
    ...previous,
    history: state.history.slice(0, -1),
  };
}

export function restartFlow(registry, state) {
  const frame = currentFrame(state);
  if (!frame) return state;
  const flow = registry.get(frame.flowId);
  if (!flow) return state;
  const cleared = withHistory(state, {
    ...state,
    vars: { ...state.vars, [frame.flowId]: { ...flow.initialVars } },
    pending: null,
    problem: null,
    status: STATUS.RUNNING,
  });
  return enterNode(registry, cleared, {
    flowId: frame.flowId,
    nodeId: flow.startNodeId,
    carried: frame.carried,
    via: 'restart',
  });
}

/**
 * Escalations declared at flow level. Those whose trigger the condition
 * evaluator understands are marked `auto` once true (the UI raises them as an
 * alert); the rest are always offered as manual "the situation changed"
 * buttons, because only the person on scene can observe them.
 */
export function activeEscalations(registry, state) {
  const flow = currentFlow(registry, state);
  if (!flow) return [];
  const vars = currentVars(state);
  return flow.globalEscalations
    .map((escalation) => {
      const outcome = evaluateCondition(escalation.trigger, vars);
      if (!outcome.ok) return { ...escalation, kind: 'manual', fired: false };
      return { ...escalation, kind: 'auto', fired: outcome.value === true };
    })
    .filter((escalation) => escalation.kind === 'manual' || escalation.fired);
}

export function availableExits(registry, state) {
  const node = currentNode(registry, state);
  if (!node) return { answers: [], watchFor: [], next: null };
  return {
    answers: node.answers,
    watchFor: node.watchFor,
    next: node.nextTarget ? node.next : null,
  };
}

export { isConditionTrue };
