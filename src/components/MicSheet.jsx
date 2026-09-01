import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../app/AppContext.jsx';
import { Modal, Action } from './ui.jsx';
import { MicIcon } from './Logo.jsx';
import { listen, sttSupported } from '../voice/speech.js';

/**
 * Speak the description instead of typing it. The transcript is shown and must
 * be accepted before anything happens with it — speech recognition mishears,
 * and this decides which emergency opens.
 */
export function MicSheet({ onClose, onUse }) {
  const { lang } = useApp();
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(sttSupported() ? null : 'unsupported');
  const stopRef = useRef(null);

  const start = () => {
    if (!sttSupported()) {
      setError('unsupported');
      return;
    }
    setError(null);
    setTranscript('');
    setListening(true);
    stopRef.current = listen({
      lang,
      onResult: ({ transcript: text }) => setTranscript(text),
      onError: (reason) => {
        if (reason === 'no_speech') return;
        setError(reason);
        setListening(false);
      },
      onEnd: () => setListening(false),
    });
  };

  const stop = () => {
    stopRef.current?.();
    stopRef.current = null;
    setListening(false);
  };

  useEffect(() => {
    start();
    return () => stopRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const message = () => {
    if (error === 'unsupported') {
      return {
        title: lang === 'ar' ? 'المتصفح ما يدعم الإدخال الصوتي' : 'This browser has no voice input',
        body:
          lang === 'ar'
            ? 'اكتب الوصف — النص دائمًا يشتغل.'
            : 'Type the description instead — text always works.',
      };
    }
    if (error === 'denied') {
      return {
        title: lang === 'ar' ? 'ما عندي إذن للمايك' : 'Microphone permission refused',
        body: lang === 'ar' ? 'اسمح للمايك أو اكتب الوصف.' : 'Allow the microphone, or type instead.',
      };
    }
    if (error) {
      return {
        title: lang === 'ar' ? 'تعذّر الاستماع' : "Couldn't listen",
        body: lang === 'ar' ? 'جرّب مرة ثانية أو اكتب الوصف.' : 'Try again, or type the description.',
      };
    }
    if (listening && !transcript) {
      return {
        title: lang === 'ar' ? 'أسمعك…' : 'Listening…',
        body: lang === 'ar' ? 'قول شنو صار.' : 'Say what happened.',
      };
    }
    return null;
  };

  const note = message();

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col items-center gap-5">
        <div
          className={`flex h-[84px] w-[84px] items-center justify-center rounded-full ${
            listening ? 'bg-danger text-white pulse-soft' : 'bg-sub text-brand'
          }`}
        >
          <MicIcon size={34} />
        </div>

        {note ? (
          <div className="text-center">
            <p className="text-xl font-semibold text-ink">{note.title}</p>
            <p className="mt-1 text-[15px] text-muted">{note.body}</p>
          </div>
        ) : null}

        {transcript ? (
          <div className="w-full rounded-2xl bg-page p-5 text-center text-[22px] leading-snug text-ink">
            {transcript}
          </div>
        ) : null}

        <div className="flex w-full flex-col gap-2">
          {transcript ? (
            <Action
              tone="primary"
              ar="استخدم هذا النص"
              en="Use this"
              onClick={() => {
                stop();
                onUse?.(transcript);
              }}
            />
          ) : null}
          {!listening ? (
            <Action tone="choice" ar="حاول مرة ثانية" en="Try again" onClick={start} />
          ) : (
            <Action tone="choice" ar="أوقف" en="Stop" onClick={stop} />
          )}
          <button
            type="button"
            onClick={() => {
              stop();
              onClose();
            }}
            className="py-2 text-sm text-muted-2 underline underline-offset-4 hover:text-brand"
          >
            {lang === 'ar' ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
