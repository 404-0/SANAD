import { classifyWithAI } from './classifier.js';
import { matchEmergency } from '../match/localMatch.js';

/**
 * The one entry point the UI calls.
 *
 * AI first when an endpoint is configured; the offline keyword matcher whenever
 * the AI is unavailable, slow, misconfigured or returns something it should not
 * have. The caller cannot tell the difference except by `source`, and no raw
 * API error ever reaches the screen (Phase 6).
 */
export async function classifyEmergency(text, { index, registry, endpoint, fetchImpl, timeoutMs } = {}) {
  const allowedIds = registry.list().map((flow) => flow.id);
  const offline = () => ({ ...matchEmergency(text, index), source: 'offline', clarification: null });

  if (!text || !text.trim()) {
    return { status: 'empty', candidates: [], source: 'offline', clarification: null };
  }
  if (!endpoint) return offline();

  try {
    const result = await classifyWithAI(text, { endpoint, allowedIds, fetchImpl, timeoutMs });
    // An AI that found nothing still deserves the offline second opinion.
    if (result.status === 'no_match') {
      const fallback = offline();
      return fallback.status === 'no_match' ? { ...result, fallbackChecked: true } : { ...fallback, aiSaidNoMatch: true };
    }
    return result;
  } catch (error) {
    return { ...offline(), aiError: error.reason || 'unknown' };
  }
}
