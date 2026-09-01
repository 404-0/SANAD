import { normalizeText } from '../match/localMatch.js';

/**
 * Turning what someone shouted into the button they meant.
 *
 * Hands-free is the point of voice in this app: in a bleeding or CPR emergency
 * both hands are busy, so the person must be able to answer without looking at
 * or touching the phone. This maps a raw transcript onto the options that are
 * actually on screen — nothing else. If it is not confident, it returns null
 * and the screen just waits, because a wrong turn is far worse than silence.
 */

const CONTROL_WORDS = {
  next: [
    'تم', 'خلص', 'خلصت', 'سويت', 'سويتها', 'التالي', 'كمل', 'اكمل', 'يالله',
    'اوكي', 'اوكيه', 'اوك', 'زين', 'ماشي',
    'done', 'next', 'ok', 'okay', 'finished', 'continue',
  ],
  yes: ['نعم', 'اي', 'ايه', 'ايوه', 'اكيد', 'صح', 'yes', 'yeah', 'yep', 'correct'],
  no: ['لا', 'لأ', 'كلا', 'مو', 'ماكو', 'no', 'nope', 'negative'],
  back: ['رجوع', 'ارجع', 'رجعني', 'back', 'previous'],
  // "شنو" is deliberately absent: it is ordinary conversational filler in Iraqi
  // Arabic and would fire on half of what a bystander says out loud.
  repeat: ['عيد', 'اعد', 'كرر', 'مرة ثانية', 'repeat', 'again', 'say again'],
  call: ['اتصل', 'الاسعاف', 'call', 'ambulance'],
};

const NUMBER_WORDS = {
  1: ['واحد', 'الاول', 'اول', 'one', 'first'],
  2: ['اثنين', 'ثنين', 'الثاني', 'ثاني', 'two', 'second'],
  3: ['ثلاثة', 'تلاته', 'الثالث', 'ثالث', 'three', 'third'],
  4: ['اربعة', 'اربع', 'الرابع', 'four', 'fourth'],
};

/** Danger answers are never picked by a loose match — only by a clear one. */
const HIGH_STAKES = new Set(['no_or_gasping', 'not_breathing_normally', 'unresponsive', 'seizure']);

/**
 * Voice keeps every word. The offline matcher strips words like "لا" and "ما"
 * as noise, which is exactly backwards here: those short words ARE the answer.
 */
const voiceTokens = (text) =>
  normalizeText(text)
    .split(' ')
    .filter(Boolean);

/** A word long enough to be meant rather than mumbled. */
const DISTINCTIVE = 4;

const containsWord = (haystackTokens, phrase) => {
  const phraseTokens = voiceTokens(phrase);
  if (!phraseTokens.length) return false;
  return phraseTokens.every((token) => haystackTokens.includes(token));
};

const controlIn = (tokens) => {
  for (const [command, words] of Object.entries(CONTROL_WORDS)) {
    if (words.some((word) => containsWord(tokens, word))) return command;
  }
  return null;
};

const numberIn = (tokens, text) => {
  const digit = text.match(/\b([1-4])\b/);
  if (digit) return Number(digit[1]);
  for (const [value, words] of Object.entries(NUMBER_WORDS)) {
    if (words.some((word) => containsWord(tokens, word))) return Number(value);
  }
  return null;
};

/**
 * How strongly a transcript points at one option, 0..1. Scored per language so
 * an Arabic answer is not diluted by the English half of the same label.
 *
 * Two ways to score: how much of the label was said, and — for someone who says
 * just the distinctive word ("رضيع" for "رضيع أقل من سنة") — whether everything
 * they said belongs to that label and at least one word was long enough to be
 * deliberate.
 */
function labelScore(tokens, label) {
  const variants = [voiceTokens(label.ar || ''), voiceTokens(label.en || '')].filter((v) => v.length);
  let best = 0;
  for (const labelTokens of variants) {
    const matched = labelTokens.filter((token) => tokens.includes(token));
    if (!matched.length) continue;
    const coverage = matched.length / labelTokens.length;
    const said = tokens.filter((token) => labelTokens.includes(token)).length / tokens.length;
    const deliberate = matched.some((token) => token.length >= DISTINCTIVE);
    best = Math.max(best, said === 1 && deliberate ? Math.max(coverage, 0.8) : coverage);
  }
  return best;
}

/**
 * @param transcript what was heard
 * @param options    [{ kind, key, ref, label:{ar,en} }] currently on screen
 * @returns { action: 'choose'|'back'|'repeat'|'call', ref?, key?, reason } | null
 */
export function matchCommand(transcript, options = []) {
  const text = normalizeText(transcript);
  if (!text) return null;
  const tokens = voiceTokens(text);
  if (!tokens.length) return null;

  const control = controlIn(tokens);
  if (control === 'back') return { action: 'back', reason: 'control:back' };
  if (control === 'repeat') return { action: 'repeat', reason: 'control:repeat' };
  if (control === 'call') return { action: 'call', reason: 'control:call' };

  const byKey = (key) => options.find((option) => option.key === key);

  if (control === 'next') {
    const next = options.find((option) => option.kind === 'next');
    if (next) return { action: 'choose', ref: next.ref, key: 'next', reason: 'control:next' };
  }
  if (control === 'yes') {
    const yes = byKey('yes') || byKey('yes_and_awake') || byKey('calling');
    if (yes) return { action: 'choose', ref: yes.ref, key: yes.key, reason: 'control:yes' };
  }
  if (control === 'no') {
    // "no" is only ever the plain "no" option. Answers like "no, only gasping"
    // change the entire course of care and must be said, not inferred.
    const no = byKey('no');
    if (no) return { action: 'choose', ref: no.ref, key: no.key, reason: 'control:no' };
  }

  // Say the option itself: "ذراع أو ساق", "بالغ", "خرج الجسم"...
  const scored = options
    .map((option) => ({ option, score: labelScore(tokens, option.label || {}) }))
    .filter((entry) => entry.score >= 0.5)
    .sort((a, b) => b.score - a.score);

  if (scored.length) {
    const best = scored[0];
    const clear = best.score >= 0.75 || !scored[1] || best.score > scored[1].score + 0.2;
    const safeEnough = clear && (best.score >= 0.75 || !HIGH_STAKES.has(best.option.key));
    if (safeEnough) {
      return {
        action: 'choose',
        ref: best.option.ref,
        key: best.option.key,
        reason: `label:${best.score.toFixed(2)}`,
      };
    }
  }

  // "اثنين" / "two" picks the second option on screen.
  const index = numberIn(tokens, text);
  if (index && options[index - 1]) {
    const option = options[index - 1];
    return { action: 'choose', ref: option.ref, key: option.key, reason: `number:${index}` };
  }

  return null;
}

/** The options currently on screen, in the order they are rendered. */
export function optionsForNode(node, { answerLabel, signalLabel } = {}) {
  if (!node) return [];
  const options = [];

  for (const answer of node.answers || []) {
    options.push({
      kind: 'answer',
      key: answer.key,
      ref: answer.ref,
      label: answerLabel ? answerLabel(answer) : { ar: answer.key, en: answer.key },
    });
  }
  if (!node.answers?.length && node.next) {
    options.push({
      kind: 'next',
      key: 'next',
      ref: node.next,
      label: { ar: 'تم', en: 'Done' },
    });
  }
  for (const watch of node.watchFor || []) {
    options.push({
      kind: 'watch',
      key: watch.signal,
      ref: watch.ref,
      label: signalLabel ? signalLabel(watch.signal) : { ar: watch.signal, en: watch.signal },
    });
  }
  return options;
}
