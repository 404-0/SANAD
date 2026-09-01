import { createRegistry } from '../src/engine/flowRegistry.js';
import { buildMatcherIndex, matchEmergency } from '../src/match/localMatch.js';
import { loadRawFlowEntries } from './loadFlowsNode.mjs';

/**
 * The offline matcher only has to pick the right flow. Phrases below are the
 * kind of thing a panicking person actually types, in Iraqi Arabic and English.
 */
const registry = createRegistry(loadRawFlowEntries());
const index = buildMatcherIndex(registry);

const CASES = [
  ['أخوي ينزف ودمه ما يوقف', 'severe_external_bleeding'],
  ['اجاه جرح بالسكين وطلع دم واجد', 'severe_external_bleeding'],
  ['my brother is bleeding and it won’t stop', 'severe_external_bleeding'],
  ['ابني بلع لعبة وقاعد يختنق', 'choking'],
  ['اللقمة علگت بحلگه وما يطلع صوت', 'choking'],
  ['he is choking on food', 'choking'],
  ['طاح وما يرد علي بس يتنفس', 'unresponsive_breathing'],
  ['مغمى عليه وما اكدر اصحيه', 'unresponsive_breathing'],
  ['she collapsed and is unconscious but breathing', 'unresponsive_breathing'],
  ['ما دا يتنفس وصدره ما يتحرك', 'cardiac_arrest_cpr'],
  ['he collapsed and is not breathing, only gasping', 'cardiac_arrest_cpr'],
  ['بنتي انحرقت بماي حار', 'burns'],
  ['my hand got burned on the stove', 'burns'],
  ['الكهرباء ضربته وهو يصلح السلك', 'electrical_shock'],
  ['he got an electric shock from the socket', 'electrical_shock'],
  ['اخته دا تتشنج وجسمها يهتز', 'seizure'],
  ['he is having a seizure', 'seizure'],
  ['طاح من الدرج وايده انكسرت', 'fracture_serious_injury'],
  ['i think his leg is broken after the fall', 'fracture_serious_injury'],
  ['اشتغل بالشمس وصار دايخ ومتعب من الحر', 'heat_illness'],
  ['he has heatstroke from working in the sun', 'heat_illness'],
  ['بلع حبوب دواء واجد', 'poisoning'],
  ['my son swallowed bleach', 'poisoning'],
  ['شم غاز بالمطبخ', 'poisoning'],
];

let passed = 0;
const failures = [];

for (const [phrase, expected] of CASES) {
  const result = matchEmergency(phrase, index);
  const ok = result.flowId === expected && result.status !== 'no_match';
  if (ok) passed += 1;
  else failures.push({ phrase, expected, got: result.flowId || result.status, result });
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${String(result.status).padEnd(9)} ${String(result.flowId || '-').padEnd(26)} ${phrase}`,
  );
}

// Text that should NOT confidently route anywhere.
const VAGUE = ['ساعدني', 'something happened', 'شنو اسوي'];
let vagueOk = 0;
for (const phrase of VAGUE) {
  const result = matchEmergency(phrase, index);
  const ok = result.status !== 'confident';
  if (ok) vagueOk += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  vague -> ${result.status.padEnd(9)} ${phrase}`);
}

console.log(`\n${passed}/${CASES.length} phrases routed correctly; ${vagueOk}/${VAGUE.length} vague inputs correctly not auto-started.`);

if (failures.length || vagueOk !== VAGUE.length) {
  for (const failure of failures) {
    console.error(
      ` - "${failure.phrase}" expected ${failure.expected}, got ${failure.got} ` +
        `(candidates: ${failure.result.candidates.map((c) => `${c.flowId}:${c.score.toFixed(2)}`).join(', ')})`,
    );
  }
  process.exit(1);
}
