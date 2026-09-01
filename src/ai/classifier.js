/**
 * Phase 4 — AI classifier client.
 *
 * The model answers exactly one question: which emergency flow is this, and how
 * sure are you. It never produces first-aid guidance; the JSON flows are the
 * only source of instructions. This file is the enforcement point:
 *
 *   - a flow id that is not one of ours is discarded
 *   - a clarification that is not a short question is discarded
 *   - anything else in the payload is ignored entirely
 *
 * So even a misbehaving or compromised endpoint cannot put words on the screen.
 */

export const CLASSIFIER_TIMEOUT_MS = 6000;
export const MAX_CLARIFICATION_CHARS = 140;
export const CONFIDENT_THRESHOLD = 0.6;

export class ClassifierError extends Error {
  constructor(reason, detail) {
    super(reason);
    this.name = 'ClassifierError';
    this.reason = reason;
    this.detail = detail ?? null;
  }
}

const clamp01 = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
};

/** A clarification must be a short question — never an instruction. */
function sanitizeClarification(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const clean = (value) => {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (!text || text.length > MAX_CLARIFICATION_CHARS) return null;
    if (!/[?؟]\s*$/.test(text)) return null;
    return text;
  };
  const ar = clean(raw.ar);
  const en = clean(raw.en);
  if (!ar && !en) return null;
  return { ar: ar || en, en: en || ar };
}

/**
 * Turns whatever the endpoint returned into the same shape the offline matcher
 * produces, discarding everything it is not allowed to say.
 */
export function normalizeClassifierPayload(payload, allowedIds) {
  if (!payload || typeof payload !== 'object') {
    throw new ClassifierError('bad_payload', 'response was not an object');
  }
  const allowed = new Set(allowedIds);

  const flowId = allowed.has(payload.flow_id) ? payload.flow_id : null;
  const confidence = clamp01(payload.confidence);
  const clarification = sanitizeClarification(payload.clarification);

  const candidates = (Array.isArray(payload.candidates) ? payload.candidates : [])
    .filter((id) => allowed.has(id))
    .slice(0, 3)
    .map((id, position) => ({ flowId: id, score: Math.max(0, confidence - position * 0.05) }));

  if (flowId && !candidates.some((candidate) => candidate.flowId === flowId)) {
    candidates.unshift({ flowId, score: confidence });
  }

  let status;
  if (!flowId) status = 'no_match';
  else if (payload.needs_clarification === true || confidence < CONFIDENT_THRESHOLD) status = 'ambiguous';
  else status = 'confident';

  return {
    status,
    flowId,
    confidence: Number(confidence.toFixed(3)),
    candidates: candidates.slice(0, 3),
    clarification,
    source: 'ai',
  };
}

/** POSTs the description to the classifier endpoint. Throws ClassifierError. */
export async function classifyWithAI(text, { endpoint, allowedIds, timeoutMs = CLASSIFIER_TIMEOUT_MS, fetchImpl } = {}) {
  if (!endpoint) throw new ClassifierError('not_configured', 'no classifier endpoint');
  const doFetch = fetchImpl || globalThis.fetch;
  if (!doFetch) throw new ClassifierError('no_fetch', 'fetch is unavailable');

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), timeoutMs);

  let response;
  try {
    response = await doFetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, allowed_ids: allowedIds }),
      signal: controller?.signal,
    });
  } catch (error) {
    throw new ClassifierError(error?.name === 'AbortError' ? 'timeout' : 'network', String(error?.message || error));
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new ClassifierError('http_error', `status ${response.status}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new ClassifierError('bad_json', String(error?.message || error));
  }

  return normalizeClassifierPayload(payload, allowedIds);
}
