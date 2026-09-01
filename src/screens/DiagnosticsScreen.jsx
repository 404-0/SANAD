import React from 'react';
import { useApp } from '../app/AppContext.jsx';
import { IconButton } from '../components/ui.jsx';
import { BackIcon } from '../components/Logo.jsx';
import { StepArt, ART_KEYS } from '../components/StepArt.jsx';

/** Developer view: what the flow validator found. Reached from Settings. */
export function DiagnosticsScreen({ onHome }) {
  const { registry, lang } = useApp();

  return (
    <div className="min-h-full bg-app">
      <header className="flex items-center gap-3.5 px-6 py-5">
        <IconButton onClick={onHome} aria-label={lang === 'ar' ? 'رجوع' : 'Back'}>
          <BackIcon flip={lang === 'ar'} />
        </IconButton>
        <h1 className="font-latin text-xl font-semibold text-ink">Flow diagnostics</h1>
      </header>

      <div className="mx-auto flex max-w-[720px] flex-col gap-4 px-6 pb-12">
        <div className="grid grid-cols-3 gap-3">
          {[
            [registry.list().length, 'flows'],
            [registry.errors.length, 'errors'],
            [registry.warnings.length, 'warnings'],
          ].map(([value, label]) => (
            <div key={label} className="rounded-2xl bg-card p-4 shadow-card">
              <p className="font-latin text-3xl text-ink">{value}</p>
              <p className="font-latin text-xs tracking-[0.1em] text-muted-3">{label.toUpperCase()}</p>
            </div>
          ))}
        </div>

        {registry.issues.length ? (
          <ul className="flex flex-col gap-2">
            {registry.issues.map((issue, index) => (
              <li key={index} dir="ltr" className="font-latin rounded-xl bg-card p-3 text-start text-xs shadow-card">
                <span className={issue.severity === 'error' ? 'text-danger' : 'text-amber'}>
                  [{issue.severity}] {issue.flowId}
                  {issue.nodeId ? ` @${issue.nodeId}` : ''} · {issue.code}
                </span>
                <span className="block text-muted-2">{issue.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-latin text-muted">All flow files are structurally valid.</p>
        )}

        <div>
          <p className="font-latin mb-2 text-xs tracking-[0.1em] text-muted-3">STEP DIAGRAMS</p>
          <div className="grid grid-cols-2 gap-3">
            {ART_KEYS.map((key) => (
              <div key={key} className="flex flex-col items-center gap-2">
                <StepArt art={key} />
                <span className="font-latin text-[11px] text-muted-2">{key}</span>
              </div>
            ))}
          </div>
        </div>

        <ul className="flex flex-col gap-1">
          {registry.list().map((flow) => (
            <li key={flow.id} dir="ltr" className="font-latin text-start text-xs text-muted-2">
              {flow.id} · {flow.nodes.size} nodes · depth {flow.maxDepth} ·{' '}
              {Object.keys(flow.transitions).length} transitions
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
