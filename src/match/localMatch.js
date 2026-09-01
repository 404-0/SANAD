import { ROUTING_KEYWORDS } from './routingKeywords.js';

/**
 * Offline keyword matcher: free text -> a flow id.
 *
 * It only decides WHICH verified JSON flow to open. It never produces guidance.
 * Phase 4's AI classifier answers the same question better; this stays as the
 * fallback for when the API is unavailable, so the app always works offline.
 *
 * Everything it knows comes from the flow files themselves (names, the
 * classification signal lists, example_user_descriptions) plus the
 * routing-keyword list, which is deliberately colloquial.
 */

const AR_DIACRITICS = /[ً-ْـٰ]/g;

export function normalizeText(input) {
  return String(input || '')
    .toLowerCase()
    .replace(AR_DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ؤئ]/g, 'ء')
    .replace(/گ/g, 'ك')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  // Arabic
  'من', 'في', 'على', 'الى', 'عن', 'مع', 'هو', 'هي', 'انا', 'احنا', 'هذا', 'هاذا', 'هذه', 'ذاك',
  'ما', 'مو', 'مب', 'لا', 'بس', 'و', 'او', 'ثم', 'يا', 'شنو', 'شلون', 'كلش', 'هسه', 'اكو', 'ماكو',
  'صار', 'يصير', 'كان', 'اكدر', 'اقدر', 'يكدر', 'يقدر', 'شي', 'شيء', 'ال', 'له', 'لها',
  // English
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'and', 'or', 'to', 'of', 'in', 'on', 'at', 'it',
  'he', 'she', 'they', 'his', 'her', 'my', 'me', 'i', 'we', 'you', 'that', 'this', 'with', 'has',
  'have', 'had', 'not', 'but', 'can', 'cant', 'do', 'does', 'did', 'be', 'been', 'get', 'got',
  // Generic placeholders: they appear inside real phrases ("something is blocking
  // her airway") but carry no routing information on their own.
  'something', 'anything', 'everything', 'somebody', 'someone', 'thing', 'things', 'happened',
  'help', 'please', 'ساعدني', 'ساعد', 'اشي', 'شغله', 'شخص', 'واحد',
]);

export const tokenize = (text) =>
  normalizeText(text)
    .split(' ')
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));

/** Pull every human-readable string out of a flow's classification block. */
function classificationPhrases(classification) {
  const phrases = [];
  const walk = (value) => {
    if (!value) return;
    if (typeof value === 'string') {
      phrases.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        // 'action' / 'goto' / 'clarifying_nodes' are machine fields, not descriptions.
        if (['action', 'goto', 'clarifying_nodes', 'sources', 'note'].includes(key)) continue;
        walk(child);
      }
    }
  };
  walk(classification);
  return phrases;
}

/**
 * Source weights. A flow naming itself ("Seizure") beats another flow merely
 * listing that word among its own warning signs — otherwise "he is having a
 * seizure" ties with heatstroke and poisoning, which both list seizures.
 */
const SOURCE_WEIGHT = { name: 2, keyword: 1.5, example: 1.2, signal: 1 };

function flowPhrases(flow) {
  const grouped = [
    [[flow.name?.ar, flow.name?.en].filter(Boolean), SOURCE_WEIGHT.name],
    [
      [...(ROUTING_KEYWORDS[flow.id]?.ar || []), ...(ROUTING_KEYWORDS[flow.id]?.en || [])],
      SOURCE_WEIGHT.keyword,
    ],
    [Object.values(flow.raw?.example_user_descriptions || {}).flat(), SOURCE_WEIGHT.example],
    [classificationPhrases(flow.classification), SOURCE_WEIGHT.signal],
  ];

  return grouped.flatMap(([phrases, weight]) =>
    phrases
      .map((phrase) => ({ text: phrase, weight, tokens: tokenize(phrase) }))
      .filter((phrase) => phrase.tokens.length),
  );
}

/** Build the index once per registry; cheap enough to do at startup. */
export function buildMatcherIndex(registry) {
  const flows = registry.list().map((flow) => ({ flowId: flow.id, phrases: flowPhrases(flow) }));

  const documentFrequency = new Map();
  for (const flow of flows) {
    const tokensInFlow = new Set(flow.phrases.flatMap((phrase) => phrase.tokens));
    for (const token of tokensInFlow) {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }
  }
  return { flows, documentFrequency, flowCount: flows.length };
}

/** Rare words are worth more: "نزيف" should outweigh "صار". */
const weightOf = (token, index) => {
  const df = index.documentFrequency.get(token) || 0;
  // A word no flow knows must not be able to carry a match on its own.
  if (!df) return 0.35;
  return Math.log(1 + index.flowCount / df);
};

/** Loose Arabic/English stem overlap, e.g. "ينزف" vs "نزيف", "burned" vs "burn". */
const fuzzyHit = (queryToken, phraseToken) => {
  if (queryToken === phraseToken) return 1;
  const shorter = Math.min(queryToken.length, phraseToken.length);
  const longer = Math.max(queryToken.length, phraseToken.length);
  if (shorter < 5) return 0;
  if (queryToken.includes(phraseToken) || phraseToken.includes(queryToken)) {
    return shorter / longer >= 0.6 ? 0.6 : 0;
  }
  if (queryToken.slice(0, 5) === phraseToken.slice(0, 5)) return 0.4;
  return 0;
};

export function matchEmergency(text, index, options = {}) {
  const queryTokens = tokenize(text);
  const minScore = options.minScore ?? 0.32;
  const decisiveRatio = options.decisiveRatio ?? 1.35;

  if (!queryTokens.length) {
    return { status: 'empty', candidates: [], queryTokens };
  }

  const totalWeight =
    queryTokens.reduce((sum, token) => sum + weightOf(token, index), 0) || 1;

  const scored = index.flows.map(({ flowId, phrases }) => {
    const matchedTokens = new Map();
    let phraseBonus = 0;

    for (const phrase of phrases) {
      let phraseScore = 0;
      for (const queryToken of queryTokens) {
        let best = 0;
        for (const phraseToken of phrase.tokens) {
          best = Math.max(best, fuzzyHit(queryToken, phraseToken));
          if (best === 1) break;
        }
        if (best > 0) {
          const weighted = best * weightOf(queryToken, index) * phrase.weight;
          phraseScore += weighted;
          matchedTokens.set(queryToken, Math.max(matchedTokens.get(queryToken) || 0, weighted));
        }
      }
      // A phrase that matched most of its own words is a strong signal.
      if (phraseScore > 0) {
        const coverage = phraseScore / (phrase.tokens.length || 1);
        phraseBonus = Math.max(phraseBonus, Math.min(coverage, 1) * 0.25 * phrase.weight);
      }
    }

    const matchedWeight = [...matchedTokens.values()].reduce((sum, value) => sum + value, 0);
    // Not clamped: ranking needs the raw value. Confidence is clamped for display.
    const score = matchedWeight / totalWeight + phraseBonus;
    return { flowId, score, matched: [...matchedTokens.keys()] };
  });

  const candidates = scored
    .filter((candidate) => candidate.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (!candidates.length || candidates[0].score < minScore) {
    return { status: 'no_match', candidates, queryTokens };
  }

  const [top, second] = candidates;
  // Long descriptions must agree on more than a single word before auto-starting.
  const enoughEvidence = queryTokens.length < 3 || top.matched.length >= 2;
  const decisive =
    enoughEvidence && (!second || top.score >= second.score * decisiveRatio);
  return {
    status: decisive ? 'confident' : 'ambiguous',
    flowId: top.flowId,
    confidence: Number(Math.min(1, top.score).toFixed(3)),
    candidates,
    queryTokens,
  };
}
