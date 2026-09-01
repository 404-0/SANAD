/**
 * Facts about the casualty that stay true across flows.
 *
 * A choking infant who becomes unresponsive should not be asked "is this an
 * adult, a child, or an infant?" again in the middle of starting CPR. The flow
 * JSON cannot express that — each flow only knows its own state — so the
 * cross-flow memory lives here.
 *
 * Two mechanisms, both deliberately explicit and auditable:
 *
 *   GROUPS   a question whose answers are exactly this set both fills and is
 *            filled by the shared value (cardiac_arrest_cpr.q_age_group).
 *   CAPTURE  a named node whose own wording implies one of those values, so
 *            answering it teaches the shared value without being able to
 *            answer it in return (choking's "is the casualty an infant?" —
 *            "no" rules out infant but does not tell us adult vs child).
 *
 * Every assumption made from this is shown to the user with a one-tap undo.
 */

export const GROUPS = [
  {
    key: 'ageGroup',
    answers: ['adult', 'child', 'infant'],
    label: {
      adult: { ar: 'بالغ', en: 'adult' },
      child: { ar: 'طفل', en: 'child' },
      infant: { ar: 'رضيع', en: 'infant' },
    },
  },
];

export const CAPTURE = [
  {
    // "Is the casualty an infant under 1 year old?"
    flowId: 'choking',
    nodeId: 'q_age_group',
    group: 'ageGroup',
    map: { yes: 'infant' },
  },
];

export const groupByKey = (key) => GROUPS.find((group) => group.key === key) || null;

/** The group a node can be auto-answered from, if any. */
export const groupForNode = (node) => {
  if (!node?.answers?.length) return null;
  return GROUPS.find((group) => node.answers.every((answer) => group.answers.includes(answer.key))) || null;
};

/** What answering this node teaches the shared context, if anything. */
export const captureFromNode = (flowId, node, answerKey) => {
  const group = groupForNode(node);
  if (group && group.answers.includes(answerKey)) return { key: group.key, value: answerKey };

  const rule = CAPTURE.find((item) => item.flowId === flowId && item.nodeId === node?.id);
  const mapped = rule?.map?.[answerKey];
  return mapped ? { key: rule.group, value: mapped } : null;
};
