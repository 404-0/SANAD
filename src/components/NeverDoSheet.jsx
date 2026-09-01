import React from 'react';
import { useApp } from '../app/AppContext.jsx';
import { Modal, Action, Eyebrow } from './ui.jsx';

/** Flow-level `never_do` rules, one tap away from any screen of that flow. */
export function NeverDoSheet({ flow, onClose }) {
  const { lang } = useApp();
  const rules = flow.neverDo || [];

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Eyebrow ar="ممنوع" en="NEVER DO" color="var(--color-danger)" />
        <ul className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto">
          {rules.map((rule, index) => (
            <li key={index} className="rounded-xl bg-tint-danger p-4 text-lg font-medium text-ink">
              {lang === 'ar' ? rule.rule_ar || rule.rule_en : rule.rule_en || rule.rule_ar}
              <span
                dir={lang === 'ar' ? 'ltr' : 'rtl'}
                className={`mt-1 block text-sm font-normal text-muted-2 ${lang === 'ar' ? 'font-latin' : ''}`}
              >
                {lang === 'ar' ? rule.rule_en : rule.rule_ar}
              </span>
            </li>
          ))}
          {!rules.length ? <li className="text-muted-2">—</li> : null}
        </ul>
        <Action tone="primary" ar="تم" en="Close" onClick={onClose} />
      </div>
    </Modal>
  );
}
