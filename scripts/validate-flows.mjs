import { createRegistry } from '../src/engine/flowRegistry.js';
import { loadRawFlowEntries } from './loadFlowsNode.mjs';

/**
 * Structural validation of every flow file: dangling node references,
 * undeclared transitions, dead ends, missing start nodes, unreachable nodes.
 * Errors fail the run; warnings are printed for review.
 */
const registry = createRegistry(loadRawFlowEntries());

const reachableNodes = (flow) => {
  const seen = new Set();
  // Entry points: the normal start, plus anything classification.uncertain_behavior
  // can drop the user into (those nodes are reachable via an uncertain start).
  const queue = [
    flow.startNodeId,
    flow.uncertainEntry?.goto,
    ...(flow.uncertainEntry?.clarifyingNodes || []),
  ].filter(Boolean);
  while (queue.length) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    const node = flow.nodes.get(id);
    if (!node) continue;
    seen.add(id);
    const refs = [
      node.next,
      ...node.answers.map((a) => a.ref),
      ...node.watchFor.map((w) => w.ref),
      node.loop?.recheckNodeId,
      node.loop?.reassessNodeId,
    ].filter(Boolean);
    for (const ref of refs) {
      if (typeof ref === 'string' && !ref.startsWith('TRANSITION:') && ref !== 'END') queue.push(ref);
    }
  }
  return seen;
};

let unreachableCount = 0;
console.log(`\nSANAD flow validation — ${registry.list().length} flows\n${'='.repeat(52)}`);

for (const flow of registry.list()) {
  const reachable = reachableNodes(flow);
  const unreachable = [...flow.nodes.keys()].filter((id) => !reachable.has(id));
  unreachableCount += unreachable.length;
  const flowIssues = registry.issues.filter((issue) => issue.flowId === flow.id);
  const status = flowIssues.some((i) => i.severity === 'error') ? 'FAIL' : 'ok  ';
  console.log(
    `${status} ${flow.id.padEnd(26)} nodes=${String(flow.nodes.size).padStart(2)} ` +
      `transitions=${Object.keys(flow.transitions).length} ` +
      `reachable=${reachable.size}/${flow.nodes.size}`,
  );
  for (const issue of flowIssues) {
    console.log(`      [${issue.severity}] ${issue.code}${issue.nodeId ? ` @${issue.nodeId}` : ''}: ${issue.message}`);
  }
  if (unreachable.length) {
    console.log(`      [note] unreachable from start: ${unreachable.join(', ')}`);
  }
}

console.log(`\nErrors: ${registry.errors.length}   Warnings: ${registry.warnings.length}   Unreachable nodes: ${unreachableCount}`);
if (registry.missingFlowIds.size) {
  console.log(`Referenced-but-missing flows: ${[...registry.missingFlowIds].join(', ')}`);
}

if (registry.errors.length) {
  console.error('\nFAILED — structural errors above must be fixed.');
  process.exit(1);
}
console.log('\nPASS — every reference resolves.\n');
