import React, { useState } from 'react';
import { useApp } from '../app/AppContext.jsx';
import { answerLabel, signalLabel, ANSWER_LABELS, SIGNAL_LABELS, humanize } from '../i18n/labels.js';
import { Action, Eyebrow } from './ui.jsx';
import { Stopwatch, RecheckTimer, Pacer, extractRate } from './timers.jsx';
import { AssistantLine } from './AssistantLine.jsx';
import { StepArt } from './StepArt.jsx';
import { artFor } from '../config/stepArt.js';
import { ASSISTANT } from '../i18n/assistant.js';

/**
 * One node = one screen. Instruction or question, large, with its actions
 * underneath. Everything on screen comes from the flow JSON.
 */

const bilingualAnswer = (answer) => ({
  ar: answer.label?.ar || ANSWER_LABELS[answer.key]?.ar || answer.label?.en || humanize(answer.key),
  en: answer.label?.en || ANSWER_LABELS[answer.key]?.en || answer.label?.ar || humanize(answer.key),
});

const bilingualSignal = (signal) => ({
  ar: SIGNAL_LABELS[signal]?.ar || humanize(signal),
  en: SIGNAL_LABELS[signal]?.en || humanize(signal),
});

/** Answers that describe deterioration get the red treatment. */
const DANGER_KEYS = new Set([
  'no_or_gasping',
  'not_breathing_normally',
  'unresponsive',
  'still_choking',
  'worse',
  'severe_bleeding',
  'seizure',
  'soaking_through',
  'spurting',
  'amputation',
]);

function Sources({ flow, node }) {
  const { lang } = useApp();
  const [open, setOpen] = useState(false);
  const keys = node.sources || [];
  if (!keys.length) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="font-latin text-xs tracking-[0.1em] text-muted-3 hover:text-brand"
      >
        {lang === 'ar' ? 'المصادر' : 'SOURCES'} · {keys.length}
      </button>
      {open ? (
        <ul className="mt-2 flex flex-col gap-1">
          {keys.map((key) => {
            const source = flow.sources?.[key];
            return (
              <li key={key} dir="ltr" className="font-latin text-start text-xs text-muted-2">
                {source?.url ? (
                  <a href={source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    {source.title || key}
                  </a>
                ) : (
                  source?.title || key
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function NodeRenderer({ flow, node, onChoose, onRestart, onHome }) {
  const { lang, L, S, scale } = useApp();

  const isQuestion = node.type === 'question' || node.answers.length > 0;
  const isWatch = node.type === 'monitor' && node.watchFor.length > 0;

  const eyebrow = isQuestion
    ? { ar: 'أجب الآن', en: 'ANSWER NOW', color: 'var(--color-amber)' }
    : isWatch
      ? { ar: 'راقب الآن', en: 'WATCH NOW', color: 'var(--color-amber)' }
      : { ar: 'افعل الآن', en: 'DO THIS NOW', color: 'var(--color-danger)' };

  const heading = { ar: node.question?.ar || node.title?.ar, en: node.question?.en || node.title?.en };
  const description = node.description;
  const hint = node.hint;

  const startsTimer = Boolean(node.sets && node.sets.timer_started === true);
  const rate = node.type === 'loop' ? extractRate(node.description?.ar, node.description?.en) : null;

  const hasExits = node.answers.length > 0 || node.watchFor.length > 0 || Boolean(node.next);

  const assistantLine =
    node.depth === 0
      ? ASSISTANT.firstStep
      : isQuestion
        ? ASSISTANT.answerFromWhatYouSee
        : isWatch
          ? ASSISTANT.stayWithThem
          : null;

  return (
    <div className="fade-in flex flex-col gap-6">
      <Eyebrow ar={eyebrow.ar} en={eyebrow.en} color={eyebrow.color} />

      <div>
        <h1
          className="font-semibold leading-[1.25] tracking-[-0.02em] text-ink"
          style={{ fontSize: `${34 * scale}px` }}
        >
          {L(heading) || node.id}
        </h1>
        <p
          dir={lang === 'ar' ? 'ltr' : 'rtl'}
          className={`mt-3 text-start text-muted ${lang === 'ar' ? 'font-latin' : ''}`}
          style={{ fontSize: `${20 * scale}px` }}
        >
          {S(heading)}
        </p>
        {description ? (
          <p className="mt-4 leading-relaxed text-muted-2" style={{ fontSize: `${17 * scale}px` }}>
            {L(description)}
            <span
              dir={lang === 'ar' ? 'ltr' : 'rtl'}
              className={`mt-1 block text-muted-3 ${lang === 'ar' ? 'font-latin' : ''}`}
            >
              {S(description)}
            </span>
          </p>
        ) : null}
        {hint ? (
          <p className="mt-4 rounded-xl bg-tint-warn px-4 py-3 font-medium text-amber" style={{ fontSize: `${16 * scale}px` }}>
            {L(hint)}
          </p>
        ) : null}
      </div>

      {/*
        SANAD speaking, not the medical content: how to use this screen.
        Only where it adds something — a silent step beats a filler line.
      */}
      {assistantLine ? <AssistantLine line={assistantLine} /> : null}

      <StepArt art={artFor(flow.id, node.id)} />

      {startsTimer ? <Stopwatch /> : null}
      {rate ? <Pacer bpm={rate} /> : null}
      {node.loop ? <RecheckTimer loop={node.loop} onRecheck={onChoose} onReassess={onChoose} /> : null}

      <div className="flex flex-col gap-3">
        {node.answers.map((answer) => {
          const label = bilingualAnswer(answer);
          return (
            <Action
              key={answer.key}
              tone={DANGER_KEYS.has(answer.key) ? 'danger' : 'choice'}
              ar={label.ar}
              en={label.en}
              onClick={() => onChoose(answer.ref)}
            />
          );
        })}

        {!node.answers.length && node.next ? (
          <Action tone="primary" ar="تم" en="Done" onClick={() => onChoose(node.next)} />
        ) : null}

        {node.watchFor.map((watch) => {
          const label = bilingualSignal(watch.signal);
          return (
            <Action
              key={watch.signal}
              tone="choice"
              ar={label.ar}
              en={label.en}
              onClick={() => onChoose(watch.ref)}
            />
          );
        })}

        {!hasExits || node.terminal ? (
          <Action tone="primary" ar="إنهاء" en="Finish" onClick={onHome} />
        ) : null}
      </div>

      <Sources flow={flow} node={node} />
    </div>
  );
}

export { answerLabel, signalLabel };
