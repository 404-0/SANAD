import { useCallback, useEffect, useRef, useState } from 'react';
import {
  speak,
  listen,
  stopSpeaking,
  ttsSupported,
  sttSupported,
  loadAudioManifest,
  clipFor,
  playClip,
} from './speech.js';
import { matchCommand } from './commands.js';

/**
 * Hands-free guidance.
 *
 * Reads the current step out loud, then listens for an answer and drives the
 * same buttons the screen shows. Deliberately conservative: it acts only on a
 * confident match, shows everything it heard, and every action remains
 * available by touch at all times.
 */
export function useVoiceGuide({ lang, enabled, speakText, options, onCommand, clip }) {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [error, setError] = useState(null);
  const stopListenRef = useRef(null);
  const cancelSpeakRef = useRef(null);
  const optionsRef = useRef(options);
  const handlerRef = useRef(onCommand);
  const lastActedRef = useRef('');

  optionsRef.current = options;
  handlerRef.current = onCommand;

  const stopAll = useCallback(() => {
    cancelSpeakRef.current?.();
    stopListenRef.current?.();
    cancelSpeakRef.current = null;
    stopListenRef.current = null;
    stopSpeaking();
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (!sttSupported()) {
      setError('unsupported');
      return;
    }
    stopListenRef.current?.();
    setListening(true);
    stopListenRef.current = listen({
      lang,
      onResult: ({ transcript, alternatives, isFinal }) => {
        setHeard(transcript);
        if (!isFinal) return;
        // Try every alternative the recogniser offered; take the first that
        // maps cleanly onto something on screen.
        for (const candidate of alternatives?.length ? alternatives : [transcript]) {
          const command = matchCommand(candidate, optionsRef.current || []);
          if (!command) continue;
          const signature = `${command.action}:${command.ref || ''}:${transcript}`;
          if (signature === lastActedRef.current) return;
          lastActedRef.current = signature;
          handlerRef.current?.(command);
          return;
        }
      },
      onError: (reason) => {
        if (reason === 'no_speech') return;
        setError(reason);
        setListening(false);
      },
      onEnd: () => setListening(false),
    });
  }, [lang]);

  // Read the step, then listen. Re-runs whenever the step changes.
  useEffect(() => {
    if (!enabled) {
      stopAll();
      return undefined;
    }
    setError(null);
    setHeard('');
    lastActedRef.current = '';
    stopListenRef.current?.();
    setListening(false);

    // A pre-rendered clip sounds far better than any built-in voice, and works
    // offline. Fall back to synthesis when there is no clip for this step.
    const speakFallback = () => {
      cancelSpeakRef.current = speak(speakText, { lang, onEnd: () => startListening() });
    };
    const stopClip = clip
      ? playClip(clip, { onEnd: (error) => (error ? speakFallback() : startListening()) })
      : null;
    if (stopClip) cancelSpeakRef.current = stopClip;
    else speakFallback();

    return () => {
      cancelSpeakRef.current?.();
      stopListenRef.current?.();
      stopSpeaking();
    };
    // speakText is a stable string list built from the current node.
  }, [enabled, lang, clip, JSON.stringify(speakText), startListening, stopAll]);

  useEffect(() => {
    loadAudioManifest();
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  const repeat = useCallback(() => {
    cancelSpeakRef.current?.();
    const stopClip = clip ? playClip(clip, { onEnd: () => startListening() }) : null;
    cancelSpeakRef.current =
      stopClip || speak(speakText, { lang, onEnd: () => startListening() });
  }, [speakText, lang, startListening, clip]);

  return {
    listening,
    heard,
    error,
    repeat,
    supported: { tts: ttsSupported(), stt: sttSupported() },
  };
}
