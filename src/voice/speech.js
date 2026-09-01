/**
 * Thin wrappers over the browser's speech APIs.
 *
 * Both are optional: every screen works with the keyboard and the buttons if
 * speech is missing or refused, which is the whole point of Phase 6. Nothing
 * here decides anything — it only reads out text the flow already contains and
 * hands raw transcripts back to the caller.
 */

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/**
 * Clips rendered by `npm run tts`. Loaded once; absent in a build that was
 * never given a TTS key, in which case everything falls back to the browser
 * voice automatically.
 */
let audioManifest = null;
let manifestLoading = null;

export function loadAudioManifest() {
  if (audioManifest) return Promise.resolve(audioManifest);
  if (manifestLoading) return manifestLoading;
  manifestLoading = fetch('/audio/manifest.json')
    .then((response) => (response.ok ? response.json() : {}))
    .catch(() => ({}))
    .then((json) => {
      audioManifest = json || {};
      return audioManifest;
    });
  return manifestLoading;
}

export const clipFor = (flowId, nodeId, lang) => audioManifest?.[`${flowId}/${nodeId}.${lang}`] || null;

/**
 * Plays a pre-rendered clip. Resolves false if there is no clip or playback is
 * blocked, so the caller can fall back to speech synthesis.
 */
export function playClip(url, { onEnd } = {}) {
  if (!url || typeof Audio === 'undefined') return null;
  const audio = new Audio(url);
  audio.addEventListener('ended', () => onEnd?.());
  audio.addEventListener('error', () => onEnd?.('error'));
  const promise = audio.play();
  if (promise?.catch) promise.catch(() => onEnd?.('error'));
  return () => {
    audio.pause();
    audio.currentTime = 0;
  };
}

export const sttSupported = () =>
  typeof window !== 'undefined' &&
  Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

const voiceTag = (lang) => (lang === 'ar' ? 'ar' : 'en');

/**
 * A voice chosen by the user, which beats every heuristic below.
 * Set from Settings; `null` means "pick the best one you can find".
 */
const chosenVoiceUri = { ar: null, en: null };

export function setPreferredVoice(lang, voiceUri) {
  chosenVoiceUri[lang === 'ar' ? 'ar' : 'en'] = voiceUri || null;
}

/**
 * Browsers load their voice list asynchronously, and the first call usually
 * returns nothing. Anything that shows voices to the user has to wait for this
 * or it renders an empty menu on first open.
 */
export function onVoicesReady(callback) {
  if (!ttsSupported()) return () => {};
  const fire = () => callback(listVoices());
  if (window.speechSynthesis.getVoices()?.length) fire();
  window.speechSynthesis.addEventListener?.('voiceschanged', fire);
  return () => window.speechSynthesis.removeEventListener?.('voiceschanged', fire);
}

/**
 * Ranks how good a voice is likely to sound, best first.
 *
 * Platforms ship two generations of voice under the same API: the old formant
 * synthesisers (Windows' "Hoda", "Naayf") that produce the robotic drone people
 * complain about, and modern neural ones ("Natural", "Online", "Neural",
 * "Enhanced", "Premium"). The API exposes no quality field, so the name and the
 * local/remote flag are the only signals available — remote voices are almost
 * always the neural ones.
 */
function rank(voice, wanted) {
  const name = `${voice.name} ${voice.voiceURI || ''}`.toLowerCase();
  const locale = (voice.lang || '').toLowerCase();
  let score = 0;

  if (/natural|neural|online|premium|enhanced/.test(name)) score += 8;
  if (voice.localService === false) score += 3;
  if (/compact|espeak|festival/.test(name)) score -= 4;
  // Windows' legacy Arabic voices — the exact ones this app was described as
  // sounding like an old man through a wall.
  if (/hoda|naayf|hedda|zira desktop|david desktop/.test(name)) score -= 6;

  if (wanted === 'ar') {
    if (locale.startsWith('ar-iq')) score += 5;
    else if (/ar-(sa|kw|jo|ae|lb|eg)/.test(locale)) score += 2;
  }
  return score;
}

/** Every voice that can speak this language, best first. */
export function listVoices(lang = 'ar') {
  if (!ttsSupported()) return [];
  const wanted = voiceTag(lang);
  return (window.speechSynthesis.getVoices() || [])
    .filter((voice) => voice.lang?.toLowerCase().startsWith(wanted))
    .sort((a, b) => rank(b, wanted) - rank(a, wanted) || a.name.localeCompare(b.name));
}

/**
 * Whether any voice for this language is a modern neural one.
 *
 * Worth asking because the answer is usually "no" on Windows in Chrome, where
 * the only Arabic voice is a legacy synthesiser — and the fix is not in this
 * app: Edge exposes Microsoft's online neural voices to the same API, so the
 * same page sounds completely different there. Better to say so than to let
 * someone conclude the app is broken.
 */
export function hasNaturalVoice(lang = 'ar') {
  return listVoices(lang).some((voice) =>
    /natural|neural|online|premium|enhanced/i.test(`${voice.name} ${voice.voiceURI || ''}`),
  );
}

/** The user's choice if they made one, otherwise the best-ranked voice. */
function pickVoice(lang) {
  if (!ttsSupported()) return null;
  const ranked = listVoices(lang);
  const wanted = chosenVoiceUri[voiceTag(lang)];
  return (wanted && ranked.find((voice) => voice.voiceURI === wanted)) || ranked[0] || null;
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

/**
 * Speaks a list of phrases in order. Returns a cancel function; `onEnd` fires
 * once everything has been said (or immediately if speech is unavailable).
 */
export function speak(phrases, { lang = 'ar', rate = 0.98, onEnd } = {}) {
  const list = (Array.isArray(phrases) ? phrases : [phrases]).filter(Boolean);
  if (!ttsSupported() || !list.length) {
    onEnd?.();
    return () => {};
  }

  stopSpeaking();
  const voice = pickVoice(lang);
  let cancelled = false;

  list.forEach((text, index) => {
    const utterance = new SpeechSynthesisUtterance(String(text));
    utterance.lang = voice?.lang || (lang === 'ar' ? 'ar-SA' : 'en-US');
    if (voice) utterance.voice = voice;
    utterance.rate = rate;
    if (index === list.length - 1) {
      utterance.onend = () => {
        if (!cancelled) onEnd?.();
      };
      utterance.onerror = () => {
        if (!cancelled) onEnd?.();
      };
    }
    window.speechSynthesis.speak(utterance);
  });

  return () => {
    cancelled = true;
    stopSpeaking();
  };
}

/**
 * Starts continuous recognition. Returns a stop function. `onResult` receives
 * ({ transcript, isFinal }); `onError` receives a short reason string, never a
 * raw browser error object.
 */
export function listen({ lang = 'ar', onResult, onError, onEnd } = {}) {
  if (!sttSupported()) {
    onError?.('unsupported');
    return () => {};
  }

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new Recognition();
  recognition.lang = lang === 'ar' ? 'ar-SA' : 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;

  let stopped = false;
  let restarts = 0;
  let lastStart = Date.now();

  recognition.onresult = (event) => {
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const alternatives = [];
      for (let a = 0; a < result.length; a += 1) alternatives.push(result[a].transcript);
      onResult?.({
        transcript: alternatives[0] || '',
        alternatives,
        isFinal: result.isFinal,
      });
    }
  };

  recognition.onerror = (event) => {
    const reason =
      event?.error === 'not-allowed' || event?.error === 'service-not-allowed'
        ? 'denied'
        : event?.error === 'no-speech'
          ? 'no_speech'
          : 'failed';
    // A refused microphone never becomes available by asking again. Anything
    // other than a silence timeout ends the session instead of retrying, or
    // the restart loop below would spin for as long as the screen is open.
    if (reason !== 'no_speech') stopped = true;
    onError?.(reason);
  };

  recognition.onend = () => {
    // Chrome ends the session on its own every so often; restart unless the
    // caller asked us to stop — with a ceiling, so a browser that fails
    // instantly can never spin.
    if (stopped) {
      onEnd?.();
      return;
    }
    if (Date.now() - lastStart < 400) restarts += 1;
    else restarts = 0;
    if (restarts > 4) {
      stopped = true;
      onError?.('failed');
      onEnd?.();
      return;
    }
    try {
      lastStart = Date.now();
      recognition.start();
    } catch {
      onEnd?.();
    }
  };

  try {
    recognition.start();
  } catch {
    onError?.('failed');
  }

  return () => {
    stopped = true;
    try {
      recognition.stop();
    } catch {
      /* already stopped */
    }
  };
}
