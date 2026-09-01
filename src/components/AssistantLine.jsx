import React from 'react';
import { useApp } from '../app/AppContext.jsx';

/** The small SANAD mark used whenever the app speaks in its own voice. */
export function AssistantMark({ size = 26, pulse = false }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-danger ${pulse ? 'pulse-soft' : ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" width={size * 0.62} height={size * 0.62}>
        <path d="M13 6h6v7h7v6h-7v7h-6v-7H6v-6h7z" fill="#fff" />
      </svg>
    </span>
  );
}

/**
 * A line spoken by SANAD rather than by the medical content. Bilingual like
 * everything else, and always visually quieter than the instruction itself.
 */
export function AssistantLine({ line, tone = 'quiet', thinking = false, className = '' }) {
  const { lang, L, S, secondaryDir } = useApp();
  const strong = tone === 'strong';

  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <AssistantMark size={strong ? 28 : 22} pulse={thinking} />
      <div className="min-w-0">
        <p className={strong ? 'text-lg font-semibold text-ink' : 'text-[15px] text-muted'}>
          {L(line)}
          {thinking ? (
            <span className="dot-typing ms-1 inline-flex gap-0.5">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          ) : null}
        </p>
        <p dir={secondaryDir} className={`text-start text-[13px] text-muted-3 ${lang === 'ar' ? 'font-latin' : ''}`}>
          {S(line)}
        </p>
      </div>
    </div>
  );
}
