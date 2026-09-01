import React from 'react';
import { useApp } from '../app/AppContext.jsx';
import { MicIcon } from './Logo.jsx';

/**
 * The hands-free strip. It exists to answer one question at a glance: is it
 * listening to me right now, and did it hear me? Everything it can do is also
 * a button on the screen behind it.
 */
export function VoiceBar({ active, listening, heard, error, onToggle, onRepeat }) {
  const { lang } = useApp();

  const status = () => {
    if (error === 'unsupported') {
      return lang === 'ar' ? 'المتصفح ما يدعم الصوت' : 'This browser has no speech input';
    }
    if (error === 'denied') {
      return lang === 'ar' ? 'ما عندي إذن للمايك' : 'Microphone permission was refused';
    }
    if (error) return lang === 'ar' ? 'تعذّر الاستماع' : "Couldn't listen";
    if (!active) return lang === 'ar' ? 'وضع بدون يدين' : 'Hands-free';
    if (listening) return lang === 'ar' ? 'أسمعك…' : 'Listening…';
    return lang === 'ar' ? 'أقرأ الخطوة…' : 'Reading the step…';
  };

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${
        active ? 'bg-tint-danger' : 'bg-card shadow-card'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={active}
        aria-label={lang === 'ar' ? 'وضع بدون يدين' : 'Hands-free mode'}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          active ? 'bg-danger text-white' : 'bg-sub text-brand'
        } ${listening ? 'pulse-soft' : ''}`}
      >
        <MicIcon />
      </button>

      {active && !error ? (
        <span className={`wave flex h-6 items-center gap-1 ${listening ? 'text-danger' : 'text-brand'}`} aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </span>
      ) : null}

      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium text-ink">{status()}</p>
        {active && heard ? (
          <p className="truncate text-[13px] text-muted-2">“{heard}”</p>
        ) : (
          <p className="truncate text-[13px] text-muted-3">
            {lang === 'ar' ? 'قول: تم · نعم · لا · ارجع · كرر' : 'Say: done · yes · no · back · repeat'}
          </p>
        )}
      </div>

      {active ? (
        <button
          type="button"
          onClick={onRepeat}
          className="shrink-0 rounded-xl bg-sub px-3 py-2 text-sm font-medium text-brand hover:bg-sub-hover"
        >
          {lang === 'ar' ? 'كرر' : 'Repeat'}
        </button>
      ) : null}
    </div>
  );
}
