import React from 'react';
import { useApp } from '../app/AppContext.jsx';
import { resolveEmergencyNumber } from '../engine/emergencyNumber.js';
import { PhoneIcon } from './Logo.jsx';

/**
 * The persistent emergency-call control. The number is resolved from the flow's
 * own emergency_number block, then the app's region table, then whatever the
 * user configured — never hardcoded. With no number configured it opens
 * settings instead of dialling something we cannot stand behind.
 */
export function CallButton({ flow, onNeedsNumber, onCalled }) {
  const { regionId, customNumber, lang } = useApp();
  const resolved = resolveEmergencyNumber({ flow, regionId, customNumber });

  const className =
    'flex h-[38px] shrink-0 items-center gap-2 rounded-xl bg-danger px-4 text-[15px] font-semibold text-white transition-colors hover:bg-danger-hover';

  if (!resolved.number) {
    return (
      <button type="button" onClick={onNeedsNumber} className={className}>
        <PhoneIcon />
        <span>{lang === 'ar' ? 'حدد الرقم' : 'Set number'}</span>
      </button>
    );
  }

  return (
    <a
      href={`tel:${resolved.number}`}
      onClick={onCalled}
      className={className}
      title={resolved.source?.title || undefined}
    >
      <PhoneIcon />
      <span dir="ltr" className="font-latin tabular-nums">
        {resolved.number}
      </span>
    </a>
  );
}
