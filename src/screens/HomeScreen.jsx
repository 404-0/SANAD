import React, { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext.jsx';
import { buildMatcherIndex } from '../match/localMatch.js';
import { classifyEmergency } from '../ai/classifyEmergency.js';
import { CLASSIFIER_ENDPOINT } from '../ai/config.js';
import { Logo, GearIcon, MicIcon } from '../components/Logo.jsx';
import { shortName } from '../config/caseLabels.js';
import { Action, GhostAction, IconButton, Card, Eyebrow } from '../components/ui.jsx';
import { AssistantLine } from '../components/AssistantLine.jsx';
import { ASSISTANT } from '../i18n/assistant.js';

/**
 * Home: one question, one input, one button.
 *
 * Start hands the text to the classifier (AI when configured, offline keyword
 * matcher otherwise) and shows one of three answers: a case, a short
 * clarification with choices, or "pick it yourself".
 */
export function HomeScreen({
  onStart,
  onManual,
  onSettings,
  onMic,
  spokenText,
  resumable,
  onResume,
  onDiscardResume,
}) {
  const { registry, lang, L, S, scale } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const index = useMemo(() => buildMatcherIndex(registry), [registry]);

  const classify = React.useCallback(
    async (value) => {
      if (busy) return;
      setBusy(true);
      setResult(null);
      try {
        setResult(await classifyEmergency(value, { index, registry, endpoint: CLASSIFIER_ENDPOINT }));
      } finally {
        setBusy(false);
      }
    },
    [busy, index, registry],
  );

  const submit = (event) => {
    event?.preventDefault?.();
    classify(text);
  };

  // A transcript arriving from the voice sheet fills the box and runs itself.
  React.useEffect(() => {
    if (!spokenText) return;
    setText(spokenText);
    classify(spokenText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spokenText]);

  const candidates = (result?.candidates || [])
    .map((candidate) => ({ ...candidate, flow: registry.get(candidate.flowId) }))
    .filter((candidate) => candidate.flow);

  const sourceLabel =
    result?.source === 'ai'
      ? { ar: 'تحليل ذكي', en: 'AI' }
      : { ar: 'مطابقة محلية', en: 'Offline match' };

  return (
    <div className="flex min-h-full flex-col bg-app">
      <header className="flex items-start justify-between gap-4 px-6 pt-6">
        <Logo tagline />
        <IconButton onClick={onSettings} aria-label="الإعدادات · Settings">
          <GearIcon />
        </IconButton>
      </header>

      <main className="mx-auto flex w-full max-w-[620px] flex-1 flex-col justify-center gap-6 px-6 py-9">
        {resumable ? (
          <Card className="fade-in flex flex-col gap-4 p-5">
            <AssistantLine line={ASSISTANT.resume} tone="strong" />
            <div>
              <p className="text-[22px] font-semibold leading-tight text-ink">
                {L(shortName(resumable.flow))}
              </p>
              <p className="mt-1 text-sm text-muted-2">
                {lang === 'ar'
                  ? `توقفنا قبل ${resumable.minutesAgo} دقيقة`
                  : `Left off ${resumable.minutesAgo} min ago`}
              </p>
            </div>
            <Action tone="primary" ar="أكمل من وين وقفنا" en="Continue where we stopped" onClick={onResume} />
            <button
              type="button"
              onClick={onDiscardResume}
              className="text-sm text-muted-2 underline underline-offset-4 hover:text-brand"
            >
              {lang === 'ar' ? 'لا، حالة جديدة' : 'No, this is something new'}
            </button>
          </Card>
        ) : null}

        <div>
          <h1
            className="font-semibold leading-[1.15] tracking-[-0.02em] text-ink"
            style={{ fontSize: `${44 * scale}px` }}
          >
            {lang === 'ar' ? 'ماذا حدث؟' : 'What happened?'}
          </h1>
          <p
            dir={lang === 'ar' ? 'ltr' : 'rtl'}
            className={`mt-1.5 text-start text-xl text-muted ${lang === 'ar' ? 'font-latin' : ''}`}
          >
            {lang === 'ar' ? 'What happened?' : 'ماذا حدث؟'}
          </p>
          <AssistantLine line={ASSISTANT.presence} className="mt-4" />
        </div>

        <form onSubmit={submit} className="flex flex-col gap-5">
          <Card className="relative">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={lang === 'ar' ? 'صديقي طاح وما يرد علي' : 'My friend collapsed and won’t respond'}
              rows={3}
              className="w-full resize-none rounded-2xl bg-transparent py-5 ps-5 pe-[66px] text-xl leading-relaxed text-ink outline-none placeholder:text-muted-3"
            />
            <button
              type="button"
              onClick={onMic}
              aria-label={lang === 'ar' ? 'إدخال صوتي' : 'Voice input'}
              className="absolute top-3.5 end-3.5 flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-on-brand transition-colors hover:bg-brand-hover"
            >
              <MicIcon />
            </button>
          </Card>

          <Action
            type="submit"
            tone="primary"
            disabled={busy}
            className={busy ? 'pulse-soft' : ''}
            ar={busy ? 'نقرأ الوصف…' : 'ابدأ'}
            en={busy ? 'Reading…' : 'Start'}
          />
        </form>

        {busy ? <AssistantLine line={ASSISTANT.thinking} thinking /> : null}

        {result ? (
          <section className="fade-in flex flex-col gap-4">
            {result.status === 'confident' && registry.get(result.flowId) ? (
              <Card className="flex flex-col gap-4 p-5">
                <AssistantLine line={ASSISTANT.understood} tone="strong" />
                <Eyebrow
                  ar={`${sourceLabel.ar} · ${Math.round((result.confidence || 0) * 100)}%`}
                  en={sourceLabel.en}
                  color="var(--color-muted-3)"
                />
                <div>
                  <p className="text-[26px] font-semibold leading-tight text-ink">
                    {L(registry.get(result.flowId).name)}
                  </p>
                  <p
                    dir={lang === 'ar' ? 'ltr' : 'rtl'}
                    className={`mt-1 text-start text-[15px] text-muted-2 ${lang === 'ar' ? 'font-latin' : ''}`}
                  >
                    {S(registry.get(result.flowId).name)}
                  </p>
                </div>
                <p className="text-[15px] leading-relaxed text-muted">{L(ASSISTANT.willGuide)}</p>
                <Action tone="danger" ar="ابدأ الخطوات" en="Start the steps" onClick={() => onStart(result.flowId)} />
              </Card>
            ) : null}

            {result.status === 'ambiguous' ? (
              <div className="flex flex-col gap-3">
                <AssistantLine line={ASSISTANT.needOneThing} tone="strong" />
                <Eyebrow
                  ar={result.clarification ? 'سؤال واحد' : 'أي حالة؟'}
                  en={result.clarification ? 'ONE QUESTION' : 'WHICH CASE?'}
                  color="var(--color-amber)"
                />
                {result.clarification ? (
                  <p className="text-2xl font-semibold leading-snug text-ink">
                    {L(result.clarification)}
                    <span
                      dir={lang === 'ar' ? 'ltr' : 'rtl'}
                      className={`mt-1 block text-base font-normal text-muted-2 ${lang === 'ar' ? 'font-latin' : ''}`}
                    >
                      {S(result.clarification)}
                    </span>
                  </p>
                ) : null}
                {candidates.map((candidate) => (
                  <Action
                    key={candidate.flowId}
                    tone="choice"
                    ar={shortName(candidate.flow).ar}
                    en={shortName(candidate.flow).en}
                    onClick={() => onStart(candidate.flowId)}
                  />
                ))}
              </div>
            ) : null}

            {['no_match', 'empty'].includes(result.status) ? (
              <AssistantLine line={ASSISTANT.couldNotTell} tone="strong" />
            ) : null}
          </section>
        ) : null}

        <GhostAction ar="اختر الحالة يدويًا" en="Choose emergency manually" onClick={onManual} />
      </main>

      <footer
        dir="ltr"
        className="font-latin mx-auto max-w-[460px] px-6 pb-7 text-center text-xs leading-relaxed text-[#8C8C84]"
      >
        Verified first-aid guidance. SANAD does not replace emergency services.
      </footer>
    </div>
  );
}
