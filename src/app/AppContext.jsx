import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRegistry } from '../engine/flowRegistry.js';
import { rawFlowEntries } from '../data/loadFlows.js';
import { DEFAULT_REGION_ID } from '../config/regions.js';
import { t, pick } from '../i18n/strings.js';
import { readSetting, writeSetting } from './storage.js';
import { setPreferredVoice } from '../voice/speech.js';

const AppContext = createContext(null);

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const systemPrefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export function AppProvider({ children }) {
  const [lang, setLangState] = useState(() => readSetting('lang', 'ar'));
  const [themeChoice, setThemeChoice] = useState(() => readSetting('theme', 'auto'));
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const [swapping, setSwapping] = useState(false);
  const [regionId, setRegionId] = useState(() => readSetting('region', DEFAULT_REGION_ID));
  const [customNumber, setCustomNumber] = useState(() => readSetting('customNumber', ''));
  const [textScale, setTextScale] = useState(() => readSetting('textScale', 'normal'));
  const [readAloud, setReadAloud] = useState(() => readSetting('readAloud', true));
  // Which browser voice to use, per language. Only relevant for steps with no
  // pre-rendered clip — but that is every step until `npm run tts` has been run,
  // so it is the voice most people actually hear.
  const [voiceUris, setVoiceUris] = useState(() => readSetting('voices', { ar: null, en: null }));
  const swapTimers = useRef([]);

  const registry = useMemo(() => createRegistry(rawFlowEntries), []);
  const resolvedTheme = themeChoice === 'auto' ? (systemDark ? 'dark' : 'light') : themeChoice;

  useEffect(() => writeSetting('lang', lang), [lang]);
  useEffect(() => writeSetting('theme', themeChoice), [themeChoice]);
  useEffect(() => writeSetting('region', regionId), [regionId]);
  useEffect(() => writeSetting('customNumber', customNumber), [customNumber]);
  useEffect(() => writeSetting('textScale', textScale), [textScale]);
  useEffect(() => writeSetting('readAloud', readAloud), [readAloud]);

  // The speech module is framework-free on purpose, so the choice is pushed
  // into it rather than read out of React state at every utterance.
  useEffect(() => {
    writeSetting('voices', voiceUris);
    setPreferredVoice('ar', voiceUris.ar);
    setPreferredVoice('en', voiceUris.en);
  }, [voiceUris]);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return undefined;
    const onChange = (event) => setSystemDark(event.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolvedTheme === 'dark' ? '#0E1218' : '#EFEFEC');
  }, [resolvedTheme]);

  useEffect(() => () => swapTimers.current.forEach(clearTimeout), []);

  /**
   * Switching language flips the whole document between RTL and LTR, which
   * reflows every screen at once — that is the flicker. So the swap is hidden:
   * a real crossfade where the browser supports view transitions, and a short
   * blur-and-fade everywhere else. The DOM only changes while it is invisible.
   */
  const swap = useCallback((apply) => {
    if (prefersReducedMotion()) {
      apply();
      return;
    }
    if (document.startViewTransition) {
      document.startViewTransition(() => flushSync(apply));
      return;
    }
    setSwapping(true);
    swapTimers.current.push(
      setTimeout(() => flushSync(apply), 170),
      setTimeout(() => setSwapping(false), 200),
    );
  }, []);

  const setLang = useCallback(
    (next) => {
      if (next === lang) return;
      swap(() => setLangState(next));
    },
    [lang, swap],
  );

  const setTheme = useCallback(
    (next) => {
      if (next === themeChoice) return;
      swap(() => setThemeChoice(next));
    },
    [themeChoice, swap],
  );

  const value = useMemo(
    () => ({
      lang,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      secondaryDir: lang === 'ar' ? 'ltr' : 'rtl',
      setLang,
      swapping,
      themeChoice,
      theme: resolvedTheme,
      setTheme,
      regionId,
      setRegionId,
      customNumber,
      setCustomNumber,
      textScale,
      setTextScale,
      scale: textScale === 'large' ? 1.28 : 1,
      readAloud,
      setReadAloud,
      voiceUris,
      setVoiceUri: (language, uri) =>
        setVoiceUris((current) => ({ ...current, [language]: uri || null })),
      registry,
      tr: (key) => t(key, lang),
      /** Primary-language value of an { ar, en } pair. */
      L: (pair) => pick(pair, lang),
      /** The other language of an { ar, en } pair, for the bilingual echo. */
      S: (pair) => pick(pair, lang === 'ar' ? 'en' : 'ar'),
    }),
    [
      lang,
      setLang,
      swapping,
      themeChoice,
      resolvedTheme,
      setTheme,
      regionId,
      customNumber,
      textScale,
      readAloud,
      voiceUris,
      registry,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside <AppProvider>');
  return context;
}
