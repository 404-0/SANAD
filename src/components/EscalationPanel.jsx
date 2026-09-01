import React, { useState } from 'react';
import { useApp } from '../app/AppContext.jsx';
import { humanize } from '../i18n/labels.js';
import { Action, Eyebrow } from './ui.jsx';

/**
 * Flow-level `global_escalations`. A trigger the engine can evaluate (e.g.
 * "dressings_soaked_count >= 2") appears as an alert the moment it is true; the
 * rest sit behind one quiet line, because only the person on scene can see them.
 */
export function EscalationPanel({ escalations, onChoose }) {
  const { lang, L } = useApp();
  const [open, setOpen] = useState(false);
  if (!escalations.length) return null;

  const fired = escalations.filter((item) => item.kind === 'auto' && item.fired);
  const manual = escalations.filter((item) => item.kind === 'manual');
  const label = (item) => L(item.reason) || humanize(item.trigger || item.id);

  return (
    <div className="flex flex-col gap-3">
      {fired.map((item) => (
        <div key={item.id} className="flex flex-col gap-3 rounded-2xl bg-tint-danger p-4">
          <Eyebrow ar="تنبيه" en="ALERT" color="var(--color-danger)" />
          <p className="text-xl font-semibold text-ink">{label(item)}</p>
          <Action tone="danger" ar="أكمل" en="Continue" onClick={() => onChoose(item.ref)} />
        </div>
      ))}

      {manual.length ? (
        <div>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="text-sm text-muted-2 underline underline-offset-4 hover:text-brand"
          >
            {lang === 'ar' ? 'تغيّرت الحالة؟' : 'Has the situation changed?'}
          </button>
          {open ? (
            <div className="mt-3 flex flex-col gap-2">
              {manual.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChoose(item.ref)}
                  className="rounded-xl bg-card px-4 py-3 text-start text-base text-ink shadow-card hover:shadow-lift"
                >
                  {label(item)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
