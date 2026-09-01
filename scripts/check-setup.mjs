import { loadEnv, describeMissingKey } from '../server/loadEnv.mjs';
import { listGroqModels } from '../server/providers.mjs';
import { pickProvider, describeProviders } from '../server/ttsProviders.mjs';

/**
 * `npm run check` — answers "why isn't my key working?" in one command.
 *
 * Reports where the .env was found, which keys it contains (names only, never
 * values), which provider that selects, and whether the model and TTS voice
 * actually exist on that key.
 */
const ENV = loadEnv({ quiet: true });

/**
 * Asks the chosen speech provider for one word of audio.
 *
 * Being listed is not the same as being usable — a model can need a one-time
 * terms click, a voice name can have been retired, a region can be wrong. One
 * word here costs nothing and saves discovering it 100 clips into a run.
 */
async function checkSpeech() {
  let speech;
  try {
    speech = pickProvider();
  } catch (error) {
    console.log(`\nvoice:       ${error.message}`);
    return;
  }

  if (!speech) {
    console.log('\nvoice:       no speech key set — read-aloud uses the browser voice.');
    console.log('             Set ONE of these for real audio:');
    console.log(describeProviders().join('\n'));
    return;
  }

  const lang = (process.env.TTS_LANGS || 'ar').split(',')[0].trim() || 'ar';
  const fallback = speech.defaults(lang);
  const voice = process.env[`TTS_VOICE_${lang.toUpperCase()}`] || fallback.voice;
  const model = process.env[`TTS_MODEL_${lang.toUpperCase()}`] || fallback.model;

  console.log(`\nvoice:       ${speech.label} · ${voice}${model ? ` · ${model}` : ''}`);
  console.log(`             ${speech.note}`);

  try {
    const audio = await speech.speak({
      text: lang === 'ar' ? 'مرحبا' : 'hello',
      lang,
      model,
      voice,
      key: process.env[speech.keyEnv],
      baseUrl: process.env.TTS_BASE_URL || null,
    });
    console.log(`             ready — returned ${audio.length} bytes. Run: npm run tts`);
  } catch (error) {
    if (error.code === 'model_terms_required') {
      console.log('             needs a ONE-TIME terms click:');
      console.log(`               https://console.groq.com/playground?model=${encodeURIComponent(model || '')}`);
      console.log('             Accept there (free), then run: npm run tts');
    } else if (error.voices?.length) {
      console.log(`             voice "${voice}" is not offered. Available: ${error.voices.join(', ')}`);
      console.log(`             npm run tts picks one automatically; set TTS_VOICE_${lang.toUpperCase()} to choose.`);
    } else if (error.status === 401 || error.status === 403) {
      console.log(`             the ${speech.keyEnv} was rejected (${error.status}).`);
      if (speech.id === 'azure') {
        console.log(`             Check AZURE_SPEECH_REGION (currently "${process.env.AZURE_SPEECH_REGION || 'eastus'}")`);
        console.log('             matches the region of your Speech resource in the Azure portal.');
      } else {
        console.log(`             Get a key at: ${speech.docs}`);
      }
    } else if (error.status === 429) {
      console.log('             rate limited right now — the quota is used up or you are going too fast.');
      console.log('             npm run tts saves as it goes, so it can be finished later.');
    } else {
      console.log(`             returned: ${String(error.message).slice(0, 160)}`);
      console.log('             Read-aloud still works using the browser voice.');
    }
  }
}

console.log('SANAD setup check\n' + '='.repeat(40));

for (const entry of ENV.files ?? []) {
  console.log(`\n.env found:  ${entry.path}`);
  console.log(`keys in it:  ${entry.keys.join(', ') || '(nothing usable here)'}`);
}

// A key exported in the shell is just as valid as one in a file, and the
// loader deliberately leaves it alone — so ask the environment, not the files.
const shellKey = !ENV.keys.length && (process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY);
if (shellKey) console.log('\nkey source:  the shell environment (no .env needed)');

// A file that exists but yields nothing is the confusing case — the user is
// sure they created it — so say what is wrong with its contents, not just
// "no key found".
if (!ENV.keys.length && !shellKey) {
  if (ENV.files?.length) {
    console.log('\nThe file is there but no classifier key is in it. Most often that means:');
    console.log('  - the value is still the "gsk_..." placeholder from .env.example');
    console.log('  - the line is commented out with a leading #');
    console.log('  - the key name is misspelled (it must be exactly GROQ_API_KEY)');
  } else {
    console.log('\n' + describeMissingKey(ENV.searched));
  }
  console.log('\nThe app still works without a key: classification falls back to the');
  console.log('offline matcher, and read-aloud uses the browser voice.');
  // Speech is a separate account, so a speech-only setup still gets checked
  // rather than being written off with the classifier.
  await checkSpeech();
  process.exit(0);
}

const provider =
  process.env.SANAD_PROVIDER ||
  (process.env.GROQ_API_KEY ? 'groq' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'mock');
const model = process.env.SANAD_MODEL || (provider === 'groq' ? 'openai/gpt-oss-120b' : 'claude-sonnet-4-5');

console.log(`provider:    ${provider}`);
console.log(`model:       ${provider === 'mock' ? '—' : model}`);

// Speech is a separate account from the classifier, so it is reported
// separately — "the key works" is not an answer to "why is there no audio".
await checkSpeech();

if (provider !== 'groq') {
  console.log('\nNothing else to check for this provider.');
  process.exit(0);
}

const key = process.env.GROQ_API_KEY;
if (!/^gsk_/.test(key || '')) {
  console.log('\nWARNING: a Groq key normally starts with "gsk_". Check you pasted the whole thing.');
}

try {
  const models = await listGroqModels({ apiKey: key, baseUrl: process.env.GROQ_BASE_URL });
  console.log(`\nThe key works — ${models.length} models available.`);

  console.log(model in Object.fromEntries(models.map((id) => [id, true]))
    ? `  chat model "${model}" is available`
    : `  chat model "${model}" is NOT available — set SANAD_MODEL to one of:\n    ${models
        .filter((id) => /llama|gpt-oss|qwen|minimax/i.test(id) && !/whisper|guard|tts/i.test(id))
        .slice(0, 6)
        .join('\n    ')}`);

} catch (error) {
  console.log(`\nThe key was REJECTED by Groq (${error.message}).`);
  console.log('Check for a typo, a missing character, or a key that has been revoked.');
  process.exit(1);
}
