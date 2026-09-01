/**
 * Classifier providers.
 *
 * Every provider answers the same question — which flow id, how confident,
 * and optionally one clarifying question — by calling a single tool whose
 * schema has no field for medical guidance. The extractors below are pure so
 * they can be tested against recorded response shapes without a key.
 */

export function buildSystemPrompt(caseList) {
  return `You are the case classifier for SANAD, an emergency first-aid guide used in Iraq.

Your ONLY job is to read a bystander's description of an emergency (Iraqi Arabic, Modern Standard Arabic, or English) and decide which of these pre-written, medically reviewed flows should be opened:

${caseList}

Absolute rules:
- NEVER give first-aid advice, instructions, reassurance or medical opinion. The app has verified instructions; yours would be unverified and could kill someone.
- Answer only by calling the classify_emergency tool.
- If the description does not clearly indicate one case, set needs_clarification to true and provide ONE short question (under 120 characters, ending in a question mark) that would separate the top candidates. The question must ask about an observation — for example whether the person is breathing normally — never tell the user to do anything.
- If the description matches nothing on the list, return flow_id null.
- Someone who is unresponsive AND not breathing normally (or only gasping) is cardiac_arrest_cpr. Unresponsive but breathing normally is unresponsive_breathing. If breathing status is unstated, treat it as needing clarification.`;
}

export const TOOL_NAME = 'classify_emergency';

export function buildToolSchema(allowedIds) {
  return {
    type: 'object',
    properties: {
      flow_id: {
        type: ['string', 'null'],
        enum: [...allowedIds, null],
        description: 'The best matching flow id, or null if nothing matches.',
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      needs_clarification: { type: 'boolean' },
      clarification: {
        type: ['object', 'null'],
        properties: { ar: { type: 'string' }, en: { type: 'string' } },
        description: 'One short observation question ending in a question mark. No instructions.',
      },
      candidates: { type: 'array', items: { type: 'string', enum: allowedIds }, maxItems: 3 },
    },
    required: ['flow_id', 'confidence', 'needs_clarification', 'candidates'],
  };
}

/** Anthropic Messages API: the arguments arrive already parsed. */
export function extractAnthropicToolInput(body) {
  const toolUse = (body?.content || []).find((block) => block.type === 'tool_use');
  if (!toolUse?.input) throw new Error('model did not call the classify tool');
  return toolUse.input;
}

/**
 * OpenAI-compatible chat completions (Groq, and anything else speaking that
 * dialect): arguments come back as a JSON *string*. Some models answer in the
 * message body instead of a tool call, so that is accepted too.
 */
export function extractOpenAIToolArgs(body) {
  const message = body?.choices?.[0]?.message;
  const call = message?.tool_calls?.[0];

  if (call?.function?.arguments) {
    const raw = call.function.arguments;
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error('tool arguments were not valid JSON');
    }
  }

  // Fallback: a plain JSON answer in the content.
  const content = typeof message?.content === 'string' ? message.content.trim() : '';
  if (content) {
    const json = content.startsWith('{') ? content : content.slice(content.indexOf('{'));
    try {
      return JSON.parse(json);
    } catch {
      throw new Error('model replied with text instead of the classify tool');
    }
  }

  throw new Error('model did not call the classify tool');
}

export async function callAnthropic({ text, model, apiKey, systemPrompt, toolSchema, fetchImpl }) {
  const doFetch = fetchImpl || fetch;
  const response = await doFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      system: systemPrompt,
      tools: [{ name: TOOL_NAME, description: 'Report which SANAD flow matches.', input_schema: toolSchema }],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: text.slice(0, 1000) }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`anthropic ${response.status}: ${detail.slice(0, 200)}`);
  }
  return extractAnthropicToolInput(await response.json());
}

export async function callGroq({ text, model, apiKey, systemPrompt, toolSchema, baseUrl, fetchImpl }) {
  const doFetch = fetchImpl || fetch;
  const url = `${baseUrl || 'https://api.groq.com/openai/v1'}/chat/completions`;
  const response = await doFetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_completion_tokens: 512,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text.slice(0, 1000) },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: TOOL_NAME,
            description: 'Report which SANAD emergency flow matches the description.',
            parameters: toolSchema,
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: TOOL_NAME } },
      parallel_tool_calls: false,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`groq ${response.status}: ${detail.slice(0, 200)}`);
  }
  return extractOpenAIToolArgs(await response.json());
}

/**
 * Asks the provider which models the key can actually use. A model name that
 * is retired or not on your plan fails exactly like a bad key from the app's
 * side, so it is worth catching at startup rather than mid-demo.
 */
export async function listGroqModels({ apiKey, baseUrl, fetchImpl }) {
  const doFetch = fetchImpl || fetch;
  const response = await doFetch(`${baseUrl || 'https://api.groq.com/openai/v1'}/models`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error(`groq ${response.status}`);
  const body = await response.json();
  return (body?.data || []).map((entry) => entry.id).filter(Boolean);
}

/**
 * Generic tool call for the in-emergency helpers (interpret / ask). Same
 * providers, same forced-tool discipline as classification.
 */
export async function callTool({ provider, model, apiKey, systemPrompt, userText, toolName, schema, baseUrl, fetchImpl }) {
  if (provider === 'anthropic') {
    const doFetch = fetchImpl || fetch;
    const response = await doFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        system: systemPrompt,
        tools: [{ name: toolName, description: 'Structured answer.', input_schema: schema }],
        tool_choice: { type: 'tool', name: toolName },
        messages: [{ role: 'user', content: String(userText).slice(0, 2000) }],
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`anthropic ${response.status}: ${detail.slice(0, 200)}`);
    }
    return extractAnthropicToolInput(await response.json());
  }

  const doFetch = fetchImpl || fetch;
  const response = await doFetch(`${baseUrl || 'https://api.groq.com/openai/v1'}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_completion_tokens: 512,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: String(userText).slice(0, 2000) },
      ],
      tools: [{ type: 'function', function: { name: toolName, description: 'Structured answer.', parameters: schema } }],
      tool_choice: { type: 'function', function: { name: toolName } },
      parallel_tool_calls: false,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`groq ${response.status}: ${detail.slice(0, 200)}`);
  }
  return extractOpenAIToolArgs(await response.json());
}
