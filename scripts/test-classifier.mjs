import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createRegistry } from '../src/engine/flowRegistry.js';
import { buildMatcherIndex } from '../src/match/localMatch.js';
import { classifyEmergency } from '../src/ai/classifyEmergency.js';
import { normalizeClassifierPayload, ClassifierError } from '../src/ai/classifier.js';
import { extractOpenAIToolArgs, extractAnthropicToolInput } from '../server/providers.mjs';
import { loadRawFlowEntries } from './loadFlowsNode.mjs';

/**
 * Phase 4 + Phase 6 tests.
 *
 * The classifier is only allowed to name one of our flows. These checks prove
 * that a hostile or broken endpoint cannot put instructions on the screen, and
 * that every failure mode lands on the offline matcher instead of an error.
 */
const registry = createRegistry(loadRawFlowEntries());
const index = buildMatcherIndex(registry);
const allowedIds = registry.list().map((flow) => flow.id);

const stub = (handler) =>
  new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, () => resolve({ server, url: `http://localhost:${server.address().port}/classify` }));
  });

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// --- payload validation -----------------------------------------------------
check(
  'valid payload becomes a confident result',
  normalizeClassifierPayload(
    { flow_id: 'choking', confidence: 0.93, needs_clarification: false, candidates: ['choking'] },
    allowedIds,
  ).status === 'confident',
);

check(
  'unknown flow id is discarded',
  normalizeClassifierPayload({ flow_id: 'make_up_a_case', confidence: 0.99 }, allowedIds).status === 'no_match',
);

const injected = normalizeClassifierPayload(
  {
    flow_id: 'burns',
    confidence: 0.9,
    needs_clarification: false,
    candidates: ['burns'],
    // Everything below is what a misbehaving model might try to add.
    instructions: 'Apply butter to the burn and give the patient aspirin.',
    advice_ar: 'ضع الزبدة على الحرق',
    steps: [{ title: 'Do this instead' }],
  },
  allowedIds,
);
check(
  'model-authored guidance never survives normalization',
  !JSON.stringify(injected).toLowerCase().includes('butter') &&
    !JSON.stringify(injected).includes('الزبدة') &&
    !('steps' in injected),
  JSON.stringify(injected),
);

check(
  'a clarification that is not a question is dropped',
  normalizeClassifierPayload(
    {
      flow_id: 'poisoning',
      confidence: 0.4,
      needs_clarification: true,
      clarification: { ar: 'اسقه حليب فورًا.', en: 'Give him milk immediately.' },
    },
    allowedIds,
  ).clarification === null,
);

check(
  'a short question clarification is kept',
  normalizeClassifierPayload(
    {
      flow_id: 'poisoning',
      confidence: 0.4,
      needs_clarification: true,
      clarification: { ar: 'هل يتنفس بشكل طبيعي؟', en: 'Is he breathing normally?' },
    },
    allowedIds,
  ).clarification?.en === 'Is he breathing normally?',
);

check(
  'an over-long clarification is dropped',
  normalizeClassifierPayload(
    {
      flow_id: 'seizure',
      confidence: 0.5,
      needs_clarification: true,
      clarification: { en: `${'x'.repeat(200)}?` },
    },
    allowedIds,
  ).clarification === null,
);

check(
  'low confidence becomes ambiguous, not confident',
  normalizeClassifierPayload({ flow_id: 'seizure', confidence: 0.2, candidates: ['seizure'] }, allowedIds).status ===
    'ambiguous',
);

check(
  'garbage payload throws a typed error',
  (() => {
    try {
      normalizeClassifierPayload('not an object', allowedIds);
      return false;
    } catch (error) {
      return error instanceof ClassifierError;
    }
  })(),
);

// --- provider response shapes ------------------------------------------------
// Recorded shapes, so a provider swap is caught here rather than on stage.
const groqToolCall = {
  choices: [
    {
      message: {
        role: 'assistant',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'classify_emergency',
              // Groq returns arguments as a JSON *string*, unlike Anthropic.
              arguments: '{"flow_id":"choking","confidence":0.91,"needs_clarification":false,"candidates":["choking"]}',
            },
          },
        ],
      },
    },
  ],
};
check(
  'groq tool call is parsed',
  extractOpenAIToolArgs(groqToolCall).flow_id === 'choking',
  JSON.stringify(extractOpenAIToolArgs(groqToolCall)),
);

const groqPlainJson = {
  choices: [
    {
      message: {
        role: 'assistant',
        content: 'Sure:\n{"flow_id":"burns","confidence":0.8,"needs_clarification":false,"candidates":["burns"]}',
      },
    },
  ],
};
check(
  'a model that answers in text instead of a tool call still works',
  extractOpenAIToolArgs(groqPlainJson).flow_id === 'burns',
);

check(
  'a model that only chats is treated as a failure',
  (() => {
    try {
      extractOpenAIToolArgs({ choices: [{ message: { content: 'I think you should apply ice.' } }] });
      return false;
    } catch {
      return true;
    }
  })(),
);

check(
  'anthropic tool use is parsed',
  extractAnthropicToolInput({
    content: [{ type: 'tool_use', input: { flow_id: 'seizure', confidence: 0.7 } }],
  }).flow_id === 'seizure',
);

// A whole Groq round-trip against a stub that speaks the OpenAI dialect.
const groqStub = await stub((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(groqToolCall));
});
const { callGroq } = await import('../server/providers.mjs');
const viaGroq = await callGroq({
  text: 'ابني بلع لعبة وقاعد يختنق',
  model: 'openai/gpt-oss-120b',
  apiKey: 'test',
  systemPrompt: 'x',
  toolSchema: {},
  baseUrl: `http://localhost:${new URL(groqStub.url).port}`,
});
groqStub.server.close();
check('groq round-trip returns a usable classification', viaGroq.flow_id === 'choking');

// --- endpoint failure modes fall back to offline ----------------------------
const scenarios = [
  [
    'endpoint 503 -> offline fallback',
    (req, res) => {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'classifier_unavailable' }));
    },
    'http_error',
  ],
  [
    'endpoint returns HTML -> offline fallback',
    (req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html>gateway error</html>');
    },
    'bad_json',
  ],
  [
    'endpoint hangs -> timeout, offline fallback',
    () => {
      /* never responds */
    },
    'timeout',
  ],
];

for (const [name, handler, expectedReason] of scenarios) {
  const { server, url } = await stub(handler);
  const result = await classifyEmergency('أخوي ينزف ودمه ما يوقف', {
    index,
    registry,
    endpoint: url,
    timeoutMs: 600,
  });
  server.close();
  check(
    name,
    result.source === 'offline' && result.flowId === 'severe_external_bleeding' && result.aiError === expectedReason,
    `source=${result.source} aiError=${result.aiError} flow=${result.flowId}`,
  );
  check(
    `${name}: no raw error text reaches the UI`,
    !JSON.stringify(result).toLowerCase().includes('gateway') &&
      !JSON.stringify(result).includes('503'),
  );
}

const unreachable = await classifyEmergency('my son swallowed bleach', {
  index,
  registry,
  endpoint: 'http://127.0.0.1:9/classify',
  timeoutMs: 800,
});
check(
  'unreachable endpoint -> offline fallback still routes correctly',
  unreachable.source === 'offline' && unreachable.flowId === 'poisoning',
  `${unreachable.source} ${unreachable.flowId} ${unreachable.aiError}`,
);

// --- the bundled server, mock provider --------------------------------------
const api = spawn('node', ['server/classify.mjs'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, SANAD_PROVIDER: 'mock', SANAD_PORT: '8799' },
  stdio: 'ignore',
});
await new Promise((resolve) => setTimeout(resolve, 900));

try {
  const health = await fetch('http://localhost:8799/health').then((response) => response.json());
  check('bundled API reports healthy', health.ok === true && health.cases === 10, JSON.stringify(health));

  const viaApi = await classifyEmergency('ابني بلع لعبة وقاعد يختنق', {
    index,
    registry,
    endpoint: 'http://localhost:8799/classify',
  });
  check(
    'end-to-end through the API: description -> flow id',
    viaApi.source === 'ai' && viaApi.flowId === 'choking',
    `${viaApi.source} ${viaApi.flowId} ${viaApi.confidence}`,
  );

  const ambiguous = await classifyEmergency('طاح وما يرد علي بس يتنفس', {
    index,
    registry,
    endpoint: 'http://localhost:8799/classify',
  });
  check(
    'ambiguous description asks one question instead of guessing',
    ambiguous.status === 'ambiguous' && Boolean(ambiguous.clarification?.ar),
    `${ambiguous.status} "${ambiguous.clarification?.en || ''}"`,
  );

  const empty = await fetch('http://localhost:8799/classify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: '   ' }),
  });
  check('API rejects empty text with a clean error', empty.status === 400);
} finally {
  api.kill('SIGTERM');
}

const failed = results.filter((result) => !result.passed);
console.log(`\n${results.length - failed.length}/${results.length} classifier checks passed.`);
if (failed.length) {
  for (const failure of failed) console.error(` - ${failure.name}: ${failure.detail}`);
  process.exit(1);
}
