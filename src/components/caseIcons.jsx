import React from 'react';

/**
 * One glyph per case, keyed by flow id. Purely decorative — the grid still
 * renders (without an icon) for any flow id that is not listed here, so adding
 * a JSON file never requires touching this file.
 */
const PATHS = {
  severe_external_bleeding: {
    color: '#C0322A',
    d: <path d="M12 3c3 4.2 5 7 5 9.4A5 5 0 0 1 7 12.4C7 10 9 7.2 12 3Z" />,
  },
  choking: {
    color: '#C0322A',
    d: (
      <>
        <circle cx="12" cy="7" r="4" />
        <path d="M8 21c0-3 1.8-5 4-5s4 2 4 5M9 12.5l6 3" />
      </>
    ),
  },
  unresponsive_breathing: {
    color: '#B4801F',
    d: (
      <>
        <circle cx="6.5" cy="12" r="3" />
        <path d="M10 15h8a2.5 2.5 0 0 0 0-5h-6" />
      </>
    ),
  },
  cardiac_arrest_cpr: {
    color: '#C0322A',
    d: <path d="M12 20S4 14.6 4 9.8A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 20 9.8C20 14.6 12 20 12 20Z" />,
  },
  burns: {
    color: '#B4801F',
    d: <path d="M13 3c1 3-3 4-3 7a3 3 0 0 0 6 0c0-1 0-2-.6-3 2.3 1.6 3.6 3.7 3.6 6a7 7 0 0 1-14 0C5 8 9 5.6 13 3Z" />,
  },
  electrical_shock: {
    color: '#B4801F',
    d: <path d="M13.5 3 6 13.5h5L9.5 21 18 10.5h-5.2L13.5 3Z" />,
  },
  seizure: {
    color: '#B4801F',
    d: <path d="M3 12h3l2.5-6 3 12 2.5-6H21" />,
  },
  fracture_serious_injury: {
    color: '#16243B',
    d: (
      <>
        <path d="M6 4c2.5 0 2.5 3 0 3s-2.5 3 0 3l5 5c0 2.5 3 2.5 3 0" />
        <path d="M14 4c0 2.5 3 2.5 3 0" />
      </>
    ),
  },
  heat_illness: {
    color: '#B4801F',
    d: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19" />
      </>
    ),
  },
  poisoning: {
    color: '#C0322A',
    d: (
      <>
        <path d="M9 3h6M10 3v4L6.5 17a3 3 0 0 0 2.8 4h5.4a3 3 0 0 0 2.8-4L14 7V3" />
        <path d="M7.5 13h9" />
      </>
    ),
  },
};

export function CaseIcon({ flowId, size = 26 }) {
  const icon = PATHS[flowId];
  if (!icon) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={icon.color}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icon.d}
    </svg>
  );
}
