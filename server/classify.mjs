import { createServer } from 'node:http';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRegistry } from '../src/engine/flowRegistry.js';
import { buildMatcherIndex, matchEmergency } from '../src/match/localMatch.js';
import {
  buildSystemPrompt,
  buildToolSchema,
  callAnthropic,
  callGroq,
  callTool,
  listGroqModels,
} from './providers.mjs';
import {
  INTERPRET_TOOL,
  ASK_TOOL,
  ASK_SCHEMA,
  buildInterpretPrompt,
  buildInterpretSchema,
  buildAskPrompt,
  verifyAnswer,
} from './participate.mjs';
import { matchCommand } from '../src/voice/commands.js';
import { loadEnv, describeMissingKey } from './loadEnv.mjs';

/**
 * SANAD classifier API (Phase 4).
 *
 *   POST /classify  { text }  ->  { flow_id, confidence, needs_clarification, clarification, candidates }
 *
 * Providers:
 *   mock       (default) — answers with the offline matcher. No key, no network.
 *   groq                 — OpenAI-compatible chat completions. Needs GROQ_API_KEY.
 *   anthropic            — Messages API. Needs ANTHROPIC_API_KEY.
 *
 * The model is never allowed to author guidance: the tool schema has no field
 * for it, the server drops anything that is not one of our ten ids, and the
 * browser re-validates independently.
 */

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const FLOW_DIR = join(ROOT, 'src', 'data', 'flows');

const ENV = loadEnv();

const rawFlows = readdirSync(FLOW_DIR)
  .filter((name) => name.endsWith('.json'))
  .map((fileName) => ({ fileName, data: JSON.parse(readFileSync(join(FLOW_DIR, fileName), 'utf8')) }));

const registry = createRegistry(rawFlows);
const index = buildMatcherIndex(registry);
const ALLOWED_IDS = registry.list().map((flow) => flow.id);

const DEFAULT_MODELS = {
  // Production on GroqCloud and documented for tool use. Override with SANAD_MODEL.
  groq: 'openai/gpt-oss-120b',
  anthropic: 'claude-sonnet-4-5',
};

const PROVIDER =
  process.env.SANAD_PROVIDER ||
  (process.env.GROQ_API_KEY ? 'groq' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'mock');
const MODEL = process.env.SANAD_MODEL || DEFAULT_MODELS[PROVIDER] || null;
const PORT = Number(process.env.SANAD_PORT || 8787);
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';

const CASE_LIST = registry
  .list()
  .map((flow) => `- ${flow.id}: ${flow.name.en} / ${flow.name.ar}`)
  .join('\n');

const SYSTEM_PROMPT = buildSystemPrompt(CASE_LIST);
const TOOL_SCHEMA = buildToolSchema(ALLOWED_IDS);

function mockClassify(text) {
  const result = matchEmergency(text, index);
  return {
    flow_id: result.flowId || null,
    confidence: result.confidence ?? 0,
    needs_clarification: result.status === 'ambiguous',
    clarification:
      result.status === 'ambiguous'
        ? { ar: 'هل يتنفس بشكل طبيعي؟', en: 'Is the person breathing normally?' }
        : null,
    candidates: (result.candidates || []).map((candidate) => candidate.flowId),
  };
}

async function classifyWithProvider(text) {
  if (PROVIDER === 'groq') {
    return callGroq({
      text,
      model: MODEL,
      apiKey: process.env.GROQ_API_KEY,
      systemPrompt: SYSTEM_PROMPT,
      toolSchema: TOOL_SCHEMA,
      baseUrl: GROQ_BASE_URL,
    });
  }
  if (PROVIDER === 'anthropic') {
    return callAnthropic({
      text,
      model: MODEL,
      apiKey: process.env.ANTHROPIC_API_KEY,
      systemPrompt: SYSTEM_PROMPT,
      toolSchema: TOOL_SCHEMA,
    });
  }
  return mockClassify(text);
}

/**
 * "I can see blood pumping out of his leg" -> the `spurting` button.
 * The model may only return one of the keys we sent, and null is always
 * allowed — the screen simply waits rather than guessing.
 */
async function interpret(text, options, stepText) {
  const keys = options.map((option) => option.key);

  if (PROVIDER === 'mock') {
    const local = matchCommand(text, options.map((option) => ({ ...option, label: { ar: option.ar, en: option.en } })));
    return { key: local?.key && keys.includes(local.key) ? local.key : null, confidence: local ? 0.8 : 0, source: 'offline' };
  }

  const raw = await callTool({
    provider: PROVIDER,
    model: MODEL,
    apiKey: process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY,
    systemPrompt: buildInterpretPrompt({ stepText, options }),
    userText: text,
    toolName: INTERPRET_TOOL,
    schema: buildInterpretSchema(keys),
    baseUrl: GROQ_BASE_URL,
  });

  const key = keys.includes(raw?.key) ? raw.key : null;
  const confidence = Math.max(0, Math.min(1, Number(raw?.confidence) || 0));
  // Below this, the app asks them to tap instead. A misread answer mid-CPR is
  // far more expensive than one repeated question.
  return { key: confidence >= 0.6 ? key : null, confidence, source: 'ai' };
}

/**
 * A question mid-flow, answered only with a sentence from the protocol they
 * are already following — verified verbatim server-side.
 */
async function ask(question, passages) {
  if (PROVIDER === 'mock') {
    const words = question.toLowerCase().split(/\s+/).filter((word) => word.length > 3);
    const hit = passages.find((passage) => words.some((word) => passage.text.toLowerCase().includes(word)));
    return hit
      ? { found: true, field: hit.field, text: hit.text, source: hit.source || null, provider: 'offline' }
      : { found: false, reason: 'not_in_protocol', provider: 'offline' };
  }

  const raw = await callTool({
    provider: PROVIDER,
    model: MODEL,
    apiKey: process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY,
    systemPrompt: buildAskPrompt({ question, passages }),
    userText: question,
    toolName: ASK_TOOL,
    schema: ASK_SCHEMA,
    baseUrl: GROQ_BASE_URL,
  });

  return { ...verifyAnswer(raw, passages), provider: 'ai' };
}

/** Server-side belt to the browser's braces: ids must be ours, nothing else passes. */
function sanitize(raw) {
  const allowed = new Set(ALLOWED_IDS);
  const flowId = allowed.has(raw?.flow_id) ? raw.flow_id : null;
  const confidence = Math.max(0, Math.min(1, Number(raw?.confidence) || 0));
  const candidates = (Array.isArray(raw?.candidates) ? raw.candidates : [])
    .filter((id) => allowed.has(id))
    .slice(0, 3);
  const question = (value) =>
    typeof value === 'string' && value.trim().length <= 140 && /[?؟]\s*$/.test(value.trim())
      ? value.trim()
      : null;
  const ar = question(raw?.clarification?.ar);
  const en = question(raw?.clarification?.en);
  return {
    flow_id: flowId,
    confidence,
    needs_clarification: raw?.needs_clarification === true,
    clarification: ar || en ? { ar: ar || en, en: en || ar } : null,
    candidates,
  };
}

const server = createServer((req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-allow-methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, provider: PROVIDER, model: MODEL, cases: ALLOWED_IDS.length }));
    return;
  }
  const route = ['/classify', '/interpret', '/ask'].find((path) => req.url.startsWith(path));
  if (req.method !== 'POST' || !route) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
    return;
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 8000) req.destroy();
  });
  req.on('end', async () => {
    try {
      const payload = JSON.parse(body || '{}');

      if (route === '/interpret') {
        const { text, options = [], stepText = '' } = payload;
        if (typeof text !== 'string' || !text.trim() || !options.length) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'bad_request' }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(await interpret(text, options, stepText)));
        return;
      }

      if (route === '/ask') {
        const { question, passages = [] } = payload;
        if (typeof question !== 'string' || !question.trim() || !passages.length) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'bad_request' }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(await ask(question, passages)));
        return;
      }

      const { text } = payload;
      if (typeof text !== 'string' || !text.trim()) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'empty_text' }));
        return;
      }
      const raw = await classifyWithProvider(text);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(sanitize(raw)));
    } catch (error) {
      // The real reason is logged for the developer, never returned to the app.
      console.error('[sanad-classifier]', error?.message || error);
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'classifier_unavailable' }));
    }
  });
});

/**
 * A retired or unavailable model fails exactly like a bad key from the app's
 * side. Check once at startup and say so plainly instead.
 */
async function checkGroqModel() {
  try {
    const models = await listGroqModels({ apiKey: process.env.GROQ_API_KEY, baseUrl: GROQ_BASE_URL });
    if (models.includes(MODEL)) {
      console.log(`  model "${MODEL}" is available on this key`);
      return;
    }
    console.warn(`  model "${MODEL}" is NOT available on this key.`);
    const suggestions = models
      .filter((id) => /llama|gpt-oss|qwen|minimax/i.test(id) && !/whisper|guard|tts/i.test(id))
      .slice(0, 8);
    if (suggestions.length) {
      console.warn(`  try one of: ${suggestions.join(', ')}`);
      console.warn('  set it with SANAD_MODEL=<id> in your .env');
    }
  } catch (error) {
    console.warn(`  could not list models (${error.message}) — check GROQ_API_KEY`);
  }
}

server.listen(PORT, async () => {
  console.log(
    `SANAD classifier on http://localhost:${PORT}  provider=${PROVIDER}  model=${MODEL || '—'}`,
  );
  if (PROVIDER === 'mock') {
    console.log('  mock provider: answers come from the offline keyword matcher, no key needed');
    if (!ENV.keys.length) console.log(`\n${describeMissingKey(ENV.searched)}\n`);
    return;
  }
  if (PROVIDER === 'groq') {
    if (!process.env.GROQ_API_KEY) {
      console.warn('  no GROQ_API_KEY found — every request will fall back to the offline matcher');
      return;
    }
    await checkGroqModel();
  }
  if (PROVIDER === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    console.warn('  no ANTHROPIC_API_KEY found — every request will fall back to the offline matcher');
  }
});
