import { normalizeFlow, SEVERITY } from './normalizeFlow.js';

/**
 * The registry is the only thing that knows which flows exist. It is built from
 * raw JSON that is injected by the caller, so the exact same code runs in the
 * browser (Vite glob import) and in the Node test scripts (fs read).
 */
export function createRegistry(rawEntries) {
  const flows = new Map();
  const registryIssues = [];

  for (const entry of rawEntries) {
    const flow = normalizeFlow(entry.data, { fileName: entry.fileName });
    if (flows.has(flow.id)) {
      registryIssues.push({
        severity: SEVERITY.ERROR,
        flowId: flow.id,
        code: 'duplicate_flow_id',
        message: `Two files declare flow id "${flow.id}".`,
      });
    }
    flows.set(flow.id, flow);
  }

  // Which flows are referenced by a transition but not shipped yet?
  const missingFlowIds = new Set();
  for (const flow of flows.values()) {
    for (const transition of Object.values(flow.transitions)) {
      if (!flows.has(transition.targetFlowId)) {
        missingFlowIds.add(transition.targetFlowId);
        registryIssues.push({
          severity: SEVERITY.WARNING,
          flowId: flow.id,
          code: 'missing_target_flow',
          message: `TRANSITION:${transition.key} targets flow "${transition.targetFlowId}", which is not loaded. The engine will show the unavailable-flow screen.`,
        });
      }
    }
  }

  const allIssues = [
    ...registryIssues,
    ...[...flows.values()].flatMap((flow) =>
      flow.issues.map((issue) => ({ ...issue, flowId: flow.id })),
    ),
  ];

  return {
    flows,
    missingFlowIds,
    issues: allIssues,
    errors: allIssues.filter((i) => i.severity === SEVERITY.ERROR),
    warnings: allIssues.filter((i) => i.severity === SEVERITY.WARNING),
    has: (flowId) => flows.has(flowId),
    get: (flowId) => flows.get(flowId) || null,
    list: () => [...flows.values()],
  };
}
