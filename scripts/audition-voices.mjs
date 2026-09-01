import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../server/loadEnv.mjs';
import { pickProvider, describeProviders } from '../server/ttsProviders.mjs';

/**
 * `npm run voices` — hear every voice before committing to one.
 *
 * Choosing a voice by reading a name in a table does not work; the only way to
 * know whether a voice sounds like a person calmly telling you what to do is to
 * hear it say one of these sentences. So this asks the provider what voices the
 * key can use, generates the same line with each, and writes a page you open in
 * a browser: play, compare, copy the .env line for the one you want.
 *
 *   npm run voices              # Arabic
 *   npm run voices -- --lang en # English
 *
 * It costs a sentence per voice — a few hundred characters of quota, not the
 * ~9,500 a full run takes.
 */

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const OUT_DIR = join(ROOT, 'public', 'audio', 'samples');

loadEnv();

const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1] || fallback;
};

const LANG = argument('lang', 'ar');
const LIMIT = Number(argument('limit', 12));

// A real instruction, not "hello world": tone under pressure is the thing being
// judged, and a greeting will not reveal it.
const SAMPLE = {
  ar: 'اضغط بقوة على مكان النزف ولا ترفع يدك. اتصل بالإسعاف الآن.',
  en: 'Press hard on the wound and do not lift your hand. Call an ambulance now.',
};

let provider;
try {
  provider = pickProvider();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

if (!provider) {
  console.log('No speech key set, so there are no voices to compare.\n');
  console.log('The app is using your browser\'s built-in voice. You can change that one in');
  console.log('the app itself: Settings > Voice, then press Test.\n');
  console.log('For real recorded audio, set ONE of these keys:');
  console.log(describeProviders().join('\n'));
  process.exit(0);
}

const KEY = process.env[provider.keyEnv];
const BASE_URL = process.env.TTS_BASE_URL || null;
const MODEL = process.env[`TTS_MODEL_${LANG.toUpperCase()}`] || provider.defaults(LANG).model;

console.log(`Auditioning ${provider.label} voices for "${LANG}"…\n`);

let candidates = [];
if (provider.listVoices) {
  try {
    candidates = await provider.listVoices({ key: KEY, baseUrl: BASE_URL, lang: LANG, model: MODEL });
  } catch (error) {
    console.error(`Could not list voices: ${error.message}`);
  }
}
if (!candidates.length) {
  const fallback = provider.defaults(LANG).voice;
  console.log(`No voice list available — trying the default (${fallback}) only.`);
  candidates = [{ id: fallback, name: fallback }];
}

candidates = candidates.slice(0, LIMIT);

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const made = [];
for (const candidate of candidates) {
  try {
    const audio = await provider.speak({
      text: SAMPLE[LANG] || SAMPLE.ar,
      lang: LANG,
      model: MODEL,
      voice: candidate.id,
      key: KEY,
      baseUrl: BASE_URL,
    });
    const file = `${candidate.id.replace(/[^\w.-]/g, '_')}.${provider.extension}`;
    writeFileSync(join(OUT_DIR, file), audio);
    made.push({ ...candidate, file });
    console.log(`  ${candidate.name}`);
  } catch (error) {
    // A voice the key cannot use is expected here, not a failure of the run —
    // finding that out is half the point.
    console.log(`  ${candidate.name} — unavailable (${String(error.message).slice(0, 80)})`);
  }
}

if (!made.length) {
  console.log('\nNone of these voices could be used with this key.');
  process.exit(1);
}

const rows = made
  .map(
    (voice) => `
    <tr>
      <td class="name">${voice.name}</td>
      <td><audio controls preload="none" src="./${voice.file}"></audio></td>
      <td><code>TTS_VOICE_${LANG.toUpperCase()}=${voice.id}</code></td>
    </tr>`,
  )
  .join('');

writeFileSync(
  join(OUT_DIR, 'index.html'),
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>SANAD — choose a voice</title>
<style>
  body { font: 16px/1.6 system-ui, sans-serif; margin: 40px auto; max-width: 900px; padding: 0 20px; color: #1a1a1a; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  p.lead { color: #666; margin-top: 0; }
  table { border-collapse: collapse; width: 100%; margin-top: 24px; }
  td { border-bottom: 1px solid #e6e6e6; padding: 12px 8px; vertical-align: middle; }
  td.name { font-weight: 600; white-space: nowrap; }
  code { background: #f4f4f2; padding: 4px 8px; border-radius: 6px; font-size: 13px; white-space: nowrap; }
  audio { height: 34px; }
</style>
</head>
<body>
  <h1>Choose a voice — ${provider.label}, ${LANG === 'ar' ? 'Arabic' : 'English'}</h1>
  <p class="lead">Each one reads the same real instruction. Pick the calmest and clearest, then put its
  line in your <code>.env</code> and run <code>npm run tts -- --force</code>.</p>
  <table>${rows}</table>
</body>
</html>`,
);

console.log(`\n${made.length} samples written.`);
console.log('Open this file in your browser to compare them:');
console.log(`  ${join(OUT_DIR, 'index.html')}`);
console.log('\nThen put the line shown next to your favourite into .env and run:');
console.log('  npm run tts -- --force');
