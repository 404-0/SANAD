import React, { useState } from 'react';
import { useApp } from '../app/AppContext.jsx';
import { Modal, Action, Eyebrow } from './ui.jsx';
import { handoverText } from '../engine/handoverSummary.js';

/**
 * Opens the moment the user calls for help: the step they were on stays put
 * behind it, and this tells them what the dispatcher is about to ask. Every
 * line is something the session actually recorded.
 */
export function HandoverSheet({ handover, onClose }) {
  const { lang, L, S } = useApp();
  const [copied, setCopied] = useState(false);
  if (!handover) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(handoverText(handover, lang));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the text is on screen anyway */
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col gap-5">
        <Eyebrow ar="قول لهم هذا" en="TELL THEM THIS" color="var(--color-danger)" />

        <dl className="flex flex-col gap-3">
          <div>
            <dt className="text-xs tracking-[0.1em] text-muted-3">
              {lang === 'ar' ? 'الحالة · CASE' : 'CASE · الحالة'}
            </dt>
            <dd className="text-xl font-semibold text-ink">{L(handover.caseName)}</dd>
            <dd className="text-sm text-muted-2">{S(handover.caseName)}</dd>
          </div>

          {handover.ageLabel ? (
            <div>
              <dt className="text-xs tracking-[0.1em] text-muted-3">
                {lang === 'ar' ? 'المصاب · CASUALTY' : 'CASUALTY · المصاب'}
              </dt>
              <dd className="text-lg text-ink">
                {lang === 'ar' ? handover.ageLabel.ar : handover.ageLabel.en}
              </dd>
            </div>
          ) : null}

          {handover.elapsedMinutes != null ? (
            <div>
              <dt className="text-xs tracking-[0.1em] text-muted-3">
                {lang === 'ar' ? 'من متى · SINCE' : 'SINCE · من متى'}
              </dt>
              <dd className="text-lg text-ink">
                {lang === 'ar'
                  ? `${handover.elapsedMinutes} دقيقة`
                  : `${handover.elapsedMinutes} min`}
              </dd>
            </div>
          ) : null}

          {handover.done.length ? (
            <div>
              <dt className="text-xs tracking-[0.1em] text-muted-3">
                {lang === 'ar' ? 'اللي سويناه · DONE SO FAR' : 'DONE SO FAR · اللي سويناه'}
              </dt>
              <dd>
                <ul className="mt-1 flex flex-col gap-1">
                  {handover.done.map((line) => (
                    <li key={line.en} className="text-[15px] text-ink">
                      • {lang === 'ar' ? line.ar : line.en}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="flex flex-col gap-2">
          <Action tone="primary" ar="رجوع للخطوة" en="Back to the step" onClick={onClose} />
          <button
            type="button"
            onClick={copy}
            className="rounded-xl bg-sub px-4 py-3 text-[15px] font-medium text-brand hover:bg-sub-hover"
          >
            {copied
              ? lang === 'ar'
                ? 'اننسخ'
                : 'Copied'
              : lang === 'ar'
                ? 'انسخ النص'
                : 'Copy as text'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
