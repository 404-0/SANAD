import React from 'react';
import { useApp } from '../app/AppContext.jsx';

/**
 * Primitives for the SANAD prototype look: light surfaces, one dark primary
 * action, red only for danger, and every label bilingual (Arabic lead, Latin
 * echo) so nobody has to find a language switch during an emergency.
 */

const TONES = {
  primary: 'bg-brand text-on-brand hover:bg-brand-hover shadow-brand',
  danger: 'bg-danger text-white hover:bg-danger-hover shadow-danger',
  safe: 'bg-card text-safe-ink border-[1.5px] border-safe hover:bg-tint-safe',
  // Neutral answer. The flow JSON does not say which answer is the "good" one,
  // so only answers that clearly describe deterioration get colour.
  choice: 'bg-card text-ink border-[1.5px] border-line hover:border-brand',
  quiet: 'bg-transparent text-brand hover:bg-sub',
  chip: 'bg-sub text-brand hover:bg-sub-hover',
};

/** The bilingual label used on every action in the prototype. */
export function Bi({ ar, en, arClass = '', enClass = '', stack = false }) {
  const { lang } = useApp();
  const primary = lang === 'ar' ? ar : en;
  const secondary = lang === 'ar' ? en : ar;
  const secondaryDir = lang === 'ar' ? 'ltr' : 'rtl';
  return (
    <span className={stack ? 'flex flex-col items-start gap-1' : 'flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1'}>
      <span className={arClass}>{primary}</span>
      {secondary ? (
        <span dir={secondaryDir} className={`${lang === 'ar' ? 'font-latin' : ''} opacity-65 ${enClass}`}>
          {secondary}
        </span>
      ) : null}
    </span>
  );
}

export function Action({ tone = 'primary', ar, en, className = '', large, onClick, ...props }) {
  const { textScale } = useApp();

  // A short tick confirms the tap when the phone is nowhere near your eyes.
  const handleClick = (event) => {
    try {
      navigator.vibrate?.(12);
    } catch {
      /* unsupported — the visual press feedback is enough */
    }
    onClick?.(event);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`press flex w-full items-center justify-center gap-3 rounded-2xl px-6 transition-colors duration-150 disabled:opacity-50 ${TONES[tone]} ${className}`}
      style={{ minHeight: (large ? 92 : 80) * (textScale === 'large' ? 1.12 : 1) }}
      {...props}
    >
      <Bi
        ar={ar}
        en={en}
        arClass="font-semibold"
        enClass="text-[15px] font-medium"
      />
    </button>
  );
}

export function GhostAction({ ar, en, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`flex h-14 w-full items-center justify-center gap-3 rounded-xl text-brand transition-colors duration-150 hover:bg-sub ${className}`}
      {...props}
    >
      <Bi ar={ar} en={en} arClass="text-lg font-medium" enClass="text-sm" />
    </button>
  );
}

export function IconButton({ children, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sub text-brand transition-colors duration-150 hover:bg-sub-hover ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Chip({ active, children, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`h-11 flex-1 rounded-xl px-3 text-[15px] font-medium transition-colors duration-150 ${
        active ? 'bg-brand text-on-brand' : 'bg-page text-brand hover:bg-sub'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/** Small uppercase eyebrow with a status dot, as used above each instruction. */
export function Eyebrow({ ar, en, color = 'var(--color-danger)' }) {
  const { lang } = useApp();
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="text-sm font-semibold tracking-[0.1em]" style={{ color }}>
        {lang === 'ar' ? ar : en}
      </span>
      <span
        dir={lang === 'ar' ? 'ltr' : 'rtl'}
        className={`text-xs tracking-[0.14em] text-muted-3 ${lang === 'ar' ? 'font-latin' : ''}`}
      >
        {lang === 'ar' ? en : ar}
      </span>
    </div>
  );
}

export function Card({ children, className = '', ...props }) {
  return (
    <div className={`rounded-2xl bg-card shadow-card ${className}`} {...props}>
      {children}
    </div>
  );
}

export function Modal({ children, onClose, align = 'center' }) {
  React.useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className={`bg-scrim fixed inset-0 z-50 flex justify-center p-5 ${
        align === 'top' ? 'items-start pt-16' : 'items-center'
      }`}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="fade-in max-h-[85vh] w-full max-w-[420px] overflow-y-auto overscroll-contain rounded-2xl bg-panel p-6 shadow-modal"
      >
        {children}
      </div>
    </div>
  );
}

export function SettingLabel({ ar, en }) {
  return (
    <p className="font-latin text-xs tracking-[0.1em] text-muted-3">
      {ar} · {en}
    </p>
  );
}
