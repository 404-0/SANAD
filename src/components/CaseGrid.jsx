import React from 'react';
import { useApp } from '../app/AppContext.jsx';
import { homeSort } from '../config/uiOrder.js';
import { CaseIcon } from './caseIcons.jsx';
import { shortName } from '../config/caseLabels.js';

/** The 10 emergency cases as one grid of cards. */
export function CaseGrid({ onStart }) {
  const { registry, L, S, lang } = useApp();
  const flows = registry.list().slice().sort(homeSort);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {flows.map((flow) => (
        <button
          key={flow.id}
          type="button"
          onClick={() => onStart(flow.id)}
          className="flex min-h-[130px] flex-col items-start gap-2 rounded-2xl bg-card p-5 text-start shadow-card transition-shadow duration-150 hover:shadow-lift"
        >
          <CaseIcon flowId={flow.id} />
          <span className="text-[17px] font-semibold leading-snug text-ink">{L(shortName(flow))}</span>
          <span
            dir={lang === 'ar' ? 'ltr' : 'rtl'}
            className={`text-[13px] text-muted-2 ${lang === 'ar' ? 'font-latin' : ''}`}
          >
            {S(shortName(flow))}
          </span>
        </button>
      ))}
    </div>
  );
}
