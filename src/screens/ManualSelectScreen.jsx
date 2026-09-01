import React from 'react';
import { useApp } from '../app/AppContext.jsx';
import { CaseGrid } from '../components/CaseGrid.jsx';
import { IconButton } from '../components/ui.jsx';
import { BackIcon as Chevron } from '../components/Logo.jsx';

/** Manual selection — always available, never depends on the network. */
export function ManualSelectScreen({ onStart, onHome }) {
  const { lang } = useApp();
  return (
    <div className="min-h-full bg-app">
      <header className="flex items-center gap-3.5 px-6 py-5">
        <IconButton onClick={onHome} aria-label={lang === 'ar' ? 'رجوع' : 'Back'}>
          <Chevron flip={lang === 'ar'} />
        </IconButton>
        <h1 className="flex flex-wrap items-baseline gap-x-3 text-xl font-semibold text-ink">
          <span>{lang === 'ar' ? 'اختر الحالة' : 'Choose emergency'}</span>
          <span
            dir={lang === 'ar' ? 'ltr' : 'rtl'}
            className={`text-sm font-normal text-muted-2 ${lang === 'ar' ? 'font-latin' : ''}`}
          >
            {lang === 'ar' ? 'Choose emergency' : 'اختر الحالة'}
          </span>
        </h1>
      </header>

      <div className="mx-auto max-w-[900px] px-6 pb-10">
        <CaseGrid onStart={onStart} />
      </div>
    </div>
  );
}
