import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVIDERS, pickProvider } from '../server/ttsProviders.mjs';

/**
 * Tests every speech provider against a stub that imitates the real API.
 *
 * The point is not the audio — it is what happens when things go wrong, since
 * that is where users end up. A rate limit must not throw away the clips
 * already paid for; a rejected voice must be swapped, but only if it was our
 * guess and not the user's choice; a key must never be sent to the wrong
 * provider's endpoint.
 */

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const OUT_DIR = join(ROOT, 'public', 'audio');
const LOG = join(ROOT, '.tts-stub-log.jsonl');
const PORT = 9931;
const BASE = `http://127.0.0.1:${PORT}`;

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Starts the stub in its own process and waits until it is actually listening. */
async function startStub(mode) {
  rmSync(LOG, { force: true });
  writeFileSync(LOG, '');
  const child = spawn(process.execPath, [join(here, 'tts-stub.mjs'), mode, String(PORT), LOG], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    child.stdout.once('data', resolve);
    child.once('error', reject);
    setTimeout(() => reject(new Error('stub did not start')), 5000).unref();
  });
  return child;
}

function stopStub(child) {
  child.kill();
  return new Promise((done) => child.once('exit', done));
}

function requests() {
  return readFileSync(LOG, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/** Runs the real generator against the stub and returns its output. */
function generate(env = {}) {
  const clean = {
    ...process.env,
    TTS_PROVIDER: '',
    TTS_VOICE_AR: '',
    TTS_MODEL_AR: '',
    TTS_BASE_URL: BASE,
  };
  for (const name of ['GROQ_API_KEY', 'AZURE_SPEECH_KEY', 'ELEVENLABS_API_KEY', 'GOOGLE_TTS_API_KEY']) {
    delete clean[name];
  }
  try {
    return { code: 0, out: execFileSync(process.execPath, [join(here, 'generate-audio.mjs')], {
      env: { ...clean, ...env },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }) };
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout || ''}${error.stderr || ''}` };
  }
}

function manifest() {
  const path = join(OUT_DIR, 'manifest.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

function fresh() {
  rmSync(OUT_DIR, { recursive: true, force: true });
}

async function scenario(mode, run) {
  const stub = await startStub(mode);
  try {
    await run();
  } finally {
    await stopStub(stub);
  }
}

console.log('speech providers\n');

// ---- each provider speaks its own API's dialect ------------------------------
await scenario('ok', async () => {
  fresh();
  generate({ AZURE_SPEECH_KEY: 'azure-key', AZURE_SPEECH_REGION: 'westeurope' });
  const [first] = requests();
  check('azure posts SSML with an Iraqi voice', /<speak/.test(first.body) && /ar-IQ-RanaNeural/.test(first.body));
  check('azure sends the subscription key header', first.headers['ocp-apim-subscription-key'] === 'azure-key');
  check('azure asks for mp3', /mp3/.test(first.headers['x-microsoft-outputformat'] || ''));
  check('azure clips are recorded as .mp3', Object.values(manifest()).every((url) => url.endsWith('.mp3')));
});

await scenario('ok', async () => {
  fresh();
  const result = generate({ ELEVENLABS_API_KEY: 'el-key' });
  const all = requests();
  const [first] = all;
  check('elevenlabs asks the account which voices it has', first.url.endsWith('/v1/voices'));
  check('elevenlabs picks a multilingual voice for Arabic', all[1].url.includes('multi456'), all[1].url);
  check('and names it in the output', /Layla/.test(result.out), result.out.slice(0, 200));
  check('elevenlabs uses the xi-api-key header', all[1].headers['xi-api-key'] === 'el-key');
  check('elevenlabs sends a model id', String(JSON.parse(all[1].body).model_id).startsWith('eleven_'));

  fresh();
  const chosen = generate({ ELEVENLABS_API_KEY: 'el-key', TTS_VOICE_AR: 'my-own-voice' });
  check('a voice you set is used as-is, with no lookup', /my-own-voice/.test(chosen.out));
});

await scenario('google', async () => {
  fresh();
  const result = generate({ GOOGLE_TTS_API_KEY: 'g-key' });
  const [first] = requests();
  check('google passes the key as a query param', first.url.includes('key=g-key'));
  check('google requests MP3', JSON.parse(first.body).audioConfig?.audioEncoding === 'MP3');
  check('google base64 is decoded into the file', /124 generated/.test(result.out), result.out.slice(-120));
});

await scenario('ok', async () => {
  fresh();
  generate({ GROQ_API_KEY: 'gsk_x' });
  const [first] = requests();
  check('groq uses a bearer token', first.headers.authorization === 'Bearer gsk_x');
  check('groq asks for wav', JSON.parse(first.body).response_format === 'wav');
});

// ---- a rate limit must not destroy what was already generated ----------------
await scenario('cap', async () => {
  fresh();
  const result = generate({ GROQ_API_KEY: 'gsk_x' });
  const files = manifest();
  check('a daily cap still writes a manifest', files !== null);
  check('clips made before the cap are kept', Object.keys(files || {}).length === 5, `${Object.keys(files || {}).length}`);
  check('it says the run can be continued later', /continues from here/.test(result.out));
  check('it explains the 100-a-day limit', /100 clips per day/.test(result.out));
  check('a rate limit is not treated as a crash', result.code === 0, `exit ${result.code}`);
  check('it says the rest fall back to the browser voice', /browser voice/.test(result.out));

  // Where a quota runs out decides what has audio. Bleeding and CPR must be
  // covered before burns, or a capped run protects the wrong emergencies.
  const covered = Object.keys(files || {});
  check(
    'the quota is spent on the most serious cases first',
    covered.every((clip) => clip.startsWith('severe_external_bleeding/')),
    covered.join(', '),
  );
});

// ---- a short rate limit is waited out, not surrendered to --------------------
await scenario('slow', async () => {
  fresh();
  const result = generate({ GROQ_API_KEY: 'gsk_x' });
  check('a one-second limit is waited out', /waiting 1s/.test(result.out));
  check('and the run then completes', /124 generated/.test(result.out), result.out.slice(-120));
});

// ---- a rejected voice: ours is swapped, yours is not ------------------------
await scenario('badvoice', async () => {
  fresh();
  const result = generate({ GROQ_API_KEY: 'gsk_x' });
  check('a rejected default voice is swapped automatically', /using "aisha" instead/.test(result.out));
  check('and the run completes anyway', /124 generated/.test(result.out));

  fresh();
  const chosen = generate({ GROQ_API_KEY: 'gsk_x', TTS_VOICE_AR: 'noura' });
  check('a voice you chose yourself is never swapped', /does not exist/.test(chosen.out));
  check('and you are told the valid names', /fahad, sultan, aisha/.test(chosen.out));
});

// ---- a free plan that lists voices it will not let you use ------------------
await scenario('freeplan', async () => {
  fresh();
  const result = generate({ ELEVENLABS_API_KEY: 'el-key' });
  check('a voice the account owns is preferred over a library one', /My Voice/.test(result.out), result.out.slice(0, 300));
  check(
    'the refused library voice is never used for a clip',
    !requests().some((request) => request.url.includes('library1')),
  );
  check('so the run completes on a free plan', /124 generated/.test(result.out), result.out.slice(-120));
});

await scenario('noneusable', async () => {
  fresh();
  const result = generate({ ELEVENLABS_API_KEY: 'el-key', GROQ_API_KEY: 'gsk_x' });
  check('no usable voice stops before spending the quota', /124 generated/.test(result.out) === false);
  check('the plan limit is explained, not just echoed', /free plan|Free ElevenLabs/i.test(result.out));
  check('and the key you already have is offered', /TTS_PROVIDER=groq/.test(result.out), result.out.slice(-300));
});

// ---- account-level failures stop at the first clip --------------------------
await scenario('terms', async () => {
  fresh();
  const result = generate({ GROQ_API_KEY: 'gsk_x' });
  check('terms acceptance stops at the first clip', requests().length === 1, `${requests().length} calls`);
  check('and prints the playground link', /console\.groq\.com\/playground/.test(result.out));
});

await scenario('denied', async () => {
  fresh();
  const result = generate({ AZURE_SPEECH_KEY: 'wrong', AZURE_SPEECH_REGION: 'westeurope' });
  check('a rejected key stops immediately', requests().length === 1, `${requests().length} calls`);
  check('and azure gets region-specific advice', /AZURE_SPEECH_REGION/.test(result.out));
});

// ---- clips are never generated twice, even across providers -----------------
await scenario('ok', async () => {
  fresh();
  generate({ AZURE_SPEECH_KEY: 'azure-key' });
  const afterAzure = requests().length;
  const second = generate({ GROQ_API_KEY: 'gsk_x' });
  check('existing clips are reused, not regenerated', requests().length === afterAzure, `${requests().length - afterAzure} extra calls`);
  check('and the run says so', /124 already present/.test(second.out), second.out.slice(-120));
  check('the manifest still points at real files', Object.values(manifest()).every((url) => existsSync(join(ROOT, 'public', url.replace('/audio/', 'audio/')))));
});

// ---- selection rules --------------------------------------------------------
check('an explicit TTS_PROVIDER wins', pickProvider({ TTS_PROVIDER: 'google', GROQ_API_KEY: 'x' })?.id === 'google');
check('a dedicated speech key beats the classifier key', pickProvider({ GROQ_API_KEY: 'x', AZURE_SPEECH_KEY: 'y' })?.id === 'azure');
check('no keys means no provider', pickProvider({}) === null);
check(
  'an unknown provider name is rejected clearly',
  (() => {
    try {
      pickProvider({ TTS_PROVIDER: 'siri' });
      return false;
    } catch (error) {
      return /not one of/.test(error.message);
    }
  })(),
);
check('every provider says where to get a key', Object.values(PROVIDERS).every((p) => p.docs && p.keyEnv && p.extension));

fresh();
mkdirSync(OUT_DIR, { recursive: true });
rmSync(LOG, { force: true });

console.log(failures ? `\n${failures} failed.` : '\nAll speech-provider checks passed.');
process.exit(failures ? 1 : 0);
