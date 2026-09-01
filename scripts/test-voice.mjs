import { createRegistry } from '../src/engine/flowRegistry.js';
import { matchCommand, optionsForNode } from '../src/voice/commands.js';
import { loadRawFlowEntries } from './loadFlowsNode.mjs';

/**
 * Hands-free is only safe if it refuses to guess. These check both halves:
 * the commands it must understand, and the ones it must NOT act on.
 */
const registry = createRegistry(loadRawFlowEntries());
const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const AR = {
  yes: { ar: 'نعم', en: 'Yes' },
  no: { ar: 'لا', en: 'No' },
  no_or_gasping: { ar: 'لا — أو لهاث متقطع فقط', en: 'No — or only gasping' },
  adult: { ar: 'بالغ', en: 'Adult' },
  child: { ar: 'طفل فوق سنة', en: 'Child over 1 year' },
  infant: { ar: 'رضيع أقل من سنة', en: 'Infant under 1 year' },
  limb: { ar: 'ذراع أو ساق', en: 'Arm or leg' },
  junctional_or_torso: { ar: 'الرقبة أو الجذع', en: 'Neck or torso' },
  amputation: { ar: 'جزء مقطوع من الجسم', en: 'A body part is severed' },
};

const opts = (keys) =>
  keys.map((key) => ({ kind: 'answer', key, ref: `node_${key}`, label: AR[key] }));

const nextOnly = [{ kind: 'next', key: 'next', ref: 'the_next_node', label: { ar: 'تم', en: 'Done' } }];

// --- the words people actually say ------------------------------------------
for (const phrase of ['تم', 'خلصت', 'سويتها', 'اوكي', 'done', 'next', 'ok']) {
  const result = matchCommand(phrase, nextOnly);
  check(`"${phrase}" advances the step`, result?.action === 'choose' && result.ref === 'the_next_node');
}

for (const phrase of ['نعم', 'ايه', 'اكيد', 'yes']) {
  const result = matchCommand(phrase, opts(['yes', 'no']));
  check(`"${phrase}" answers yes`, result?.key === 'yes', result?.reason);
}

for (const phrase of ['لا', 'كلا', 'no']) {
  const result = matchCommand(phrase, opts(['yes', 'no']));
  check(`"${phrase}" answers no`, result?.key === 'no', result?.reason);
}

check(
  'saying the option out loud picks it',
  matchCommand('ذراع أو ساق', opts(['limb', 'junctional_or_torso', 'amputation']))?.key === 'limb',
);
check(
  'saying "بالغ" picks the adult branch',
  matchCommand('بالغ', opts(['adult', 'child', 'infant']))?.key === 'adult',
);
check(
  'English works the same way',
  matchCommand('arm or leg', opts(['limb', 'junctional_or_torso', 'amputation']))?.key === 'limb',
);
check('"اثنين" picks the second option', matchCommand('اثنين', opts(['adult', 'child', 'infant']))?.key === 'child');
check('a bare digit works too', matchCommand('3', opts(['adult', 'child', 'infant']))?.key === 'infant');
check('"ارجع" goes back', matchCommand('ارجع', nextOnly)?.action === 'back');
check('"عيد" repeats the step', matchCommand('كرر', nextOnly)?.action === 'repeat');
check('"اتصل" reaches for the phone', matchCommand('اتصل بالاسعاف', nextOnly)?.action === 'call');

// --- and the ones it must refuse --------------------------------------------
check(
  'a bare "لا" never selects "no, only gasping"',
  matchCommand('لا', opts(['yes', 'no_or_gasping']))?.key !== 'no_or_gasping',
  JSON.stringify(matchCommand('لا', opts(['yes', 'no_or_gasping']))),
);
check(
  'the full gasping answer still works when actually said',
  matchCommand('لا لهاث متقطع فقط', opts(['yes', 'no_or_gasping']))?.key === 'no_or_gasping',
);
check('background chatter does nothing', matchCommand('شنو صار هنا يا جماعة الخير', opts(['yes', 'no'])) === null);
check('empty audio does nothing', matchCommand('', opts(['yes', 'no'])) === null);
check('silence-ish noise does nothing', matchCommand('اه اممم', opts(['yes', 'no'])) === null);
check(
  'a "yes" with no yes option on screen does nothing',
  matchCommand('نعم', opts(['limb', 'junctional_or_torso'])) === null,
);

// --- options are read straight off the real flows ---------------------------
const cpr = registry.get('cardiac_arrest_cpr');
const ageOptions = optionsForNode(cpr.nodes.get('q_age_group'), {
  answerLabel: (answer) => AR[answer.key] || { ar: answer.key, en: answer.key },
});
check('options come from the flow node itself', ageOptions.length === 3 && ageOptions[0].key === 'adult');
check(
  'saying "رضيع" on the real CPR question routes to the infant branch',
  matchCommand('رضيع', ageOptions)?.ref === 'infant_initial_breaths',
  JSON.stringify(matchCommand('رضيع', ageOptions)),
);

const instruction = optionsForNode(cpr.nodes.get('adult_cpr'));
check('an instruction screen exposes exactly one voice option', instruction.length === 1 && instruction[0].kind === 'next');

const failed = results.filter((result) => !result.passed);
console.log(`\n${results.length - failed.length}/${results.length} voice checks passed.`);
if (failed.length) {
  for (const failure of failed) console.error(` - ${failure.name}: ${failure.detail}`);
  process.exit(1);
}
