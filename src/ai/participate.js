import { matchCommand } from '../voice/commands.js';
import { passagesForNode } from '../engine/passages.js';
import { normalizeText } from '../match/localMatch.js';

/**
 * What SANAD can do *during* a case, as opposed to at the door.
 *
 *   interpretAnswer — you describe what you see; it presses the right button.
 *   askSanad        — you ask something; it answers with a sentence from the
 *                     protocol you are already following, or says it does not
 *                     cover that.
 *
 * Both degrade to a local implementation with no network, and both refuse
 * rather than guess.
 */

const TIMEOUT_MS = 5000;

async function post(endpoint, path, body, timeoutMs = TIMEOUT_MS) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint.replace(/\/classify$/, path), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const QUESTION_OPENERS = new Set([
  'هل', 'شنو', 'شلون', 'ليش', 'وين', 'متى', 'شكد', 'چم', 'كم', 'اكدر', 'اقدر', 'ينفع', 'لازم', 'اشلون',
  'can', 'should', 'do', 'does', 'what', 'why', 'how', 'when', 'where', 'is', 'are',
]);

/**
 * Is this person answering the step, or asking SANAD something?
 *
 * Note: a JS `\b` boundary is ASCII-only, so Arabic openers are matched by
 * comparing the first word rather than with a regex boundary.
 */
export function looksLikeQuestion(text) {
  const value = normalizeText(text);
  if (!value) return false;
  if (/[?؟]/.test(text)) return true;
  const first = value.split(' ')[0];
  return QUESTION_OPENERS.has(first);
}

/**
 * Maps free speech or typing onto one of the options already on screen.
 * Returns { ref, key } only when something matched confidently.
 */
export async function interpretAnswer(text, { node, options, endpoint, lang = 'ar' }) {
  const local = matchCommand(text, options);
  if (local?.action === 'choose') {
    return { ...local, source: 'offline', confidence: 1 };
  }
  if (local && local.action !== 'choose') return { ...local, source: 'offline' };

  if (!endpoint) return { action: null, source: 'offline' };

  try {
    const stepText =
      (lang === 'ar' ? node?.question?.ar || node?.title?.ar : node?.question?.en || node?.title?.en) || '';
    const payload = await post(endpoint, '/interpret', {
      text,
      stepText,
      options: options.map((option) => ({
        key: option.key,
        ar: option.label?.ar || option.key,
        en: option.label?.en || option.key,
      })),
    });
    const chosen = options.find((option) => option.key === payload?.key);
    if (!chosen) return { action: null, source: payload?.source || 'ai', confidence: payload?.confidence ?? 0 };
    return {
      action: 'choose',
      ref: chosen.ref,
      key: chosen.key,
      confidence: payload?.confidence ?? 0,
      source: payload?.source || 'ai',
    };
  } catch {
    return { action: null, source: 'offline', error: true };
  }
}

/** Local fallback for questions: find a passage that shares distinctive words. */
function localAsk(question, passages) {
  const words = normalizeText(question)
    .split(' ')
    .filter((word) => word.length >= 4);
  if (!words.length) return { found: false, reason: 'not_in_protocol', source: 'offline' };

  let best = null;
  for (const passage of passages) {
    const haystack = normalizeText(passage.text);
    const hits = words.filter((word) => haystack.includes(word)).length;
    if (hits && (!best || hits > best.hits)) best = { passage, hits };
  }
  // One shared word is a coincidence; two is an answer.
  if (!best || best.hits < 2) return { found: false, reason: 'not_in_protocol', source: 'offline' };
  return { found: true, text: best.passage.text, field: best.passage.field, source: 'offline', sourceKey: best.passage.source };
}

export async function askSanad(question, { flow, node, endpoint, lang = 'ar' }) {
  const passages = passagesForNode({ flow, node, lang });
  if (!endpoint) return localAsk(question, passages);

  try {
    const payload = await post(endpoint, '/ask', { question, passages });
    if (payload?.found) {
      return {
        found: true,
        text: payload.text,
        field: payload.field,
        sourceKey: payload.source,
        source: payload.provider || 'ai',
      };
    }
    // The model found nothing; the local search may still spot a passage.
    const local = localAsk(question, passages);
    return local.found ? local : { found: false, reason: payload?.reason || 'not_in_protocol', source: 'ai' };
  } catch {
    return localAsk(question, passages);
  }
}
