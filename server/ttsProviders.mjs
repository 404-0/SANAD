/**
 * Text-to-speech providers, behind one interface.
 *
 * This exists because the choice is genuinely situational and cannot be made
 * once for everybody: Groq's free tier stops at 100 clips a day (SANAD needs
 * 124), Azure gives 500k characters a month for free and is the only one here
 * with an Iraqi voice rather than Modern Standard Arabic, ElevenLabs sounds the
 * best but its free tier forbids commercial use, and Google needs billing
 * switched on. Whichever you pick, the app is unaffected — this runs at build
 * time and produces the same files.
 *
 * Each provider exposes:
 *   id, label, keyEnv, docs   — identity and where to get a key
 *   defaults(lang)            — { model, voice } used when you set neither
 *   extension                 — what the returned audio actually is
 *   speak(options)            — Buffer of audio, or throws a classified error
 *
 * Thrown errors carry { status, code, retryAfter, voices } where the API gives
 * them, so the caller can wait out a rate limit or swap a rejected voice
 * instead of dumping a stack trace on someone who just wants audio.
 */

/** Reads an error response once and turns it into something actionable. */
async function classify(response) {
  const detail = await response.text().catch(() => '');
  let body = null;
  try {
    body = JSON.parse(detail);
  } catch {
    /* plain-text error — the raw string is all there is */
  }

  const message =
    body?.error?.message ||
    body?.detail?.message ||
    body?.message ||
    detail.slice(0, 300) ||
    `HTTP ${response.status}`;

  const error = new Error(message);
  error.status = response.status;
  error.code = body?.error?.code || body?.detail?.status || body?.error?.status || null;

  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfter = retryAfter;

  // "voice must be one of the following voices: [a b c]" — providers word this
  // differently, so the list is pulled out here rather than in each adapter.
  const list = /voices?:\s*\[([^\]]+)\]/i.exec(message);
  if (list) {
    error.voices = list[1]
      .split(/[\s,]+/)
      .map((name) => name.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }
  return error;
}

/** XML-escapes text going into Azure's SSML body. */
function escapeXml(text) {
  return text.replace(/[<>&'"]/g, (char) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char],
  );
}

const groq = {
  id: 'groq',
  label: 'Groq',
  keyEnv: 'GROQ_API_KEY',
  docs: 'https://console.groq.com/keys',
  extension: 'wav',
  // Free tier: 100 requests per DAY on Orpheus. SANAD is 124 Arabic clips, so a
  // free key needs two runs on two days — the script stops cleanly and resumes.
  note: 'free tier: 100 clips/day, so a full run takes two days',
  defaults: (lang) => ({
    model: lang === 'ar' ? 'canopylabs/orpheus-arabic-saudi' : 'canopylabs/orpheus-v1-english',
    voice: lang === 'ar' ? 'noura' : 'hannah',
  }),
  preferredVoices: ['noura', 'aisha', 'lulwa', 'amira', 'hannah'],
  /**
   * Groq has no endpoint that lists voices, but it will tell you the valid
   * names when you send an invalid one — so that is the list. Asking beats
   * hard-coding names that change with the model.
   */
  async listVoices({ key, baseUrl, lang, model }) {
    try {
      await groq.speak({ text: 'x', model, voice: '__which_voices__', key, baseUrl, lang });
      return [];
    } catch (error) {
      return (error.voices || []).map((id) => ({ id, name: id }));
    }
  },
  async speak({ text, model, voice, key, baseUrl }) {
    const base = baseUrl || process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
    const response = await fetch(`${base}/audio/speech`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, voice, input: text, response_format: 'wav' }),
    });
    if (!response.ok) throw await classify(response);
    return Buffer.from(await response.arrayBuffer());
  },
};

const azure = {
  id: 'azure',
  label: 'Azure Speech',
  keyEnv: 'AZURE_SPEECH_KEY',
  docs: 'https://portal.azure.com — create a "Speech service" resource, free F0 tier',
  extension: 'mp3',
  note: '500k characters/month free, and the only Iraqi Arabic voice here',
  // ar-IQ is Iraqi Arabic. Every other provider on this list speaks Modern
  // Standard Arabic, which is correct but not how anyone gives instructions.
  defaults: (lang) => ({
    model: null,
    voice: lang === 'ar' ? 'ar-IQ-RanaNeural' : 'en-US-JennyNeural',
  }),
  preferredVoices: ['ar-IQ-RanaNeural', 'ar-IQ-BassemNeural'],
  async listVoices({ key, baseUrl, lang }) {
    const region = process.env.AZURE_SPEECH_REGION || 'eastus';
    const base = baseUrl || `https://${region}.tts.speech.microsoft.com`;
    const response = await fetch(`${base}/cognitiveservices/voices/list`, {
      headers: { 'ocp-apim-subscription-key': key },
    });
    if (!response.ok) throw await classify(response);
    const wanted = lang === 'ar' ? 'ar-' : 'en-';
    return (await response.json())
      .filter((voice) => voice.Locale?.startsWith(wanted))
      // Iraqi first — that is the point of using Azure for this app at all.
      .sort((a, b) => Number(b.Locale === 'ar-IQ') - Number(a.Locale === 'ar-IQ'))
      .map((voice) => ({
        id: voice.ShortName,
        name: `${voice.LocalName || voice.DisplayName} · ${voice.Locale} · ${voice.Gender}`,
      }));
  },
  async speak({ text, voice, key, lang, baseUrl }) {
    const region = process.env.AZURE_SPEECH_REGION || 'eastus';
    const base = baseUrl || `https://${region}.tts.speech.microsoft.com`;
    const locale = voice.split('-').slice(0, 2).join('-') || (lang === 'ar' ? 'ar-IQ' : 'en-US');
    const ssml =
      `<speak version="1.0" xml:lang="${locale}">` +
      `<voice name="${voice}"><prosody rate="-8%">${escapeXml(text)}</prosody></voice>` +
      `</speak>`;

    const response = await fetch(`${base}/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'ocp-apim-subscription-key': key,
        'content-type': 'application/ssml+xml',
        'x-microsoft-outputformat': 'audio-24khz-48kbitrate-mono-mp3',
        'user-agent': 'sanad',
      },
      body: ssml,
    });
    if (!response.ok) throw await classify(response);
    return Buffer.from(await response.arrayBuffer());
  },
};

const elevenlabs = {
  id: 'elevenlabs',
  label: 'ElevenLabs',
  keyEnv: 'ELEVENLABS_API_KEY',
  docs: 'https://elevenlabs.io/app/settings/api-keys',
  extension: 'mp3',
  note: 'best quality; free tier is ~10k characters/month and bars commercial use',
  // Worth stating plainly: the API rejects these with a 400 that reads like a
  // malformed request, so without this it looks like a bug in SANAD.
  planLimit:
    'Free ElevenLabs keys can only use voices your own account owns. The well-known\n' +
    'default voices count as "library" voices and are refused over the API, whatever\n' +
    'the web app lets you play.',
  defaults: () => ({
    model: process.env.TTS_MODEL_EL || 'eleven_multilingual_v2',
    // A voice ID, not a name. This is ElevenLabs' long-standing default voice.
    voice: '21m00Tcm4TlvDq8ikWAM',
  }),
  preferredVoices: [],
  /**
   * ElevenLabs voices are opaque IDs and which ones a key may use depends on
   * the plan: free keys are refused "library" voices, which includes most of
   * the famous defaults. Listing the account's voices is not enough, because
   * the list contains voices the same key cannot actually synthesise with.
   *
   * So this asks, then tries: one word per candidate until one is accepted.
   * A few dozen characters spent here beats 124 identical failures.
   */
  async listVoices({ key, baseUrl }) {
    const base = baseUrl || 'https://api.elevenlabs.io';
    const response = await fetch(`${base}/v1/voices`, { headers: { 'xi-api-key': key } });
    if (!response.ok) throw await classify(response);
    return ((await response.json())?.voices || []).map((voice) => ({
      id: voice.voice_id,
      name: `${voice.name}${voice.category ? ` · ${voice.category}` : ''}`,
    }));
  },
  async resolveVoice({ key, baseUrl, lang, probe }) {
    const base = baseUrl || 'https://api.elevenlabs.io';
    const response = await fetch(`${base}/v1/voices`, { headers: { 'xi-api-key': key } });
    if (!response.ok) throw await classify(response);

    const voices = (await response.json())?.voices || [];
    if (!voices.length) return null;

    // Voices the account owns are the ones a free key is allowed to use;
    // multilingual ones handle Arabic best. Both are preferences, not rules —
    // the probe decides.
    const score = (voice) =>
      (/cloned|generated|professional/i.test(voice.category || '') ? 2 : 0) +
      (/multilingual|turbo|flash/i.test((voice.high_quality_base_model_ids || []).join(' ')) ? 1 : 0);
    const ordered = [...voices].sort((a, b) => score(b) - score(a));

    if (!probe) return { id: ordered[0].voice_id, name: ordered[0].name };

    const refusals = [];
    for (const voice of ordered.slice(0, 6)) {
      const outcome = await probe({ id: voice.voice_id, name: voice.name });
      if (outcome.ok) return { id: voice.voice_id, name: voice.name };
      refusals.push(`${voice.name}: ${outcome.message}`);
    }
    const error = new Error(`no voice on this key could be used.\n    ${refusals.join('\n    ')}`);
    error.noUsableVoice = true;
    throw error;
  },
  async speak({ text, model, voice, key, baseUrl }) {
    const base = baseUrl || 'https://api.elevenlabs.io';
    const response = await fetch(
      `${base}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({ text, model_id: model }),
      },
    );
    if (!response.ok) throw await classify(response);
    return Buffer.from(await response.arrayBuffer());
  },
};

const google = {
  id: 'google',
  label: 'Google Cloud',
  keyEnv: 'GOOGLE_TTS_API_KEY',
  docs: 'https://console.cloud.google.com/apis/credentials — enable the Text-to-Speech API',
  extension: 'mp3',
  note: 'large free monthly quota but billing must be enabled; Arabic is MSA (ar-XA)',
  defaults: (lang) => ({
    model: null,
    voice: lang === 'ar' ? 'ar-XA-Wavenet-A' : 'en-US-Wavenet-F',
  }),
  preferredVoices: ['ar-XA-Wavenet-A', 'ar-XA-Wavenet-D'],
  async listVoices({ key, baseUrl, lang }) {
    const base = baseUrl || 'https://texttospeech.googleapis.com';
    const code = lang === 'ar' ? 'ar-XA' : 'en-US';
    const response = await fetch(
      `${base}/v1/voices?languageCode=${code}&key=${encodeURIComponent(key)}`,
    );
    if (!response.ok) throw await classify(response);
    return ((await response.json())?.voices || []).map((voice) => ({
      id: voice.name,
      name: `${voice.name} · ${voice.ssmlGender}`,
    }));
  },
  async speak({ text, voice, key, lang, baseUrl }) {
    const base = baseUrl || 'https://texttospeech.googleapis.com';
    const languageCode = voice.split('-').slice(0, 2).join('-') || (lang === 'ar' ? 'ar-XA' : 'en-US');
    const response = await fetch(`${base}/v1/text:synthesize?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode, name: voice },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 0.95 },
      }),
    });
    if (!response.ok) throw await classify(response);
    const body = await response.json();
    if (!body.audioContent) throw new Error('Google returned no audioContent');
    return Buffer.from(body.audioContent, 'base64');
  },
};

export const PROVIDERS = { azure, elevenlabs, google, groq };

/**
 * Picks the provider to use.
 *
 * An explicit TTS_PROVIDER always wins. Otherwise the first key present in this
 * order is used — dedicated speech services before Groq, whose key is really
 * there for the classifier and whose free speech quota is too small for a full
 * run.
 */
export function pickProvider(env = process.env) {
  const wanted = (env.TTS_PROVIDER || '').trim().toLowerCase();
  if (wanted) {
    const chosen = PROVIDERS[wanted];
    if (!chosen) {
      throw new Error(
        `TTS_PROVIDER="${wanted}" is not one of: ${Object.keys(PROVIDERS).join(', ')}`,
      );
    }
    return chosen;
  }
  const order = [azure, elevenlabs, google, groq];
  return order.find((provider) => env[provider.keyEnv]) || null;
}

/** One line per provider, for help text and `npm run check`. */
export function describeProviders() {
  return Object.values(PROVIDERS).map(
    (provider) => `  ${provider.id.padEnd(11)} ${provider.keyEnv.padEnd(20)} ${provider.note}`,
  );
}
