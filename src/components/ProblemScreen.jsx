import React from 'react';
import { useApp } from '../app/AppContext.jsx';
import { Action, Eyebrow } from './ui.jsx';

/**
 * Graceful degradation: a missing node, an undeclared transition, or a flow
 * that has not been authored. Plain language, never a raw error, and the call
 * button in the header still works.
 */
export function ProblemScreen({ status, problem, canGoBack, onBack, onRestart, onHome }) {
  const { lang, scale } = useApp();
  const missingFlow = problem?.code === 'flow_missing';

  return (
    <div className="fade-in mx-auto flex w-full max-w-[620px] flex-1 flex-col justify-center gap-6">
      <Eyebrow ar="تعذّر المتابعة" en="CANNOT CONTINUE" color="var(--color-danger)" />

      <div>
        <h1 className="font-semibold leading-tight text-ink" style={{ fontSize: `${30 * scale}px` }}>
          {missingFlow
            ? lang === 'ar'
              ? 'هذا الدليل غير متوفر بعد'
              : 'This guidance is not available yet'
            : lang === 'ar'
              ? 'ما نقدر نكمل هذه الخطوة'
              : "We can't continue this step"}
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-muted">
          {lang === 'ar'
            ? 'لا تنتظر التطبيق — اتصل بالإسعاف واستمر بآخر تعليمة صحيحة.'
            : "Don't wait for the app — call for help and keep following the last instruction."}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {canGoBack ? <Action tone="primary" ar="ارجع للخطوة السابقة" en="Back one step" onClick={onBack} /> : null}
        <Action tone="safe" ar="ابدأ من جديد" en="Start over" onClick={onRestart} />
        <button type="button" onClick={onHome} className="text-sm text-muted-2 underline underline-offset-4 hover:text-brand">
          {lang === 'ar' ? 'الرئيسية' : 'Home'}
        </button>
      </div>

      <p dir="ltr" className="font-latin text-start text-xs text-muted-3">
        {status} · {problem?.code} · {problem?.message}
      </p>
    </div>
  );
}
