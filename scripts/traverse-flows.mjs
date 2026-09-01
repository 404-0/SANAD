import { createRegistry } from '../src/engine/flowRegistry.js';
import {
  startSession,
  advance,
  confirmTransition,
  currentNode,
  currentFrame,
  currentFlow,
  revisitAssumption,
  STATUS,
} from '../src/engine/session.js';
import { loadRawFlowEntries } from './loadFlowsNode.mjs';

/**
 * Behavioural tests for the engine. Because engine states are immutable, an
 * exhaustive walk is just a DFS that forks on every button a user could press.
 */
const registry = createRegistry(loadRawFlowEntries());
const results = [];
const record = (name, passed, detail = '') => {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const exitsOf = (node) => [
  ...node.answers.map((a) => ({ ref: a.ref, label: `answer:${a.key}` })),
  ...node.watchFor.map((w) => ({ ref: w.ref, label: `watch:${w.signal}` })),
  ...(node.next ? [{ ref: node.next, label: 'next' }] : []),
];

// ---------------------------------------------------------------------------
// 1. Every flow starts cleanly, in both normal and "not sure" entry modes.
// ---------------------------------------------------------------------------
for (const flow of registry.list()) {
  const normal = startSession(registry, flow.id);
  record(
    `start ${flow.id}`,
    normal.status === STATUS.RUNNING && Boolean(currentNode(registry, normal)),
    `${normal.status} @ ${currentFrame(normal)?.nodeId}`,
  );
  if (flow.uncertainEntry) {
    const uncertain = startSession(registry, flow.id, { uncertain: true });
    record(
      `start ${flow.id} (uncertain)`,
      uncertain.status === STATUS.RUNNING,
      `${uncertain.status} @ ${currentFrame(uncertain)?.nodeId}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 2. Exhaustive walk: press every button on every reachable screen.
// ---------------------------------------------------------------------------
const badStatuses = [];
const visitedGlobal = new Set();
const transitionOutcomes = [];

for (const flow of registry.list()) {
  const seen = new Set();
  const stack = [startSession(registry, flow.id)];
  let steps = 0;

  while (stack.length && steps < 4000) {
    steps += 1;
    const state = stack.pop();
    const frame = currentFrame(state);
    if (!frame) continue;
    const key = `${frame.flowId}:${frame.nodeId}`;

    if (state.status === STATUS.PENDING_TRANSITION) {
      const pending = state.pending;
      const next = confirmTransition(registry, state);
      const expectMissing = !registry.has(pending.def.targetFlowId);
      const ok = expectMissing
        ? next.status === STATUS.FLOW_MISSING
        : next.status === STATUS.RUNNING &&
          currentFrame(next)?.flowId === pending.def.targetFlowId;
      transitionOutcomes.push({
        from: `${flow.id}`,
        key: pending.transitionKey,
        target: pending.def.targetFlowId,
        ok,
        status: next.status,
        landedOn: currentFrame(next)?.nodeId,
      });
      if (!ok) badStatuses.push({ where: `${flow.id}/${pending.transitionKey}`, status: next.status });
      if (next.status === STATUS.RUNNING && !seen.has(`${currentFrame(next).flowId}:${currentFrame(next).nodeId}`)) {
        stack.push(next);
      }
      continue;
    }

    if (state.status === STATUS.ENDED) continue;
    if (state.status !== STATUS.RUNNING) {
      badStatuses.push({ where: key, status: state.status, problem: state.problem?.message });
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    visitedGlobal.add(key);

    const node = currentNode(registry, state);
    if (!node) {
      badStatuses.push({ where: key, status: 'no_node' });
      continue;
    }
    for (const exit of exitsOf(node)) {
      const next = advance(registry, state, exit.ref);
      if ([STATUS.NODE_MISSING, STATUS.BROKEN_REF].includes(next.status)) {
        badStatuses.push({
          where: `${key} -> ${exit.label} (${exit.ref})`,
          status: next.status,
          problem: next.problem?.message,
        });
        continue;
      }
      stack.push(next);
    }
  }
}

record(
  'exhaustive walk reaches no broken screen',
  badStatuses.length === 0,
  badStatuses.length ? JSON.stringify(badStatuses.slice(0, 5)) : `${visitedGlobal.size} screens visited`,
);

const missingTargets = transitionOutcomes.filter((t) => !registry.has(t.target));
record(
  'cross-flow transitions land in their target flow',
  transitionOutcomes.every((t) => t.ok),
  `${transitionOutcomes.length} transitions exercised, ${missingTargets.length} intentionally unauthored`,
);

// ---------------------------------------------------------------------------
// 3. Milestone: severe bleeding end-to-end, into CPR and into recovery flow.
// ---------------------------------------------------------------------------
function drive(flowId, script, options = {}) {
  let state = startSession(registry, flowId, options);
  const path = [`${currentFrame(state).flowId}/${currentFrame(state).nodeId}`];
  for (const step of script) {
    if (step === '@confirm') {
      state = confirmTransition(registry, state);
    } else {
      const node = currentNode(registry, state);
      if (!node) return { state, path, error: `no node when handling "${step}"` };
      const answer = node.answers.find((a) => a.key === step);
      const watch = node.watchFor.find((w) => w.signal === step);
      const ref = answer?.ref || watch?.ref || (step === '@next' ? node.next : null);
      if (!ref) return { state, path, error: `"${step}" is not an option on ${node.id}` };
      state = advance(registry, state, ref);
    }
    const frame = currentFrame(state);
    path.push(
      state.status === STATUS.PENDING_TRANSITION
        ? `PENDING:${state.pending.transitionKey}`
        : `${frame.flowId}/${frame.nodeId}`,
    );
  }
  return { state, path };
}

const toCpr = drive('severe_external_bleeding', [
  '@next', // entry action: press hard on the wound -> call_emergency
  'calling', // -> q_embedded_object
  'no', // -> instr_apply_dressing
  '@next', // -> instr_circulation_check
  '@next', // -> q_bleeding_uncontrolled
  'yes', // -> q_wound_site
  'limb', // -> q_tourniquet_available
  'no', // -> instr_wound_packing
  '@next', // -> shock_care
  '@next', // -> instr_keep_warm
  '@next', // -> check_response
  'no', // -> instr_open_airway
  '@next', // -> check_breathing
  'no', // -> TRANSITION:CARDIAC_ARREST
  '@confirm',
]);

record(
  'milestone: severe bleeding -> CPR flow',
  !toCpr.error &&
    currentFrame(toCpr.state)?.flowId === 'cardiac_arrest_cpr' &&
    currentFrame(toCpr.state)?.nodeId === 'q_breathing_normal',
  toCpr.error || toCpr.path.join(' → '),
);

const carried = currentFrame(toCpr.state)?.carried || [];
record(
  'milestone: carry_over instruction survives the transition',
  carried.some((item) => /pressure/i.test(item.text)),
  JSON.stringify(carried.map((c) => c.text)),
);

const bleedVars = toCpr.state.vars.severe_external_bleeding || {};
record(
  'milestone: state written by traversed nodes',
  bleedVars.pressure_maintained === true &&
    bleedVars.emergency_called === true &&
    bleedVars.dressing_applied === true &&
    bleedVars.wound_packed === true,
  JSON.stringify(bleedVars),
);

const cprFull = drive('severe_external_bleeding', [
  '@next',
  'calling',
  'yes', // embedded object
  '@next', // -> instr_circulation_check
  '@next', // -> q_bleeding_uncontrolled
  'no', // -> shock_care
  '@next', // -> instr_keep_warm
  '@next', // -> check_response
  'no',
  '@next',
  'yes', // breathing normally -> TRANSITION:UNRESPONSIVE_BREATHING
  '@confirm',
  'no_or_gasping', // unresponsive_breathing q_breathing_normal -> TRANSITION:CARDIAC_ARREST_CPR
  '@confirm',
  'no_or_gasping', // cpr q_breathing_normal -> call_emergency
  '@next', // -> q_age_group
  'adult', // -> adult_cpr
  '@next', // -> adult_breath_option
  'no', // -> adult_hands_only
  '@next', // -> q_aed_available
  'yes', // -> use_aed
  '@next', // -> continue_cpr
]);

record(
  'milestone: bleeding -> unresponsive-breathing -> CPR -> AED loop',
  !cprFull.error && currentFrame(cprFull.state)?.nodeId === 'continue_cpr',
  cprFull.error || cprFull.path.slice(-6).join(' → '),
);

record(
  'milestone: revisiting a flow unwinds the stack instead of nesting',
  cprFull.state.frames.length <= 3,
  `stack depth ${cprFull.state.frames.length}: ${cprFull.state.frames.map((f) => f.flowId).join(' > ')}`,
);

// Normal breathing returns during CPR -> back to unresponsive_breathing.
const backToRecovery = drive('cardiac_arrest_cpr', [
  'no_or_gasping',
  '@next',
  'adult',
  '@next',
  'no',
  '@next',
  'no', // no AED -> continue_cpr
  'normal_breathing_returns',
  '@confirm',
]);
record(
  'CPR monitor -> unresponsive-breathing transition',
  !backToRecovery.error && currentFrame(backToRecovery.state)?.flowId === 'unresponsive_breathing',
  backToRecovery.error || backToRecovery.path.slice(-3).join(' → '),
);

// Uncertain entry: care first, then clarify (severe bleeding's documented rule).
const uncertain = drive('severe_external_bleeding', ['@next'], { uncertain: true });
record(
  'uncertain start fires the entry action, then clarifies',
  uncertain.path[0].endsWith('__entry_action__') &&
    uncertain.path[1] === 'severe_external_bleeding/q_flow_character',
  uncertain.path.join(' → '),
);

// ---------------------------------------------------------------------------
// 3b. Shared casualty context: never ask who it is twice.
// ---------------------------------------------------------------------------
const infantChoking = drive('choking', [
  'no', // can't cough/speak -> q_responsive
  'yes', // responsive -> q_age_group ("is the casualty an infant?")
  'yes', // infant  -> teaches ageGroup = infant
  'still_choking', // back blows -> chest thrusts
  'unresponsive', // -> unresponsive_choking
  '@next', // -> TRANSITION:CARDIAC_ARREST_CPR
  '@confirm',
  'no_or_gasping', // CPR: not breathing -> call_emergency
  '@next', // -> q_age_group, which we already know the answer to
]);

record(
  'choking infant -> CPR skips the age question',
  !infantChoking.error && currentFrame(infantChoking.state)?.nodeId === 'infant_initial_breaths',
  infantChoking.error || infantChoking.path.slice(-3).join(' → '),
);
record(
  'the skipped question is recorded as a visible assumption',
  (infantChoking.state.assumptions || []).some(
    (item) => item.group === 'ageGroup' && item.value === 'infant' && item.nodeId === 'q_age_group',
  ),
  JSON.stringify(infantChoking.state.assumptions),
);

const corrected = revisitAssumption(
  registry,
  infantChoking.state,
  infantChoking.state.assumptions[0],
);
record(
  'undoing the assumption returns to the question it answered',
  currentFrame(corrected)?.nodeId === 'q_age_group' &&
    currentFrame(corrected)?.flowId === 'cardiac_arrest_cpr' &&
    !corrected.shared.ageGroup,
  `${currentFrame(corrected)?.flowId}/${currentFrame(corrected)?.nodeId} shared=${JSON.stringify(corrected.shared)}`,
);

const adultFirst = drive('cardiac_arrest_cpr', ['no_or_gasping', '@next', 'adult']);
record(
  'answering the age question directly stores it too',
  adultFirst.state.shared?.ageGroup === 'adult',
  JSON.stringify(adultFirst.state.shared),
);

// ---------------------------------------------------------------------------
// 4. Malformed data must degrade, not crash.
// ---------------------------------------------------------------------------
const brokenRegistry = createRegistry([
  {
    fileName: 'broken.json',
    data: {
      id: 'broken_case',
      name_ar: 'حالة تالفة',
      name_en: 'Broken case',
      entry_logic: { start_node: 'start' },
      state: { checked: false },
      nodes: [
        {
          id: 'start',
          type: 'instruction',
          title_en: 'Start',
          title_ar: 'ابدأ',
          next: 'does_not_exist',
        },
        {
          id: 'weird',
          type: 'not_a_real_type',
          title_en: 'Weird',
          answers: { yes: 'TRANSITION:NOT_DECLARED', no: 'END' },
        },
      ],
      transitions: {},
    },
  },
]);

const brokenStart = startSession(brokenRegistry, 'broken_case');
const brokenNext = advance(brokenRegistry, brokenStart, 'does_not_exist');
record(
  'dangling next -> NODE_MISSING screen, no throw',
  brokenNext.status === STATUS.NODE_MISSING,
  brokenNext.problem?.message,
);
record(
  'user can still go back after a broken step',
  brokenNext.history.length > 0,
  `${brokenNext.history.length} history entries`,
);

const weirdState = advance(brokenRegistry, brokenStart, 'weird');
const undeclared = advance(brokenRegistry, weirdState, 'TRANSITION:NOT_DECLARED');
record(
  'undeclared transition -> BROKEN_REF screen',
  undeclared.status === STATUS.BROKEN_REF,
  undeclared.problem?.message,
);
record(
  'unknown node type renders as an instruction',
  brokenRegistry.get('broken_case').nodes.get('weird').type === 'instruction',
);
record(
  'missing flow start -> FLOW_MISSING, no throw',
  startSession(brokenRegistry, 'nope_not_here').status === STATUS.FLOW_MISSING,
);

const missingFlowTransition = drive('burns', [
  '@next', // remove_source -> cool_burn
  '@next', // -> remove_items
  '@next', // -> q_special_burn
  'chemical', // -> TRANSITION:CHEMICAL_BURN (flow not authored)
  '@confirm',
]);
record(
  'transition to an unauthored flow -> FLOW_MISSING screen',
  missingFlowTransition.state.status === STATUS.FLOW_MISSING,
  missingFlowTransition.state.problem?.message,
);

// ---------------------------------------------------------------------------
const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.error('\nFAILED:');
  for (const failure of failed) console.error(` - ${failure.name}: ${failure.detail}`);
  process.exit(1);
}
