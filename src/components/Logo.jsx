import React from 'react';

/** Wordmark only — سند with the Latin echo, as in the prototype. */
export function Logo({ size = 'lg', tagline = false }) {
  return (
    <div>
      <div className={`${size === 'lg' ? 'text-[26px]' : 'text-xl'} font-semibold tracking-[-0.01em] text-brand`}>
        سند
        <span dir="ltr" className="font-latin ms-3 align-middle text-[15px] font-semibold tracking-[0.16em]">
          SANAD
        </span>
      </div>
      {tagline ? (
        <p dir="ltr" className="font-latin mt-1 text-start text-[13px] text-muted-2">
          AI Emergency Guide
        </p>
      ) : null}
    </div>
  );
}

export function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="9" cy="9" r="2.6" />
      <path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M14.3 3.7l-1.4 1.4M5.1 12.9l-1.4 1.4" />
    </svg>
  );
}

export function BackIcon({ flip }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path d="M11 3.5 5.5 9l5.5 5.5" />
    </svg>
  );
}

export function MicIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="7" y="2.5" width="6" height="9" rx="3" />
      <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
    </svg>
  );
}

export function PhoneIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3 4.5c0 6 4.5 10.5 10.5 10.5l1.5-3-3.5-1.5-1.8 1.8a11 11 0 0 1-3.3-3.3L8.2 7 6.7 3.5 3.7 3.4Z" />
    </svg>
  );
}

export function SpeakerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 7h2.5L10 4v10L6.5 11H4V7Z" />
      <path d="M12.5 6.5a3.5 3.5 0 0 1 0 5" />
    </svg>
  );
}
