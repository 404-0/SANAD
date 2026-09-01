/**
 * The only text SANAD is allowed to answer a mid-flow question with: sentences
 * from the flow the person is currently following. Shared by the browser (which
 * sends them) and the server (which verifies the model quoted one verbatim).
 */
export function passagesForNode({ flow, node, lang = 'ar' }) {
  const pick = (pair) => (pair ? pair[lang] || pair.en || pair.ar : null);
  const passages = [];
  const push = (field, text, source) => {
    if (text && String(text).trim()) passages.push({ field, text: String(text).trim(), source: source || null });
  };

  push('current_step', pick(node?.question) || pick(node?.title));
  push('current_step_detail', pick(node?.description));
  push('current_step_hint', pick(node?.hint));

  for (const rule of flow?.neverDo || []) {
    push('never_do', lang === 'ar' ? rule.rule_ar || rule.rule_en : rule.rule_en || rule.rule_ar, rule.sources?.[0]);
  }
  for (const rule of flow?.precedenceRules || []) {
    push('rule', rule.rule, rule.sources?.[0]);
  }

  const nodes = flow?.nodes ? [...flow.nodes.values()] : [];
  for (const other of nodes) {
    if (other.id === node?.id) continue;
    push(`step:${other.id}`, pick(other.question) || pick(other.title), other.sources?.[0]);
    push(`step_detail:${other.id}`, pick(other.description), other.sources?.[0]);
  }

  return passages;
}
