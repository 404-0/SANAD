/**
 * Tiny, deliberately dumb expression evaluator for `skip_if` and
 * `global_escalations[].trigger`.
 *
 * Supported grammar (that is ALL of it):
 *   expr   := term (('&&' | '||') term)*
 *   term   := ident op literal
 *   op     := '==' | '!=' | '>=' | '<=' | '>' | '<'
 *   literal:= null | true | false | number | 'quoted' | bare_word
 *
 * Anything it cannot parse returns { ok: false }. Callers MUST treat an
 * unparseable condition as "unknown" and fall back to the safe behaviour
 * (ask the question / do not auto-escalate) rather than guessing.
 */

const OPS = ['>=', '<=', '==', '!=', '>', '<'];

function parseLiteral(token) {
  const t = token.trim();
  if (t === 'null') return { ok: true, value: null };
  if (t === 'true') return { ok: true, value: true };
  if (t === 'false') return { ok: true, value: false };
  if (/^-?\d+(\.\d+)?$/.test(t)) return { ok: true, value: Number(t) };
  const quoted = t.match(/^'(.*)'$/) || t.match(/^"(.*)"$/);
  if (quoted) return { ok: true, value: quoted[1] };
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)) return { ok: true, value: t };
  return { ok: false };
}

function compare(left, op, right) {
  switch (op) {
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    case '>':
      return Number(left) > Number(right);
    case '<':
      return Number(left) < Number(right);
    case '>=':
      return Number(left) >= Number(right);
    case '<=':
      return Number(left) <= Number(right);
    default:
      return false;
  }
}

function evaluateTerm(term, vars) {
  const op = OPS.find((candidate) => term.includes(candidate));
  if (!op) return { ok: false, reason: `no comparison operator in "${term}"` };
  const [rawLeft, ...restRight] = term.split(op);
  const name = rawLeft.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    return { ok: false, reason: `left side "${name}" is not a state variable` };
  }
  if (!(name in vars)) {
    return { ok: false, reason: `unknown state variable "${name}"` };
  }
  const literal = parseLiteral(restRight.join(op));
  if (!literal.ok) return { ok: false, reason: `unparseable literal in "${term}"` };
  return { ok: true, value: compare(vars[name], op, literal.value) };
}

export function evaluateCondition(expression, vars = {}) {
  if (typeof expression !== 'string' || !expression.trim()) {
    return { ok: false, reason: 'empty condition' };
  }
  // Split on && / || keeping the operators, evaluated strictly left to right.
  const tokens = expression.split(/(\|\||&&)/).map((t) => t.trim()).filter(Boolean);
  let result = null;
  let pendingOp = null;
  for (const token of tokens) {
    if (token === '&&' || token === '||') {
      pendingOp = token;
      continue;
    }
    const term = evaluateTerm(token, vars);
    if (!term.ok) return term;
    if (result === null) result = term.value;
    else if (pendingOp === '&&') result = result && term.value;
    else if (pendingOp === '||') result = result || term.value;
    else return { ok: false, reason: 'missing logical operator' };
  }
  if (result === null) return { ok: false, reason: 'no terms' };
  return { ok: true, value: result };
}

/** True only when the condition parses AND evaluates truthy. */
export function isConditionTrue(expression, vars) {
  const outcome = evaluateCondition(expression, vars);
  return outcome.ok === true && outcome.value === true;
}
