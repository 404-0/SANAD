import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../app/AppContext.jsx';
import { STATUS } from '../engine/session.js';
import { NodeRenderer } from '../components/NodeRenderer.jsx';
import { TransitionInterstitial } from '../components/TransitionInterstitial.jsx';
import { ProblemScreen } from '../components/ProblemScreen.jsx';
import { EscalationPanel } from '../components/EscalationPanel.jsx';
import { NeverDoSheet } from '../components/NeverDoSheet.jsx';
import { CallButton } from '../components/CallButton.jsx';
import { GearIcon, SpeakerIcon, BackIcon } from '../components/Logo.jsx';
import { IconButton, Action, Eyebrow } from '../components/ui.jsx';
import { shortName } from '../config/caseLabels.js';
import { groupByKey } from '../engine/sharedContext.js';
import { buildHandover } from '../engine/handoverSummary.js';
import { VoiceBar } from '../components/VoiceBar.jsx';
import { AnswerBar } from '../components/AnswerBar.jsx';
import { useVoiceGuide } from '../voice/useVoiceGuide.js';
import { optionsForNode } from '../voice/commands.js';
import { speak, stopSpeaking, loadAudioManifest, clipFor, playClip } from '../voice/speech.js';
import { ANSWER_LABELS, SIGNAL_LABELS, humanize } from '../i18n/labels.js';
import { HandoverSheet } from '../components/HandoverSheet.jsx';

/** Emergency Mode: one instruction or question per screen. */
export function EmergencyScreen({ view, actions, onSettings }) {
  const { lang, L, S, readAloud, setReadAloud, registry } = useApp();
  const [neverDoOpen, setNeverDoOpen] = useState(false);
  const [handover, setHandover] = useState(null);
  const [handsFree, setHandsFree] = useState(false);

  const { flow, node, status, pending, problem, frame, escalations, canGoBack, assumption } = view;
  const assumedLabel = assumption ? groupByKey(assumption.group)?.label?.[assumption.value] : null;

  // What the voice guide should read, and what it is allowed to act on: the
  // node's own text and the node's own options, nothing invented.
  const speakText = React.useMemo(() => {
    if (status !== STATUS.RUNNING || !node) return [];
    const heading = L({ ar: node.question?.ar || node.title?.ar, en: node.question?.en || node.title?.en });
    return [heading, L(node.description)].filter(Boolean);
  }, [status, node, L]);

  const voiceOptions = React.useMemo(
    () =>
      optionsForNode(node, {
        answerLabel: (answer) => ({
          ar: answer.label?.ar || ANSWER_LABELS[answer.key]?.ar || humanize(answer.key),
          en: answer.label?.en || ANSWER_LABELS[answer.key]?.en || humanize(answer.key),
        }),
        signalLabel: (signal) => SIGNAL_LABELS[signal] || { ar: humanize(signal), en: humanize(signal) },
      }),
    [node],
  );

  const [manifestReady, setManifestReady] = useState(false);
  useEffect(() => {
    loadAudioManifest().then(() => setManifestReady(true));
  }, []);
  const clip = manifestReady && flow && node ? clipFor(flow.id, node.id, lang) : null;

  const voice = useVoiceGuide({
    clip,
    lang,
    enabled: handsFree && status === STATUS.RUNNING,
    speakText,
    options: voiceOptions,
    onCommand: (command) => {
      if (command.action === 'choose') actions.choose(command.ref);
      else if (command.action === 'back') actions.back();
      else if (command.action === 'repeat') voiceRef.current?.repeat();
      else if (command.action === 'call') document.querySelector('a[href^="tel:"]')?.click();
    },
  });
  const voiceRef = React.useRef(voice);
  voiceRef.current = voice;

  // Read-aloud without hands-free: speak each step, listen for nothing.
  useEffect(() => {
    if (handsFree || !readAloud || status !== STATUS.RUNNING || !speakText.length) return undefined;
    const stopClip = clip ? playClip(clip, {}) : null;
    const cancel = stopClip || speak(speakText, { lang });
    return () => {
      cancel?.();
      stopSpeaking();
    };
  }, [handsFree, readAloud, status, lang, speakText, clip]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [node?.id, status, pending?.transitionKey]);

  // Which way did we just move? Forward rises into place, back settles down.
  const previousDepth = useRef(node?.depth ?? 0);
  const [direction, setDirection] = useState('forward');
  useEffect(() => {
    const depth = node?.depth ?? 0;
    setDirection(depth < previousDepth.current ? 'back' : 'forward');
    previousDepth.current = depth;
  }, [node?.id, node?.depth]);

  const carried = frame?.carried || [];
  const total = (flow?.maxDepth ?? 0) + 1;
  const position = Math.min((node?.depth ?? 0) + 1, total);
  const dotCount = Math.min(total, 8);
  const activeDot = Math.min(Math.round(((position - 1) / Math.max(1, total - 1)) * (dotCount - 1)), dotCount - 1);

  return (
    <div className="flex min-h-full flex-col bg-app">
      <header className="flex items-center gap-3 border-b border-line bg-panel px-5 py-3">
        {/* One control: step back, and leave the flow when there is nothing to step back to. */}
        <IconButton onClick={canGoBack ? actions.back : actions.home} aria-label={lang === 'ar' ? 'رجوع' : 'Back'}>
          <BackIcon flip={lang === 'ar'} />
        </IconButton>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold text-ink">{flow ? L(shortName(flow)) : '—'}</p>
          <p className={`truncate text-xs text-muted-2 ${lang === 'ar' ? 'font-latin' : ''}`}>
            {flow ? S(shortName(flow)) : ''}
          </p>
        </div>
        <IconButton onClick={onSettings} aria-label={lang === 'ar' ? 'الإعدادات' : 'Settings'} className="h-[38px] w-[38px]">
          <GearIcon />
        </IconButton>
        <CallButton
          flow={flow}
          onNeedsNumber={onSettings}
          onCalled={() => setHandover(buildHandover({ session: view.session, registry, flow }))}
        />
      </header>

      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col justify-center gap-6 px-6 py-10">
        {carried.length ? (
          <div className="rounded-2xl bg-card p-4 shadow-card">
            <p className="font-latin text-xs tracking-[0.1em] text-muted-3">
              {lang === 'ar' ? 'استمر بهذا · KEEP DOING' : 'KEEP DOING · استمر بهذا'}
            </p>
            {carried.map((item, itemIndex) => (
              <p key={itemIndex} dir="ltr" className="font-latin mt-1 text-start text-[15px] text-ink">
                {item.text}
              </p>
            ))}
          </div>
        ) : null}

        {assumption && assumedLabel && status === STATUS.RUNNING ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-2">
            <span>
              {lang === 'ar'
                ? `اعتمدت إنه ${assumedLabel.ar} — ما سألتك مرة ثانية.`
                : `Assuming ${assumedLabel.en} — I didn't ask you again.`}
            </span>
            <button
              type="button"
              onClick={() => actions.undoAssumption(assumption)}
              className="underline underline-offset-4 hover:text-brand"
            >
              {lang === 'ar' ? 'غيّر' : 'Change'}
            </button>
          </div>
        ) : null}

        {status === STATUS.PENDING_TRANSITION && pending ? (
          <TransitionInterstitial
            pending={pending}
            registry={registry}
            onConfirm={actions.confirm}
            onCancel={actions.cancel}
          />
        ) : null}

        {status === STATUS.ENDED ? (
          <div className="fade-in flex flex-col gap-6">
            <Eyebrow ar="انتهت الخطوات" en="GUIDANCE COMPLETE" color="var(--color-safe)" />
            <p className="text-2xl font-semibold leading-snug text-ink">
              {lang === 'ar'
                ? 'ابقَ مع المصاب حتى تصل المساعدة.'
                : 'Stay with the person until help arrives.'}
            </p>
            <Action tone="primary" ar="الرئيسية" en="Home" onClick={actions.home} />
          </div>
        ) : null}

        {[STATUS.NODE_MISSING, STATUS.FLOW_MISSING, STATUS.BROKEN_REF].includes(status) ? (
          <ProblemScreen
            status={status}
            problem={problem}
            canGoBack={canGoBack}
            onBack={actions.back}
            onRestart={actions.restart}
            onHome={actions.home}
          />
        ) : null}

        {status === STATUS.RUNNING && node ? (
          <div key={node.id} className={`flex flex-col gap-8 ${direction === 'back' ? 'step-in-back' : 'step-in'}`}>
            <VoiceBar
              active={handsFree}
              listening={voice.listening}
              heard={voice.heard}
              error={voice.error}
              onToggle={() => setHandsFree((value) => !value)}
              onRepeat={voice.repeat}
            />
            <NodeRenderer
              flow={flow}
              node={node}
              onChoose={actions.choose}
              onRestart={actions.restart}
              onHome={actions.home}
            />
            <AnswerBar flow={flow} node={node} options={voiceOptions} onChoose={actions.choose} />

            <EscalationPanel escalations={escalations} onChoose={actions.choose} />
          </div>
        ) : null}
      </main>

      <footer className="flex items-center justify-between gap-4 border-t border-line px-6 py-4">
        <div className="flex items-center gap-2">
          {Array.from({ length: dotCount }).map((_, dotIndex) => (
            <span
              key={dotIndex}
              className="h-2 rounded-full transition-all"
              style={{
                width: dotIndex === activeDot ? 22 : 8,
                background:
                  dotIndex === activeDot
                    ? 'var(--color-brand)'
                    : dotIndex < activeDot
                      ? 'var(--color-dot-past)'
                      : 'var(--color-dot-future)',
              }}
            />
          ))}
          <span dir="ltr" className="font-latin ms-2 text-xs text-muted-3">
            {position} / {total}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setNeverDoOpen(true)}
            className="rounded-xl px-3 py-2 text-sm text-danger hover:bg-tint-danger"
          >
            {lang === 'ar' ? 'ممنوع' : 'Never do'}
          </button>
          <button
            type="button"
            onClick={() => setReadAloud(!readAloud)}
            className={`flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm ${
              readAloud ? 'bg-sub text-brand' : 'bg-transparent text-muted-3'
            }`}
          >
            <SpeakerIcon />
            <span className="hidden sm:inline">
              {readAloud
                ? lang === 'ar'
                  ? 'قراءة صوتية'
                  : 'Read aloud'
                : lang === 'ar'
                  ? 'صامت'
                  : 'Muted'}
            </span>
          </button>
        </div>
      </footer>

      {handover ? <HandoverSheet handover={handover} onClose={() => setHandover(null)} /> : null}

      {neverDoOpen && flow ? <NeverDoSheet flow={flow} onClose={() => setNeverDoOpen(false)} /> : null}
    </div>
  );
}
