import React from 'react';
import { useApp } from '../app/AppContext.jsx';
import { Action, Eyebrow } from './ui.jsx';
import { shortName } from '../config/caseLabels.js';

/**
 * Cross-flow handover. States why the case changed, keeps any `carry_over`
 * instruction visible, and needs one deliberate tap.
 */
export function TransitionInterstitial({ pending, registry, onConfirm, onCancel }) {
  const { lang, L, S, scale } = useApp();
  const { def, available } = pending;
  const targetFlow = registry.get(def.targetFlowId);

  return (
    <div className="fade-in mx-auto flex w-full max-w-[620px] flex-1 flex-col justify-center gap-7">
      <Eyebrow ar="تغيّرت الحالة" en="SITUATION CHANGED" color="var(--color-danger)" />

      <div>
        <h1
          className="font-semibold leading-[1.25] tracking-[-0.02em] text-ink"
          style={{ fontSize: `${34 * scale}px` }}
        >
          {L(def.reason) || (targetFlow ? L(targetFlow.name) : def.targetFlowId)}
        </h1>
        <p
          dir={lang === 'ar' ? 'ltr' : 'rtl'}
          className={`mt-3 text-start text-muted ${lang === 'ar' ? 'font-latin' : ''}`}
          style={{ fontSize: `${20 * scale}px` }}
        >
          {S(def.reason)}
        </p>
      </div>

      {def.carryOver.length ? (
        <div className="rounded-2xl bg-card p-4 shadow-card">
          <p className="font-latin text-xs tracking-[0.1em] text-muted-3">
            {lang === 'ar' ? 'استمر بهذا · KEEP DOING' : 'KEEP DOING · استمر بهذا'}
          </p>
          {def.carryOver.map((item) => (
            <p key={item} dir="ltr" className="font-latin mt-2 text-start text-base text-ink">
              {item}
            </p>
          ))}
        </div>
      ) : null}

      {available && targetFlow ? (
        <Action
          tone="danger"
          large
          ar={`ابدأ: ${shortName(targetFlow).ar}`}
          en={`Start: ${shortName(targetFlow).en}`}
          onClick={onConfirm}
        />
      ) : (
        <div className="rounded-2xl bg-tint-danger p-5">
          <p className="text-xl font-semibold text-ink">
            {lang === 'ar' ? 'هذا الدليل غير متوفر بعد' : 'This guidance is not available yet'}
          </p>
          <p className="mt-2 text-base leading-relaxed text-muted">
            {lang === 'ar'
              ? 'اتصل بخدمات الطوارئ الآن واتبع تعليماتهم.'
              : 'Call emergency services now and follow their instructions.'}
          </p>
        </div>
      )}

      <button type="button" onClick={onCancel} className="text-sm text-muted-2 underline underline-offset-4 hover:text-brand">
        {lang === 'ar' ? 'ارجع للخطوة السابقة' : 'Back to the previous step'}
      </button>
    </div>
  );
}
