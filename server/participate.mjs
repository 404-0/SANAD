/**
 * The AI's role *during* an emergency.
 *
 * Two jobs, both of them interpretation rather than authorship:
 *
 *   interpret  — the person describes what they see in their own words; the
 *                model picks which of the options already on screen that
 *                corresponds to. It can only return one of the keys we sent.
 *
 *   ask        — the person asks a question mid-flow ("أحط ثلج؟"); the model
 *                answers ONLY by pointing at a sentence from the loaded flow.
 *                The server then checks that the sentence it returned really is
 *                verbatim from what we sent. If it is not — if the model wrote
 *                its own medicine — the answer is thrown away and the user is
 *                told the protocol does not cover it.
 *
 * That check is the whole design. The model chooses which verified sentence
 * answers you; it never gets to write one.
 */

export const INTERPRET_TOOL = 'pick_option';
export const ASK_TOOL = 'answer_from_protocol';

const normalizeForCompare = (text) =>
  String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/[.،,؛;:!?؟"'`ـ]/g, '')
    .trim()
    .toLowerCase();

export function buildInterpretPrompt({ stepText, options }) {
  const list = options
    .map((option, index) => `${index + 1}. key="${option.key}" — ${option.ar} / ${option.en}`)
    .join('\n');

  return `You are helping someone use SANAD, an emergency first-aid guide, while their hands are busy.

They are on this step:
"${stepText}"

These are the ONLY choices available on that screen:
${list}

They will tell you, in Iraqi Arabic, Modern Standard Arabic or English, what they can see or what they have done. Decide which of the listed keys that corresponds to.

Rules:
- Return one of the listed keys, exactly as written, or null.
- Return null whenever you are not sure, when they said something unrelated, or when what they describe is not one of the listed choices. Null is always safe; a wrong choice can change the care they give.
- Never invent a key. Never give first-aid advice of your own — you are only reading their words onto the buttons in front of them.`;
}

export function buildInterpretSchema(optionKeys) {
  return {
    type: 'object',
    properties: {
      key: { type: ['string', 'null'], enum: [...optionKeys, null] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['key', 'confidence'],
  };
}

export function buildAskPrompt({ question, passages }) {
  const list = passages
    .map((passage, index) => `[${index}] (${passage.field}) ${passage.text}`)
    .join('\n');

  return `You answer questions from someone following SANAD's first-aid guidance, using ONLY the sentences below. They come from the medically reviewed protocol they are currently following.

${list}

Their question: "${question}"

Rules:
- If one of the numbered sentences answers it, return that sentence copied EXACTLY, character for character, and its number. Do not translate, shorten, merge or rephrase it.
- If none of them answers it, return found=false. That is a perfectly good answer.
- Never write first-aid guidance of your own. Anything you write that is not copied from the list above will be discarded, and the person will be told the protocol does not cover it.`;
}

export const ASK_SCHEMA = {
  type: 'object',
  properties: {
    found: { type: 'boolean' },
    passage_index: { type: ['integer', 'null'] },
    quote: { type: ['string', 'null'] },
  },
  required: ['found'],
};

/**
 * Accepts the model's answer only if the quote it returned is verbatim from a
 * passage we supplied. Returns the passage we hold, never the model's copy of
 * it, so even a subtly altered quote cannot reach the screen.
 */
export function verifyAnswer(raw, passages) {
  if (!raw || raw.found !== true) return { found: false, reason: 'not_in_protocol' };

  const index = Number.isInteger(raw.passage_index) ? raw.passage_index : -1;
  const quote = normalizeForCompare(raw.quote);
  if (!quote) return { found: false, reason: 'empty_quote' };

  const byIndex = passages[index];
  if (byIndex && normalizeForCompare(byIndex.text).includes(quote)) {
    return { found: true, field: byIndex.field, text: byIndex.text, source: byIndex.source || null };
  }

  // The index may be wrong while the quote is genuine; accept it if it is
  // verbatim from any passage we sent.
  const match = passages.find((passage) => normalizeForCompare(passage.text).includes(quote));
  if (match) return { found: true, field: match.field, text: match.text, source: match.source || null };

  return { found: false, reason: 'not_verbatim' };
}

export { passagesForNode } from '../src/engine/passages.js';
