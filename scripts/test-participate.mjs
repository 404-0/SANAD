import { spawn } from 'node:child_process';
import { createRegistry } from '../src/engine/flowRegistry.js';
import { passagesForNode } from '../src/engine/passages.js';
import { verifyAnswer } from '../server/participate.mjs';
import { interpretAnswer, askSanad, looksLikeQuestion } from '../src/ai/participate.js';
import { optionsForNode } from '../src/voice/commands.js';
import { ANSWER_LABELS, humanize } from '../src/i18n/labels.js';
import { loadRawFlowEntries } from './loadFlowsNode.mjs';

/**
 * The AI now takes part during a case. These tests are about the boundary that
 * makes that safe: it may point at a sentence from the loaded protocol, and it
 * may press a button that is already on the screen. Nothing else.
 */
const registry = createRegistry(loadRawFlowEntries());
const bleeding = registry.get('severe_external_bleeding');
const entryNode = bleeding.nodes.get('__entry_action__');
const woundSite = bleeding.nodes.get('q_wound_site');

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const labelled = (node) =>
  optionsForNode(node, {
    answerLabel: (answer) => ({
      ar: answer.label?.ar || ANSWER_LABELS[answer.key]?.ar || humanize(answer.key),
      en: answer.label?.en || ANSWER_LABELS[answer.key]?.en || humanize(answer.key),
    }),
  });

// --- the verbatim guarantee --------------------------------------------------
const passages = passagesForNode({ flow: bleeding, node: entryNode, lang: 'ar' });
check('passages are built from the flow', passages.length > 5 && passages.every((p) => p.text));

const realSentence = passages.find((p) => p.field === 'never_do');
check(
  'a genuine quote is accepted',
  verifyAnswer({ found: true, passage_index: passages.indexOf(realSentence), quote: realSentence.text }, passages).found,
);

check(
  'a quote with the wrong index is still accepted if it is genuine',
  verifyAnswer({ found: true, passage_index: 999, quote: realSentence.text }, passages).text === realSentence.text,
);

check(
  'invented medical advice is rejected',
  verifyAnswer(
    { found: true, passage_index: 0, quote: 'ضع الثلج مباشرة على الجرح لمدة عشر دقائق' },
    passages,
  ).found === false,
);

check(
  'a plausible paraphrase of a real rule is still rejected',
  verifyAnswer(
    // Real rule says never remove an embedded object; this flips it.
    { found: true, passage_index: 0, quote: 'انزع الجسم المغروس من الجرح بهدوء' },
    passages,
  ).found === false,
);

check(
  'the answer returned is our copy, not the model’s',
  (() => {
    const tampered = `${realSentence.text} وأعطه أسبرين`;
    const verdict = verifyAnswer({ found: true, passage_index: 0, quote: tampered }, passages);
    return verdict.found === false;
  })(),
);

check('found=false passes through as not covered', verifyAnswer({ found: false }, passages).found === false);
check('an empty quote is rejected', verifyAnswer({ found: true, quote: '   ' }, passages).found === false);

// --- question vs answer ------------------------------------------------------
for (const phrase of ['هل أحط ثلج؟', 'شكد أستمر بالضغط', 'اكدر أشيل الضماد؟', 'can I use ice?', 'why is he cold']) {
  check(`"${phrase}" is treated as a question`, looksLikeQuestion(phrase));
}
for (const phrase of ['الدم يفور من رجله', 'خلصت', 'نعم', 'his arm is bleeding']) {
  check(`"${phrase}" is treated as an answer`, !looksLikeQuestion(phrase));
}

// --- offline behaviour (no endpoint) ----------------------------------------
const offlineInterpret = await interpretAnswer('ذراع أو ساق', {
  node: woundSite,
  options: labelled(woundSite),
  endpoint: null,
});
check(
  'without a network, saying the option still works',
  offlineInterpret.action === 'choose' && offlineInterpret.key === 'limb',
  JSON.stringify(offlineInterpret),
);

const offlineNonsense = await interpretAnswer('شنو هذا الحچي', {
  node: woundSite,
  options: labelled(woundSite),
  endpoint: null,
});
check('unrelated speech does nothing offline', offlineNonsense.action !== 'choose');

const offlineAsk = await askSanad('هل أنزع الجسم المغروس؟', {
  flow: bleeding,
  node: entryNode,
  endpoint: null,
});
check(
  'offline questions are answered from the protocol',
  offlineAsk.found && /مغروس/.test(offlineAsk.text),
  offlineAsk.found ? offlineAsk.text : offlineAsk.reason,
);

const offlineUnknown = await askSanad('شكد سعر سيارة تويوتا؟', {
  flow: bleeding,
  node: entryNode,
  endpoint: null,
});
check('a question the protocol cannot answer is refused', offlineUnknown.found === false);

// --- through the real server (mock provider) ---------------------------------
const api = spawn('node', ['server/classify.mjs'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, SANAD_PROVIDER: 'mock', SANAD_PORT: '8801' },
  stdio: 'ignore',
});
await new Promise((resolve) => setTimeout(resolve, 900));

try {
  const endpoint = 'http://localhost:8801/classify';

  const viaApi = await interpretAnswer('ذراع أو ساق', {
    node: woundSite,
    options: labelled(woundSite),
    endpoint,
  });
  check('interpret works through the API', viaApi.action === 'choose' && viaApi.key === 'limb');

  const asked = await askSanad('هل أنزع الجسم المغروس؟', { flow: bleeding, node: entryNode, endpoint });
  check('ask works through the API', asked.found === true, asked.found ? asked.text.slice(0, 40) : asked.reason);

  const refused = await askSanad('شكد سعر الدولار اليوم؟', { flow: bleeding, node: entryNode, endpoint });
  check('the API refuses what the protocol does not cover', refused.found === false);

  const badRequest = await fetch('http://localhost:8801/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: '', passages: [] }),
  });
  check('the API rejects an empty question cleanly', badRequest.status === 400);
} finally {
  api.kill('SIGTERM');
}

const failed = results.filter((result) => !result.passed);
console.log(`\n${results.length - failed.length}/${results.length} participation checks passed.`);
if (failed.length) {
  for (const failure of failed) console.error(` - ${failure.name}: ${failure.detail}`);
  process.exit(1);
}
