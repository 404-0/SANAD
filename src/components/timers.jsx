import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../app/AppContext.jsx';

/** Shared shell for the three small live widgets. */
function Tile({ children, tone = 'neutral' }) {
  const tones = {
    neutral: 'bg-card',
    warn: 'bg-tint-warn',
    danger: 'bg-tint-danger',
  };
  return <div className={`flex items-center justify-between gap-4 rounded-2xl p-4 shadow-card ${tones[tone]}`}>{children}</div>;
}

function MiniButton({ children, active, ...props }) {
  return (
    <button
      type="button"
      className={`h-10 rounded-xl px-4 text-sm font-medium transition-colors ${
        active ? 'bg-brand text-on-brand' : 'bg-sub text-brand hover:bg-sub-hover'
      }`}
      {...props}
    >
      {children}
    </button>
  );
}

const format = (totalSeconds) => {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
};

/** Rendered for any node whose `sets` starts a timer (e.g. timing a seizure). */
export function Stopwatch() {
  const { lang } = useApp();
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);

  const elapsed = (now - startedAt) / 1000;

  return (
    <Tile tone={elapsed >= 300 ? 'danger' : 'neutral'}>
      <div>
        <p className="font-latin text-xs tracking-[0.1em] text-muted-3">
          {lang === 'ar' ? 'المدة · DURATION' : 'DURATION · المدة'}
        </p>
        <p dir="ltr" className="font-latin mt-1 text-4xl tabular-nums text-ink">
          {format(elapsed)}
        </p>
      </div>
      <div className="flex gap-2">
        <MiniButton onClick={() => setRunning((value) => !value)}>
          {running ? 'إيقاف · Stop' : 'تشغيل · Start'}
        </MiniButton>
        <MiniButton
          onClick={() => {
            setStartedAt(Date.now());
            setNow(Date.now());
            setRunning(true);
          }}
        >
          00:00
        </MiniButton>
      </div>
    </Tile>
  );
}

/** Countdown driven by a monitor node's own `loop.interval_seconds`. */
export function RecheckTimer({ loop, onRecheck }) {
  const { lang } = useApp();
  const total = loop.intervalSeconds || 0;
  const [remaining, setRemaining] = useState(total);
  const deadline = useRef(Date.now() + total * 1000);

  useEffect(() => {
    const id = setInterval(() => setRemaining(Math.max(0, (deadline.current - Date.now()) / 1000)), 500);
    return () => clearInterval(id);
  }, []);

  const due = remaining <= 0;

  return (
    <Tile tone={due ? 'warn' : 'neutral'}>
      <div>
        <p className="font-latin text-xs tracking-[0.1em] text-muted-3">
          {due ? (lang === 'ar' ? 'وقت إعادة الفحص' : 'RE-CHECK NOW') : lang === 'ar' ? 'الفحص القادم' : 'NEXT CHECK'}
        </p>
        <p dir="ltr" className="font-latin mt-1 text-4xl tabular-nums text-ink">
          {format(remaining)}
        </p>
      </div>
      {due && loop.recheckNodeId ? (
        <MiniButton active onClick={() => onRecheck(loop.recheckNodeId)}>
          {lang === 'ar' ? 'أعد الفحص' : 'Re-check'}
        </MiniButton>
      ) : (
        <MiniButton
          onClick={() => {
            deadline.current = Date.now() + total * 1000;
            setRemaining(total);
          }}
        >
          {lang === 'ar' ? 'إعادة' : 'Reset'}
        </MiniButton>
      )}
    </Tile>
  );
}

/** Detects a "100–120 per minute" style rate inside node text. */
export function extractRate(...texts) {
  for (const text of texts) {
    if (!text) continue;
    const match = String(text).match(/(\d{2,3})\s*[–—-]\s*(\d{2,3})/);
    if (match) {
      const low = Number(match[1]);
      const high = Number(match[2]);
      if (low >= 60 && high <= 200 && high > low) return Math.round((low + high) / 2);
    }
  }
  return null;
}

/** Metronome for compression-rate loop nodes. */
export function Pacer({ bpm }) {
  const { lang } = useApp();
  const [on, setOn] = useState(false);
  const [beat, setBeat] = useState(0);
  const audioRef = useRef(null);

  useEffect(() => {
    if (!on) return undefined;
    const id = setInterval(() => {
      setBeat((value) => value + 1);
      try {
        if (!audioRef.current) {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (Ctx) audioRef.current = new Ctx();
        }
        const ctx = audioRef.current;
        if (!ctx) return;
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.07);
      } catch {
        /* audio is a nice-to-have; the visual beat still works */
      }
    }, 60000 / bpm);
    return () => clearInterval(id);
  }, [on, bpm]);

  return (
    <Tile tone={on ? 'danger' : 'neutral'}>
      <div className="flex items-center gap-4">
        <span
          key={beat}
          className={`inline-block h-9 w-9 rounded-full border-2 ${on ? 'border-danger bg-tint-danger' : 'border-line'}`}
        />
        <div>
          <p className="font-latin text-xs tracking-[0.1em] text-muted-3">
            {lang === 'ar' ? 'إيقاع الضغطات' : 'COMPRESSION PACE'}
          </p>
          <p dir="ltr" className="font-latin text-lg text-ink">
            {bpm} / min
          </p>
        </div>
      </div>
      <MiniButton active={on} onClick={() => setOn((value) => !value)}>
        {on ? (lang === 'ar' ? 'إيقاف' : 'Stop') : lang === 'ar' ? 'تشغيل' : 'Start'}
      </MiniButton>
    </Tile>
  );
}
