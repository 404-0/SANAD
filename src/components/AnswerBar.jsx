import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../app/AppContext.jsx';
import { MicIcon } from './Logo.jsx';
import { AssistantMark } from './AssistantLine.jsx';
import { interpretAnswer, askSanad, looksLikeQuestion } from '../ai/participate.js';
import { CLASSIFIER_ENDPOINT } from '../ai/config.js';
import { listen, sttSupported } from '../voice/speech.js';

/**
 * Talk to SANAD instead of hunting for the right button.
 *
 * Anything typed or spoken here is either an answer to the step ("الدم يفور من
 * رجله" → the spurting option) or a question ("أحط ثلج؟"), which is answered
 * with a sentence from this flow — never with something the model wrote.
 */
export function AnswerBar({ flow, node, options, onChoose }) {
  const { lang, L } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [reply, setReply] = useState(null);
  const stopRef = useRef(null);

  // A new step clears the conversation; the old answer no longer applies.
  useEffect(() => {
    setReply(null);
    setText('');
  }, [node?.id]);

  useEffect(() => () => stopRef.current?.(), []);

  const send = async (value) => {
    const question = (value ?? text).trim();
    if (!question || busy) return;
    setBusy(true);
    setReply(null);
    try {
      if (looksLikeQuestion(question)) {
        const answer = await askSanad(question, { flow, node, endpoint: CLASSIFIER_ENDPOINT, lang });
        setReply(
          answer.found
            ? { kind: 'answer', text: answer.text, source: answer.source, sourceKey: answer.sourceKey }
            : { kind: 'not_covered', source: answer.source },
        );
        setText('');
        return;
      }

      const result = await interpretAnswer(question, { node, options, endpoint: CLASSIFIER_ENDPOINT, lang });
      if (result?.action === 'choose') {
        setText('');
        setReply({ kind: 'understood', key: result.key, source: result.source });
        onChoose(result.ref);
        return;
      }
      if (result?.action === 'back' || result?.action === 'repeat') {
        setReply({ kind: 'not_understood' });
        return;
      }

      // Not an answer to this step — maybe it was a question after all.
      const answer = await askSanad(question, { flow, node, endpoint: CLASSIFIER_ENDPOINT, lang });
      setReply(
        answer.found
          ? { kind: 'answer', text: answer.text, source: answer.source, sourceKey: answer.sourceKey }
          : { kind: 'not_understood', source: answer.source },
      );
    } finally {
      setBusy(false);
    }
  };

  const toggleMic = () => {
    if (listening) {
      stopRef.current?.();
      setListening(false);
      return;
    }
    if (!sttSupported()) {
      setReply({ kind: 'no_mic' });
      return;
    }
    setListening(true);
    stopRef.current = listen({
      lang,
      onResult: ({ transcript, isFinal }) => {
        setText(transcript);
        if (isFinal) {
          stopRef.current?.();
          setListening(false);
          send(transcript);
        }
      },
      onError: () => {
        setListening(false);
        setReply({ kind: 'no_mic' });
      },
      onEnd: () => setListening(false),
    });
  };

  const placeholder =
    lang === 'ar' ? 'قول شنو تشوف… أو اسألني' : 'Describe what you see… or ask me';

  return (
    <div className="flex flex-col gap-3">
      {reply ? (
        <div className="fade-in flex items-start gap-3 rounded-2xl bg-card p-4 shadow-card">
          <AssistantMark size={22} />
          <div className="min-w-0 flex-1">
            {reply.kind === 'answer' ? (
              <>
                <p className="text-[15px] leading-relaxed text-ink">{reply.text}</p>
                <p className="mt-1 text-xs text-muted-3">
                  {lang === 'ar' ? 'من البروتوكول' : 'From the protocol'}
                  {reply.sourceKey ? ` · ${reply.sourceKey}` : ''}
                  {reply.source === 'offline' ? (lang === 'ar' ? ' · بدون إنترنت' : ' · offline') : ''}
                </p>
              </>
            ) : null}
            {reply.kind === 'not_covered' ? (
              <p className="text-[15px] leading-relaxed text-ink">
                {lang === 'ar'
                  ? 'هذا مو موجود بالبروتوكول. لا أخمّن — اسأل الإسعاف على الخط.'
                  : "The protocol doesn't cover that. I won't guess — ask the dispatcher."}
              </p>
            ) : null}
            {reply.kind === 'not_understood' ? (
              <p className="text-[15px] leading-relaxed text-ink">
                {lang === 'ar' ? 'ما فهمتها. اختر من الأزرار فوق.' : "I didn't catch that. Use the buttons above."}
              </p>
            ) : null}
            {reply.kind === 'understood' ? (
              <p className="text-[15px] leading-relaxed text-ink">
                {lang === 'ar' ? 'فهمت.' : 'Got it.'}
              </p>
            ) : null}
            {reply.kind === 'no_mic' ? (
              <p className="text-[15px] leading-relaxed text-ink">
                {lang === 'ar' ? 'المايك مو متاح. اكتب بدله.' : 'No microphone available. Type instead.'}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        className="flex items-center gap-2 rounded-2xl bg-card p-2 shadow-card"
      >
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[15px] text-ink outline-none placeholder:text-muted-3"
        />
        <button
          type="button"
          onClick={toggleMic}
          aria-label={lang === 'ar' ? 'تكلم' : 'Speak'}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            listening ? 'bg-danger text-white pulse-soft' : 'bg-sub text-brand'
          }`}
        >
          <MicIcon size={18} />
        </button>
        <button
          type="submit"
          disabled={busy || !text.trim()}
          aria-label={lang === 'ar' ? 'أرسل' : 'Send'}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-on-brand disabled:opacity-40 ${
            busy ? 'pulse-soft' : ''
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path
              d={lang === 'ar' ? 'M20 12H4m6-6-6 6 6 6' : 'M4 12h16m-6-6 6 6-6 6'}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </form>

      <p className="px-1 text-xs text-muted-3">
        {lang === 'ar'
          ? 'أجوبتي كلها من نفس البروتوكول الموثّق — ما أخترع شي.'
          : 'Every answer comes from this verified protocol — I never make one up.'}
      </p>
      <span className="sr-only">{L({ ar: 'مساعد', en: 'assistant' })}</span>
    </div>
  );
}
