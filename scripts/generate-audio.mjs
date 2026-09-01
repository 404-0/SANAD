import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRegistry } from '../src/engine/flowRegistry.js';
import { homeSort } from '../src/config/uiOrder.js';
import { loadEnv, describeMissingKey } from '../server/loadEnv.mjs';
import { PROVIDERS, pickProvider, describeProviders } from '../server/ttsProviders.mjs';

/**
 * Pre-renders every spoken line to an audio file, once, at build time.
 *
 * The browser's built-in Arabic voice is bad almost everywhere — on desktop
 * Linux and Windows it is a robotic drone that undermines the whole app. The
 * flows are static, so there is no reason to synthesise at runtime: generate
 * each line once with a real voice, ship the files, and play them instantly.
 * That also makes read-aloud work with no network, which matters more here
 * than it does anywhere else.
 *
 *   npm run tts            # generate what is missing
 *   npm run tts -- --force # regenerate everything
 *
 * The provider comes from whichever key you have (see server/ttsProviders.mjs).
 * With no key it exits quietly and the app uses the browser voice as before.
 *
 * Nothing here is all-or-nothing. Every clip is written and recorded as it
 * succeeds, so a rate limit, a dropped connection or a Ctrl-C leaves you with
 * working audio for everything generated so far, and the next run continues
 * from there.
 */

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const OUT_DIR = join(ROOT, 'public', 'audio');
const FLOW_DIR = join(ROOT, 'src', 'data', 'flows');

const ENV = loadEnv();
const FORCE = process.argv.includes('--force');
const LANGS = (process.env.TTS_LANGS || 'ar').split(',').map((lang) => lang.trim()).filter(Boolean);
const KNOWN_EXTENSIONS = ['wav', 'mp3'];

let provider;
try {
  provider = pickProvider();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

if (!provider) {
  console.log('Skipping audio generation — the app will use the browser voice.\n');
  console.log(describeMissingKey(ENV.searched));
  console.log('\nFor speech specifically you can use any of these — set ONE key:');
  console.log(describeProviders().join('\n'));
  process.exit(0);
}

const KEY = process.env[provider.keyEnv];
const BASE_URL = process.env.TTS_BASE_URL || null;

// Explicit settings are never second-guessed; defaults are treated as a guess
// that the API is allowed to correct.
const settings = {};
for (const lang of LANGS) {
  const fallback = provider.defaults(lang);
  const upper = lang.toUpperCase();
  settings[lang] = {
    model: process.env[`TTS_MODEL_${upper}`] || fallback.model,
    voice: process.env[`TTS_VOICE_${upper}`] || fallback.voice,
    voiceChosen: Boolean(process.env[`TTS_VOICE_${upper}`]),
  };
}

// Some providers can tell us which voices the account really has — and, where
// being listed is not the same as being allowed, try them. Asking once beats
// failing 124 times with an opaque ID.
if (provider.resolveVoice) {
  for (const lang of LANGS) {
    if (settings[lang].voiceChosen) continue;
    try {
      const resolved = await provider.resolveVoice({
        key: KEY,
        baseUrl: BASE_URL,
        lang,
        probe: async ({ id, name }) => {
          try {
            await provider.speak({
              text: lang === 'ar' ? 'مرحبا' : 'hello',
              lang,
              model: settings[lang].model,
              voice: id,
              key: KEY,
              baseUrl: BASE_URL,
            });
            return { ok: true };
          } catch (error) {
            console.log(`  voice "${name}" is not usable on this key`);
            return { ok: false, message: error.message };
          }
        },
      });
      if (resolved?.id) {
        settings[lang].voice = resolved.id;
        settings[lang].voiceLabel = resolved.name;
      }
    } catch (error) {
      // Never silent: a failed lookup is exactly the thing the next 124 errors
      // will be about, so say it now.
      console.log(`  could not choose a voice automatically — ${error.message}`);
      if (error.noUsableVoice) {
        if (provider.planLimit) console.log(`\n${provider.planLimit}`);
        console.log(`\n${suggestAnotherProvider()}`);
        process.exit(1);
      }
    }
  }
}

console.log(`  provider: ${provider.label} (${provider.note})`);
for (const lang of LANGS) {
  const shown = settings[lang].voiceLabel
    ? `${settings[lang].voiceLabel} (${settings[lang].voice})`
    : settings[lang].voice;
  console.log(`  ${lang}: voice ${shown}${settings[lang].model ? ` · model ${settings[lang].model}` : ''}`);
}

const registry = createRegistry(
  readdirSync(FLOW_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((fileName) => ({ fileName, data: JSON.parse(readFileSync(join(FLOW_DIR, fileName), 'utf8')) })),
);

/**
 * Most-important flow first.
 *
 * Free tiers run out, and where they run out matters: alphabetical order would
 * spend a daily quota on burns and heat illness and stop before CPR. This is
 * the same ordering the home screen uses, so a half-finished run still has real
 * audio for the cases where someone is dying.
 */
function orderedFlows() {
  return [...registry.list()].sort(homeSort);
}

/** Exactly what the app reads out: the step, then its detail. */
function linesFor(node, lang) {
  const pick = (pair) => (pair ? pair[lang] || null : null);
  return [pick(node.question) || pick(node.title), pick(node.description)].filter(Boolean).join(' ');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Recovers from a rejected voice name without making the user edit anything.
 *
 * Only a default is replaced. If you set the voice yourself, silently using a
 * different one would be worse than stopping — you asked for that voice.
 */
function recoverVoice(error, lang) {
  const options = error.voices || [];
  if (!options.length) return false;

  const setting = settings[lang];
  if (setting.voiceChosen) {
    console.error(`\nThe voice "${setting.voice}" does not exist on ${provider.label}.`);
    console.error(`Valid voices: ${options.join(', ')}`);
    console.error(`Set TTS_VOICE_${lang.toUpperCase()} in your .env to one of them, then run "npm run tts" again.`);
    process.exit(1);
  }

  const pick = (provider.preferredVoices || []).find((name) => options.includes(name)) || options[0];
  console.log(`  voice "${setting.voice}" is not offered — using "${pick}" instead.`);
  console.log(`  (set TTS_VOICE_${lang.toUpperCase()} to choose: ${options.join(', ')})`);
  setting.voice = pick;
  setting.voiceChosen = true; // one swap only — a second rejection is a real error
  return true;
}

/**
 * When one provider is refusing to work, the fastest fix is usually a key the
 * user already has. This names it, with the exact line to add.
 */
function suggestAnotherProvider() {
  const others = Object.values(PROVIDERS).filter(
    (candidate) => candidate.id !== provider.id && process.env[candidate.keyEnv],
  );
  if (others.length) {
    return [
      'You already have a key for another provider. To use it, add this line to your .env:',
      ...others.map((candidate) => `  TTS_PROVIDER=${candidate.id}      # ${candidate.note}`),
      '',
      'Then run "npm run tts" again.',
    ].join('\n');
  }
  return ['Other providers you could use instead — set ONE key:', ...describeProviders()].join('\n');
}

/** Failures that will repeat for every remaining line, with what to do about them. */
function fatalAdvice(error, lang) {
  const setting = settings[lang];

  // ElevenLabs' free plan refuses "library" voices — which is most of the
  // famous ones — with a 400 that reads like a bad request rather than a plan
  // limit. Without this it looks like the voice name is wrong.
  if (/library voices|upgrade your subscription/i.test(error.message)) {
    return [
      `${provider.label} will not use this voice on a free plan:`,
      `  ${setting.voiceLabel || setting.voice}`,
      '',
      'Free ElevenLabs keys can only use voices your own account owns, and the',
      'well-known default voices are not among them. Either add a voice you own',
      `in the ElevenLabs app and set TTS_VOICE_${lang.toUpperCase()} to its ID, or use a`,
      'different provider.',
      '',
      suggestAnotherProvider(),
    ].join('\n');
  }

  if (error.code === 'model_terms_required') {
    const model = setting.model || '';
    return [
      `${provider.label} needs you to accept the terms for "${model}" once — the key itself is fine.`,
      '',
      `  1. Open https://console.groq.com/playground?model=${encodeURIComponent(model)}`,
      '  2. Accept the terms shown there (one click, no payment).',
      '  3. Run "npm run tts" again.',
    ].join('\n');
  }

  if (error.status === 401 || error.status === 403) {
    return [
      `${provider.label} rejected the key (${provider.keyEnv}).`,
      'Run "npm run check" to see whether the key itself is valid.',
      provider.id === 'azure'
        ? 'For Azure, also check AZURE_SPEECH_REGION matches the region of your Speech resource.'
        : `Get a key at: ${provider.docs}`,
    ].join('\n');
  }

  if (error.status === 404 && provider.id !== 'elevenlabs') {
    return [
      `${provider.label} has no voice or model by that name.`,
      `Voice: ${setting.voice}${setting.model ? `, model: ${setting.model}` : ''}`,
      `See ${provider.docs}`,
    ].join('\n');
  }

  return null;
}

let made = 0;
let skipped = 0;
let failed = 0;
let rateLimited = false;
const manifest = {};

/** Written after every clip, so an interrupted run still leaves usable audio. */
function saveManifest() {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

function report() {
  saveManifest();
  console.log(`\n${made} generated, ${skipped} already present, ${failed} failed.`);
  console.log(`Manifest: public/audio/manifest.json (${Object.keys(manifest).length} clips)`);
  if (rateLimited) {
    console.log(
      `\nStopped at ${provider.label}'s rate limit. Everything generated so far is saved and`,
    );
    console.log('will be used — run "npm run tts" again later and it continues from here.');
    if (provider.id === 'groq') {
      console.log('Groq\'s free tier allows 100 clips per day; SANAD needs 124, so a free key');
      console.log('finishes on the second day. To do it in one run, set a key for another');
      console.log('provider instead:');
      console.log(describeProviders().filter((line) => !line.includes('groq')).join('\n'));
    }
  }
  const total = countRequested();
  if (Object.keys(manifest).length < total) {
    console.log(`\n${total - Object.keys(manifest).length} lines still have no clip — those steps`);
    console.log('use the browser voice until they do. Nothing is broken.');
  }
}

function countRequested() {
  let total = 0;
  for (const flow of orderedFlows()) {
    for (const node of flow.nodes.values()) {
      for (const lang of LANGS) if (linesFor(node, lang)) total += 1;
    }
  }
  return total;
}

// Ctrl-C mid-run should still leave a valid manifest for what was generated.
process.on('SIGINT', () => {
  console.log('\nInterrupted.');
  report();
  process.exit(0);
});

outer: for (const flow of orderedFlows()) {
  for (const node of flow.nodes.values()) {
    for (const lang of LANGS) {
      const text = linesFor(node, lang);
      if (!text) continue;

      const dir = join(OUT_DIR, flow.id);
      const key = `${flow.id}/${node.id}.${lang}`;

      // A clip made by a different provider has a different extension; reuse it
      // rather than paying to generate the same line twice.
      const existing = KNOWN_EXTENSIONS.map((ext) => ({ ext, path: join(dir, `${node.id}.${lang}.${ext}`) })).find(
        (candidate) => existsSync(candidate.path),
      );
      if (!FORCE && existing) {
        manifest[key] = `/audio/${flow.id}/${node.id}.${lang}.${existing.ext}`;
        skipped += 1;
        continue;
      }

      const file = `${node.id}.${lang}.${provider.extension}`;
      mkdirSync(dir, { recursive: true });

      // Retries only for failures a retry can fix: a rejected default voice,
      // and a rate limit the API told us to wait out.
      let waited = 0;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const audio = await provider.speak({
            text: text.slice(0, 2000),
            lang,
            model: settings[lang].model,
            voice: settings[lang].voice,
            key: KEY,
            baseUrl: BASE_URL,
          });
          writeFileSync(join(dir, file), audio);
          manifest[key] = `/audio/${flow.id}/${file}`;
          made += 1;
          process.stdout.write(`  ${key}\n`);
          if (made % 10 === 0) saveManifest();
          break;
        } catch (error) {
          const advice = fatalAdvice(error, lang);
          if (advice) {
            console.error(`\n${advice}\n`);
            report();
            process.exit(1);
          }

          if (recoverVoice(error, lang)) continue;

          if (error.status === 429) {
            // A short wait means "you are going too fast" and is worth sitting
            // out; a long one means the daily quota is gone and waiting is not
            // a plan. Either way, what is already generated stays usable.
            const wait = error.retryAfter ?? 20;
            if (wait <= 60 && waited + wait <= 180) {
              waited += wait;
              console.log(`  rate limited — waiting ${wait}s (${waited}s so far)`);
              await sleep(wait * 1000);
              continue;
            }
            rateLimited = true;
            break outer;
          }

          failed += 1;
          console.error(`  FAILED ${key}: ${error.message}`);
          if (failed >= 3 && made === 0) {
            console.error('\nGiving up after three failures — this looks like a settings problem.');
            console.error('Run "npm run check" to see what your key can actually use.');
            report();
            process.exit(1);
          }
          break;
        }
      }
    }
  }
}

report();
