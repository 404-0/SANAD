import { parseRef, REF_NODE, REF_TRANSITION, REF_END, REF_INVALID } from './refs.js';

/**
 * Turns a raw emergency JSON file into the single shape the engine and the UI
 * understand. Nothing downstream is allowed to read raw JSON keys directly.
 *
 * The normalizer never throws. Anything it cannot make sense of is recorded in
 * `flow.issues` so the app can degrade gracefully (and so the validator script
 * can fail the build) instead of crashing mid-emergency.
 */

export const ENTRY_ACTION_ID = '__entry_action__';

export const NODE_TYPES = [
  'instruction',
  'question',
  'monitor',
  'loop',
  'transition',
  'rule',
  'aftercare',
];

const SEVERITY = { ERROR: 'error', WARNING: 'warning' };

function bilingual(source, base) {
  if (!source) return null;
  const ar = source[`${base}_ar`];
  const en = source[`${base}_en`];
  if (ar == null && en == null) return null;
  return { ar: ar ?? null, en: en ?? null };
}

function normalizeAnswers(raw, node, issues, nodeId) {
  const answers = raw?.answers;
  if (!answers || typeof answers !== 'object') return [];
  const labels = raw?.answer_labels || {};
  return Object.entries(answers).map(([key, ref]) => {
    const parsed = parseRef(ref);
    if (parsed.kind === REF_INVALID) {
      issues.push({
        severity: SEVERITY.ERROR,
        nodeId,
        code: 'invalid_answer_ref',
        message: `Answer "${key}" points at an unusable value (${JSON.stringify(ref)}).`,
      });
    }
    const label = labels[key];
    return {
      key,
      ref,
      target: parsed,
      label: label ? { ar: label.ar ?? null, en: label.en ?? null } : null,
    };
  });
}

function normalizeWatchFor(raw, issues, nodeId) {
  const list = raw?.watch_for;
  if (!Array.isArray(list)) return [];
  return list
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const parsed = parseRef(entry.goto);
      if (parsed.kind === REF_INVALID) {
        issues.push({
          severity: SEVERITY.ERROR,
          nodeId,
          code: 'invalid_watch_for_ref',
          message: `watch_for "${entry.signal}" has no usable goto.`,
        });
      }
      return {
        signal: entry.signal ?? 'unknown_signal',
        ref: entry.goto,
        target: parsed,
        sources: entry.sources || [],
      };
    });
}

function normalizeLoop(raw) {
  const loop = raw?.loop;
  if (!loop || typeof loop !== 'object') return null;
  return {
    intervalSeconds: Number(loop.interval_seconds) || null,
    recheckNodeId: loop.recheck_node || null,
    reassessNodeId: loop.reassess_node || null,
  };
}

function normalizeNode(raw, issues) {
  const id = raw?.id;
  if (!id) {
    issues.push({
      severity: SEVERITY.ERROR,
      code: 'node_without_id',
      message: 'A node has no id and was dropped.',
    });
    return null;
  }

  let type = raw.type;
  if (!NODE_TYPES.includes(type)) {
    issues.push({
      severity: SEVERITY.WARNING,
      nodeId: id,
      code: 'unknown_node_type',
      message: `Unknown node type "${type}" — rendering it as an instruction.`,
    });
    type = 'instruction';
  }

  const title = bilingual(raw, 'title');
  const question = bilingual(raw, 'question');
  if (!title && !question) {
    issues.push({
      severity: SEVERITY.ERROR,
      nodeId: id,
      code: 'node_without_text',
      message: 'Node has neither a title nor a question.',
    });
  }

  const nextParsed = raw.next != null ? parseRef(raw.next) : null;
  if (nextParsed && nextParsed.kind === REF_INVALID) {
    issues.push({
      severity: SEVERITY.ERROR,
      nodeId: id,
      code: 'invalid_next_ref',
      message: `next is not a usable reference (${JSON.stringify(raw.next)}).`,
    });
  }

  const node = {
    id,
    type,
    terminal: raw.terminal === true,
    concurrent: raw.concurrent === true,
    action: raw.action || null,
    doesNotInterrupt: raw.does_not_interrupt || null,
    title,
    question,
    description: bilingual(raw, 'description'),
    hint: bilingual(raw, 'hint'),
    sets: raw.sets && typeof raw.sets === 'object' ? raw.sets : null,
    increments: raw.increments && typeof raw.increments === 'object' ? raw.increments : null,
    skipIf: typeof raw.skip_if === 'string' ? raw.skip_if : null,
    answers: normalizeAnswers(raw, raw, issues, id),
    next: raw.next ?? null,
    nextTarget: nextParsed,
    watchFor: normalizeWatchFor(raw, issues, id),
    loop: normalizeLoop(raw),
    sources: Array.isArray(raw.sources) ? raw.sources : [],
    sourceNote: raw.source_note || null,
    raw,
  };

  const hasExit =
    node.nextTarget != null || node.answers.length > 0 || node.watchFor.length > 0;
  if (!hasExit && !node.terminal) {
    issues.push({
      severity: SEVERITY.WARNING,
      nodeId: id,
      code: 'dead_end_node',
      message: 'Node is not terminal but has no next / answers / watch_for.',
    });
  }

  return node;
}

function normalizeTransitions(raw, issues) {
  const out = {};
  const transitions = raw?.transitions;
  if (!transitions || typeof transitions !== 'object') return out;
  for (const [key, def] of Object.entries(transitions)) {
    if (!def?.target_flow) {
      issues.push({
        severity: SEVERITY.ERROR,
        code: 'transition_without_target',
        message: `Transition "${key}" has no target_flow.`,
      });
      continue;
    }
    out[key] = {
      key,
      targetFlowId: def.target_flow,
      reason: { ar: def.reason_ar ?? null, en: def.reason_en ?? null },
      carryOver: Array.isArray(def.carry_over) ? def.carry_over : [],
      sources: def.sources || [],
    };
  }
  return out;
}

function normalizeEscalations(raw) {
  const list = raw?.global_escalations;
  if (!Array.isArray(list)) return [];
  return list
    .filter((entry) => entry && entry.goto)
    .map((entry) => ({
      id: entry.id || entry.trigger,
      trigger: entry.trigger || null,
      reason: { ar: entry.reason_ar ?? null, en: entry.reason_en ?? null },
      ref: entry.goto,
      target: parseRef(entry.goto),
      sources: entry.sources || [],
    }));
}

function normalizeEntryAction(raw, issues) {
  const entry = raw?.entry_action;
  if (!entry) return null;
  const synthetic = {
    id: ENTRY_ACTION_ID,
    type: 'instruction',
    title_ar: entry.title_ar,
    title_en: entry.title_en,
    description_ar: entry.description_ar,
    description_en: entry.description_en,
    sets: entry.sets,
    action: entry.action,
    next: entry.next,
    sources: entry.sources,
  };
  const node = normalizeNode(synthetic, issues);
  if (node) {
    node.isEntryAction = true;
    node.firesWithoutQuestions = entry.fires_without_questions === true;
  }
  return node;
}

/**
 * `classification.uncertain_behavior` describes what to do when the case is
 * only *probably* this emergency. Phase 2 has no classifier yet, so it is
 * exposed as an explicit "not sure" start; the same structure is what the AI
 * classifier will hand the engine later.
 */
function normalizeUncertainEntry(raw) {
  const behavior = raw?.classification?.uncertain_behavior;
  if (!behavior) return null;
  return {
    action: behavior.action || null,
    note: behavior.note || null,
    goto: behavior.goto || null,
    clarifyingNodes: Array.isArray(behavior.clarifying_nodes) ? behavior.clarifying_nodes : [],
    runsEntryActionFirst: /ENTRY_ACTION/i.test(behavior.action || ''),
  };
}

export function normalizeFlow(raw, { fileName } = {}) {
  const issues = [];
  const id = raw?.id;
  if (!id) {
    issues.push({
      severity: SEVERITY.ERROR,
      code: 'flow_without_id',
      message: `Flow in ${fileName || 'unknown file'} has no id.`,
    });
  }

  const nodes = new Map();
  for (const rawNode of Array.isArray(raw?.nodes) ? raw.nodes : []) {
    const node = normalizeNode(rawNode, issues);
    if (!node) continue;
    if (nodes.has(node.id)) {
      issues.push({
        severity: SEVERITY.ERROR,
        nodeId: node.id,
        code: 'duplicate_node_id',
        message: `Duplicate node id "${node.id}".`,
      });
    }
    nodes.set(node.id, node);
  }

  const entryAction = normalizeEntryAction(raw, issues);
  if (entryAction) nodes.set(entryAction.id, entryAction);

  const declaredStart = raw?.entry_logic?.start_node || null;
  let startNodeId = entryAction ? entryAction.id : declaredStart;
  if (!startNodeId) {
    startNodeId = nodes.keys().next().value || null;
    issues.push({
      severity: SEVERITY.ERROR,
      code: 'missing_start_node',
      message: `No entry_action and no entry_logic.start_node; falling back to "${startNodeId}".`,
    });
  } else if (!entryAction && !nodes.has(startNodeId)) {
    issues.push({
      severity: SEVERITY.ERROR,
      code: 'start_node_not_found',
      message: `entry_logic.start_node "${startNodeId}" does not exist.`,
    });
  }

  const transitions = normalizeTransitions(raw, issues);

  // Cross-check every reference now, so the UI never discovers a dangling
  // pointer for the first time while someone is bleeding.
  for (const node of nodes.values()) {
    const targets = [
      ...(node.nextTarget ? [{ target: node.nextTarget, from: 'next' }] : []),
      ...node.answers.map((a) => ({ target: a.target, from: `answers.${a.key}` })),
      ...node.watchFor.map((w) => ({ target: w.target, from: `watch_for.${w.signal}` })),
    ];
    for (const { target, from } of targets) {
      if (target.kind === REF_NODE && !nodes.has(target.id)) {
        issues.push({
          severity: SEVERITY.ERROR,
          nodeId: node.id,
          code: 'dangling_node_ref',
          message: `${from} points at missing node "${target.id}".`,
        });
      }
      if (target.kind === REF_TRANSITION && !transitions[target.key]) {
        issues.push({
          severity: SEVERITY.ERROR,
          nodeId: node.id,
          code: 'undeclared_transition',
          message: `${from} uses TRANSITION:${target.key} which is not declared in transitions.`,
        });
      }
    }
    if (node.loop?.recheckNodeId && !nodes.has(node.loop.recheckNodeId)) {
      issues.push({
        severity: SEVERITY.ERROR,
        nodeId: node.id,
        code: 'dangling_loop_ref',
        message: `loop.recheck_node "${node.loop.recheckNodeId}" does not exist.`,
      });
    }
    if (node.loop?.reassessNodeId && !nodes.has(node.loop.reassessNodeId)) {
      issues.push({
        severity: SEVERITY.ERROR,
        nodeId: node.id,
        code: 'dangling_loop_ref',
        message: `loop.reassess_node "${node.loop.reassessNodeId}" does not exist.`,
      });
    }
  }

  // Shortest distance from the start node, used only for the progress bar.
  // Flows branch and loop, so this is "how far in are we", not "how much is left".
  const depths = new Map();
  const queue = [[startNodeId, 0]];
  while (queue.length) {
    const [id, depth] = queue.shift();
    const node = nodes.get(id);
    if (!node || depths.has(id)) continue;
    depths.set(id, depth);
    const refs = [
      node.next,
      ...node.answers.map((a) => a.ref),
      ...node.watchFor.map((w) => w.ref),
    ].filter((ref) => typeof ref === 'string' && !ref.startsWith('TRANSITION:') && ref !== 'END');
    for (const ref of refs) queue.push([ref, depth + 1]);
  }
  for (const node of nodes.values()) node.depth = depths.get(node.id) ?? null;
  const maxDepth = Math.max(1, ...[...depths.values()]);

  // A `skip_if` (or an escalation trigger) that reads a variable no node ever
  // writes can never fire. That is a content bug, not a crash — report it.
  const writtenVars = new Set();
  for (const node of nodes.values()) {
    for (const key of Object.keys(node.sets || {})) writtenVars.add(key);
    for (const key of Object.keys(node.increments || {})) writtenVars.add(key);
  }
  const conditionVar = (expression) => expression?.match(/[A-Za-z_][A-Za-z0-9_]*/)?.[0] || null;
  for (const node of nodes.values()) {
    const variable = conditionVar(node.skipIf);
    if (variable && !writtenVars.has(variable)) {
      issues.push({
        severity: SEVERITY.WARNING,
        nodeId: node.id,
        code: 'condition_var_never_set',
        message: `skip_if reads "${variable}", but no node in this flow ever sets it — the condition can never fire.`,
      });
    }
  }
  for (const escalation of normalizeEscalations(raw)) {
    const variable = conditionVar(escalation.trigger);
    const looksLikeExpression = /[<>=!]/.test(escalation.trigger || '');
    if (looksLikeExpression && variable && !writtenVars.has(variable)) {
      issues.push({
        severity: SEVERITY.WARNING,
        code: 'condition_var_never_set',
        message: `global escalation "${escalation.id}" reads "${variable}", which no node sets.`,
      });
    }
  }

  return {
    id: id || fileName || 'unknown_flow',
    fileName: fileName || null,
    schemaVersion: raw?.schema_version || null,
    lastReviewed: raw?.last_reviewed || null,
    name: { ar: raw?.name_ar ?? null, en: raw?.name_en ?? null },
    disclaimerRequired: raw?.medical_disclaimer_required !== false,
    emergencyNumber: raw?.emergency_number || null,
    sources: raw?.sources || {},
    neverDo: Array.isArray(raw?.never_do) ? raw.never_do : [],
    precedenceRules: Array.isArray(raw?.precedence_rules) ? raw.precedence_rules : [],
    disagreements: Array.isArray(raw?.disagreements) ? raw.disagreements : [],
    openItems: Array.isArray(raw?.open_items) ? raw.open_items : [],
    excludedUnsourced: raw?.excluded_unsourced || null,
    classification: raw?.classification || null,
    initialVars: raw?.state && typeof raw.state === 'object' ? { ...raw.state } : {},
    uncertainEntry: normalizeUncertainEntry(raw),
    entryAction,
    startNodeId,
    declaredStartNodeId: declaredStart,
    maxDepth,
    nodes,
    transitions,
    globalEscalations: normalizeEscalations(raw),
    issues,
    raw,
  };
}

export { SEVERITY, REF_NODE, REF_TRANSITION, REF_END, REF_INVALID };
